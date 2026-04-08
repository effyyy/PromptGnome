/**
 * AES-256-GCM encrypted IndexedDB mapping store for PromptGnome.
 *
 * Persists {@link SessionMapper} state in IndexedDB with AES-256-GCM
 * encryption so that PII placeholder mappings survive page reloads but are
 * never exposed in plaintext at rest.  The encryption key is derived per
 * session from a passphrase stored in `chrome.storage.session` (automatically
 * cleared on browser close).  Entries expire after 24 hours.
 *
 * Architecture layer: Anonymization — encrypted persistence
 * Dependencies: ~src/utils/crypto, ./session-mapper
 */

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import {
  generateSalt,
  generatePassphrase,
  deriveKey,
  encrypt,
  decrypt,
} from "~src/utils/crypto"
import { SessionMapper } from "./session-mapper"
import type { SerializableSessionMap } from "./session-mapper"
import { createLogger } from "~src/utils/logger"

const log = createLogger("encrypted-store")

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** IndexedDB database name. */
const DB_NAME = "pii-shield-maps"

/** Object store name. */
const STORE_NAME = "sessions"

/** Database schema version. */
const DB_VERSION = 1

/** Milliseconds in 24 hours — entries older than this are cleaned up. */
const TTL_MS = 24 * 60 * 60 * 1000

/** chrome.storage.session key for the session encryption passphrase. */
const SESSION_KEY_PASSPHRASE = "encryptionPassphrase"

/** chrome.storage.session key for the salt (stored as a number[]). */
const SESSION_KEY_SALT = "encryptionSalt"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Shape of a record persisted in the "sessions" object store.
 */
interface EncryptedRecord {
  /** The unique session identifier (e.g. "tab:123"). */
  sessionId: string
  /** The AES-GCM ciphertext as a number array (serializable). */
  ciphertext: number[]
  /** The IV used for encryption as a number array (serializable). */
  iv: number[]
  /** Unix timestamp (ms) when this record was created. */
  createdAt: number
}

// ---------------------------------------------------------------------------
// EncryptedMappingStore
// ---------------------------------------------------------------------------

/**
 * Stores and retrieves {@link SessionMapper} instances in IndexedDB using
 * AES-256-GCM encryption.  Each browser session uses a unique passphrase and
 * salt pair, both of which are held in `chrome.storage.session` so they
 * disappear when the browser closes.
 *
 * @example
 * ```ts
 * const store = new EncryptedMappingStore()
 * await store.init()
 *
 * await store.store("tab:42", mapper)
 * const restored = await store.retrieve("tab:42")
 * ```
 */
export class EncryptedMappingStore {
  private db: IDBDatabase | null = null
  private passphrase: string | null = null
  private salt: Uint8Array | null = null

  // -------------------------------------------------------------------------
  // Initialisation
  // -------------------------------------------------------------------------

  /**
   * Opens (or creates) the IndexedDB database and loads the session key
   * material from `chrome.storage.session`.  Must be called before
   * {@link store} or {@link retrieve}.
   *
   * @returns A promise that resolves when the store is ready.
   * @throws If the IndexedDB cannot be opened.
   *
   * @example
   * ```ts
   * const store = new EncryptedMappingStore()
   * await store.init()
   * ```
   */
  async init(): Promise<void> {
    const t0 = performance.now()
    log.info("Initializing encrypted store…")
    await Promise.all([this.openDatabase(), this.loadOrGenerateKeyMaterial()])
    log.info("Encrypted store ready", {
      elapsedMs: (performance.now() - t0).toFixed(2),
      hasExistingKey: this.passphrase !== null,
    })
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Encrypts `mapper` and persists it under `sessionId` in IndexedDB.
   * If a record already exists for `sessionId` it is overwritten.
   *
   * @param sessionId - A unique string identifying the session (e.g. "tab:123").
   * @param mapper - The {@link SessionMapper} to persist.
   * @returns A promise that resolves when the record is stored.
   * @throws If the store has not been initialised or encryption fails.
   *
   * @example
   * ```ts
   * await store.store("tab:123", mapper)
   * ```
   */
  async store(sessionId: string, mapper: SessionMapper): Promise<void> {
    this.assertReady()
    const t0 = performance.now()
    log.info("Encrypting and storing mapping", { sessionId })

    const key = await this.deriveSessionKey()
    const snapshot = mapper.toSerializable()
    let plaintext: string | null = JSON.stringify(snapshot)

    try {
      const { ciphertext, iv } = await encrypt(plaintext, key)

      const record: EncryptedRecord = {
        sessionId,
        ciphertext: Array.from(new Uint8Array(ciphertext)),
        iv: Array.from(iv),
        createdAt: Date.now(),
      }

      await this.idbPut(record)
      log.info("Mapping stored successfully", {
        sessionId,
        ciphertextBytes: record.ciphertext.length,
        elapsedMs: (performance.now() - t0).toFixed(2),
      })
    } finally {
      plaintext = null
    }
  }

  /**
   * Retrieves and decrypts the {@link SessionMapper} stored under `sessionId`.
   * Returns `null` if the session does not exist or decryption fails.
   *
   * @param sessionId - The session identifier used when calling {@link store}.
   * @returns The restored `SessionMapper`, or `null`.
   *
   * @example
   * ```ts
   * const mapper = await store.retrieve("tab:123")
   * if (mapper !== null) { ... }
   * ```
   */
  async retrieve(sessionId: string): Promise<SessionMapper | null> {
    this.assertReady()
    const t0 = performance.now()
    log.info("Retrieving mapping", { sessionId })

    let plaintext: string | null = null

    try {
      const record = await this.idbGet(sessionId)
      if (record === undefined) {
        log.info("No mapping found for session", { sessionId })
        return null
      }

      const key = await this.deriveSessionKey()
      // Pass the Uint8Array directly rather than accessing .buffer, to avoid
      // realm-mismatch issues in jsdom/test environments where ArrayBuffer
      // instances from different VM contexts are not accepted by webcrypto.
      const ciphertextBytes = new Uint8Array(record.ciphertext)
      const iv = new Uint8Array(record.iv)

      plaintext = await decrypt(ciphertextBytes as unknown as ArrayBuffer, key, iv)
      const snapshot = JSON.parse(plaintext) as SerializableSessionMap
      const mapper = SessionMapper.fromSerializable(snapshot)
      log.info("Mapping retrieved and decrypted", {
        sessionId,
        elapsedMs: (performance.now() - t0).toFixed(2),
      })
      return mapper
    } catch {
      log.warn("Mapping retrieval failed — discarding", { sessionId })
      return null
    } finally {
      plaintext = null
    }
  }

  /**
   * Deletes all records whose `createdAt` timestamp is older than 24 hours.
   * Intended to be called periodically from a background alarm.
   *
   * @returns A promise that resolves when the cursor scan completes.
   *
   * @example
   * ```ts
   * await store.cleanup()
   * ```
   */
  async cleanup(): Promise<void> {
    this.assertReady()
    const t0 = performance.now()
    log.info("Running expired mapping cleanup", { ttlHours: TTL_MS / 3_600_000 })
    const cutoff = Date.now() - TTL_MS
    await this.idbDeleteExpired(cutoff)
    log.info("Cleanup complete", { elapsedMs: (performance.now() - t0).toFixed(2) })
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Throws if the store has not been initialised via {@link init}.
   *
   * @throws {Error} When `init()` has not been called.
   */
  private assertReady(): void {
    if (this.db === null || this.passphrase === null || this.salt === null) {
      throw new Error("EncryptedMappingStore: call init() before use")
    }
  }

  /**
   * Derives the AES-256-GCM key from the stored passphrase and salt.
   *
   * @returns A `CryptoKey` suitable for encrypt/decrypt.
   */
  private async deriveSessionKey(): Promise<CryptoKey> {
    // passphrase and salt are guaranteed non-null after assertReady()
    return deriveKey(this.passphrase as string, this.salt as Uint8Array)
  }

  /**
   * Opens (or upgrades) the IndexedDB database.
   *
   * @returns A promise resolving when the database is open.
   */
  private openDatabase(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "sessionId" })
        }
      }

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result
        resolve()
      }

      request.onerror = (event) => {
        reject(new Error(`IndexedDB open failed: ${(event.target as IDBOpenDBRequest).error?.message}`))
      }
    })
  }

  /**
   * Loads existing key material from `chrome.storage.session`, or generates
   * and stores a fresh passphrase and salt for this session.
   *
   * @returns A promise resolving when key material is ready.
   */
  private async loadOrGenerateKeyMaterial(): Promise<void> {
    const stored = await chrome.storage.session.get([
      SESSION_KEY_PASSPHRASE,
      SESSION_KEY_SALT,
    ])

    const storedPassphrase = stored[SESSION_KEY_PASSPHRASE] as string | undefined
    const storedSaltArray = stored[SESSION_KEY_SALT] as number[] | undefined

    if (
      typeof storedPassphrase === "string" &&
      Array.isArray(storedSaltArray)
    ) {
      this.passphrase = storedPassphrase
      this.salt = new Uint8Array(storedSaltArray)
    } else {
      const passphrase = generatePassphrase()
      const salt = generateSalt()
      await chrome.storage.session.set({
        [SESSION_KEY_PASSPHRASE]: passphrase,
        [SESSION_KEY_SALT]: Array.from(salt),
      })
      this.passphrase = passphrase
      this.salt = salt
    }
  }

  /**
   * Wraps an IndexedDB `put` in a promise.
   *
   * @param record - The record to write.
   * @returns A promise resolving when the write completes.
   */
  private idbPut(record: EncryptedRecord): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = (this.db as IDBDatabase).transaction(STORE_NAME, "readwrite")
      const store = tx.objectStore(STORE_NAME)
      const req = store.put(record)
      req.onsuccess = () => resolve()
      req.onerror = (event) => reject((event.target as IDBRequest).error)
    })
  }

  /**
   * Wraps an IndexedDB `get` in a promise.
   *
   * @param sessionId - The key to look up.
   * @returns A promise resolving with the record, or `undefined` if not found.
   */
  private idbGet(sessionId: string): Promise<EncryptedRecord | undefined> {
    return new Promise((resolve, reject) => {
      const tx = (this.db as IDBDatabase).transaction(STORE_NAME, "readonly")
      const store = tx.objectStore(STORE_NAME)
      const req = store.get(sessionId)
      req.onsuccess = (event) => resolve((event.target as IDBRequest).result as EncryptedRecord | undefined)
      req.onerror = (event) => reject((event.target as IDBRequest).error)
    })
  }

  /**
   * Iterates a cursor over all records and deletes those older than `cutoff`.
   *
   * @param cutoff - Unix timestamp in ms; records with `createdAt < cutoff` are deleted.
   * @returns A promise resolving when the scan completes.
   */
  private idbDeleteExpired(cutoff: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = (this.db as IDBDatabase).transaction(STORE_NAME, "readwrite")
      const store = tx.objectStore(STORE_NAME)
      const req = store.openCursor()

      req.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result
        if (cursor === null) {
          resolve()
          return
        }
        const record = cursor.value as EncryptedRecord
        if (record.createdAt < cutoff) {
          cursor.delete()
        }
        cursor.continue()
      }

      req.onerror = (event) => reject((event.target as IDBRequest).error)
    })
  }
}
