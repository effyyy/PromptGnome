/**
 * Local false-positive allowlist for the real-time PII highlighting feature.
 *
 * Stores SHA-256 hashes of user-dismissed PII detections in chrome.storage.local
 * so that the same text is never highlighted again for the same entity type.
 * Privacy guarantee: plaintext PII values are NEVER stored — only their hashes.
 *
 * Layer: highlighting subsystem / persistence
 * Dependencies: chrome.storage.local (browser API), Web Crypto API
 */

import type { AllowlistEntry } from "./types"
import type { PIITypeId } from "~src/detection/types"
import { createLogger } from "~src/utils/logger"

const log = createLogger("local-allowlist")

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** chrome.storage.local key under which the allowlist array is persisted. */
const STORAGE_KEY = "pii_allowlist"

/** Maximum number of entries retained; oldest (LRU) entries are evicted first. */
const MAX_ENTRIES = 1000

// ---------------------------------------------------------------------------
// hashText — exported for use in FeedbackPayload construction
// ---------------------------------------------------------------------------

/**
 * Computes a SHA-256 hex digest of the given text.
 *
 * Used to derive a privacy-safe, deterministic key for allowlist lookups
 * without storing the original PII value. The input is lowercased and
 * trimmed before hashing so that minor formatting variations map to the
 * same hash.
 *
 * @param text - The raw PII string to hash (e.g. a phone number or email).
 * @returns A 64-character lowercase hexadecimal string.
 *
 * @example
 * ```ts
 * const hash = await hashText("test@example.com")
 * // => "c0535e4be2b79ffd93291305436bf889314e4a3faec05ecffcbb7df31ad9e51a"
 * ```
 */
export async function hashText(text: string): Promise<string> {
  const normalised = text.toLowerCase().trim()
  const encoder = new TextEncoder()
  const data = encoder.encode(normalised)
  const hashBuffer = await crypto.subtle.digest("SHA-256", data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
}

// ---------------------------------------------------------------------------
// LocalAllowlist — main class
// ---------------------------------------------------------------------------

/**
 * Manages a persisted list of text+type combinations that the user has
 * explicitly dismissed as false positives.
 *
 * **Lifecycle:** call {@link load} once after construction before using any
 * other method.  All subsequent reads are served from the in-memory cache;
 * writes are flushed to `chrome.storage.local` via {@link persist}.
 *
 * **Privacy:** Only SHA-256 hashes are stored.  The original PII text is
 * never written to storage or logs.
 *
 * @example
 * ```ts
 * const allowlist = new LocalAllowlist()
 * await allowlist.load()
 *
 * if (await allowlist.isDismissed("555-867-5309", "PHONE_US")) {
 *   return // skip — user already said this is not PII
 * }
 * ```
 */
export class LocalAllowlist {
  /** In-memory cache of all allowlist entries. */
  private entries: AllowlistEntry[] = []

  // -------------------------------------------------------------------------
  // load
  // -------------------------------------------------------------------------

  /**
   * Loads the persisted allowlist from `chrome.storage.local` into memory.
   *
   * Silently recovers from missing or corrupt storage data by starting with
   * an empty list. Must be called once before using {@link isDismissed} or
   * {@link dismiss}.
   *
   * @returns A promise that resolves when the in-memory cache is populated.
   *
   * @example
   * ```ts
   * const allowlist = new LocalAllowlist()
   * await allowlist.load()
   * ```
   */
  async load(): Promise<void> {
    return new Promise<void>((resolve) => {
      try {
        if (typeof chrome === "undefined" || !chrome.storage?.local) {
          // MAIN-world content script — no chrome.storage. Operate in-memory.
          this.entries = []
          resolve()
          return
        }
        chrome.storage.local.get([STORAGE_KEY], (result) => {
          if (chrome.runtime.lastError) {
            log.warn("load: chrome.runtime.lastError", {
              message: chrome.runtime.lastError.message,
            })
            this.entries = []
            resolve()
            return
          }

          const raw = result[STORAGE_KEY]
          if (!Array.isArray(raw)) {
            this.entries = []
            resolve()
            return
          }

          // Filter to valid-shaped entries; discard corrupted records.
          this.entries = raw.filter(isValidEntry)
          log.debug("load: entries loaded", { count: this.entries.length })
          resolve()
        })
      } catch (err) {
        log.error("load: unexpected error", { err: String(err) })
        this.entries = []
        resolve()
      }
    })
  }

  // -------------------------------------------------------------------------
  // isDismissed
  // -------------------------------------------------------------------------

  /**
   * Checks whether a given text+type combination has been previously dismissed.
   *
   * Hashes `text` and delegates to {@link isDismissedByHash} for a fast
   * synchronous lookup against the in-memory cache.
   *
   * @param text - The raw PII string to check (lowercased/trimmed before hashing).
   * @param type - The PII entity type to check against.
   * @returns `true` if the hash+type pair exists in the allowlist.
   *
   * @example
   * ```ts
   * const dismissed = await allowlist.isDismissed("test@example.com", "EMAIL")
   * ```
   */
  async isDismissed(text: string, type: PIITypeId): Promise<boolean> {
    const hash = await hashText(text)
    return this.isDismissedByHash(hash, type)
  }

  // -------------------------------------------------------------------------
  // isDismissedByHash (synchronous hot-path)
  // -------------------------------------------------------------------------

  /**
   * Synchronous variant of {@link isDismissed} for use on the hot path where
   * the SHA-256 hash has already been computed.
   *
   * @param textHash - Pre-computed 64-character SHA-256 hex digest.
   * @param type     - The PII entity type to check.
   * @returns `true` if an entry with matching hash and type exists.
   *
   * @example
   * ```ts
   * const hash = await hashText("test@example.com")
   * const dismissed = allowlist.isDismissedByHash(hash, "EMAIL")
   * ```
   */
  isDismissedByHash(textHash: string, type: PIITypeId): boolean {
    return this.entries.some(
      (e) => e.textHash === textHash && e.type === type,
    )
  }

  // -------------------------------------------------------------------------
  // dismiss
  // -------------------------------------------------------------------------

  /**
   * Records a dismissal for the given text+type pair.
   *
   * If an entry already exists for this hash+type, its {@link AllowlistEntry#dismissCount}
   * is incremented and {@link AllowlistEntry#dismissedAt} is updated.
   * If no entry exists, a new one is created.
   *
   * When the total number of entries exceeds {@link MAX_ENTRIES}, the entry
   * with the oldest {@link AllowlistEntry#dismissedAt} timestamp is evicted
   * (LRU policy).
   *
   * Changes are persisted to `chrome.storage.local` before the promise resolves.
   *
   * @param text - The raw PII string to allowlist (never stored; only its hash).
   * @param type - The PII entity type to allowlist.
   * @returns A promise that resolves when the change has been persisted.
   * @throws Never — errors are logged and the method resolves silently.
   *
   * @example
   * ```ts
   * await allowlist.dismiss("test@example.com", "EMAIL")
   * ```
   */
  async dismiss(text: string, type: PIITypeId): Promise<void> {
    try {
      const textHash = await hashText(text)
      const now = Date.now()

      const existingIndex = this.entries.findIndex(
        (e) => e.textHash === textHash && e.type === type,
      )

      if (existingIndex >= 0) {
        // Increment dismiss count and refresh timestamp on the existing entry.
        const existing = this.entries[existingIndex]
        this.entries[existingIndex] = {
          textHash: existing.textHash,
          type: existing.type,
          dismissedAt: now,
          dismissCount: existing.dismissCount + 1,
        }
      } else {
        // New entry.
        this.entries.push({
          textHash,
          type,
          dismissedAt: now,
          dismissCount: 1,
        })

        // LRU eviction — remove the oldest entry if we have exceeded the cap.
        if (this.entries.length > MAX_ENTRIES) {
          evictOldest(this.entries)
        }
      }

      await this.persist()
      log.debug("dismiss: entry saved", { type, entryCount: this.entries.length })
    } catch (err) {
      log.error("dismiss: unexpected error", { err: String(err) })
    }
  }

  // -------------------------------------------------------------------------
  // remove
  // -------------------------------------------------------------------------

  /**
   * Removes a specific entry from the allowlist by its text hash.
   *
   * All entries matching the given `textHash` are removed regardless of their
   * entity type, making it straightforward to "un-dismiss" a value completely.
   *
   * Changes are persisted to `chrome.storage.local` before the promise resolves.
   *
   * @param textHash - The 64-character SHA-256 hex digest to remove.
   * @returns A promise that resolves when the entry has been removed and persisted.
   * @throws Never — errors are logged and the method resolves silently.
   *
   * @example
   * ```ts
   * await allowlist.remove("c0535e4be2b79ffd93291305436bf889314e4a3faec05ecffcbb7df31ad9e51a")
   * ```
   */
  async remove(textHash: string): Promise<void> {
    try {
      const before = this.entries.length
      this.entries = this.entries.filter((e) => e.textHash !== textHash)
      const removed = before - this.entries.length

      if (removed > 0) {
        await this.persist()
        log.debug("remove: entry removed", { removed, entryCount: this.entries.length })
      }
    } catch (err) {
      log.error("remove: unexpected error", { err: String(err) })
    }
  }

  // -------------------------------------------------------------------------
  // getEntries
  // -------------------------------------------------------------------------

  /**
   * Returns a read-only snapshot of all current allowlist entries.
   *
   * Callers may iterate or inspect the entries but must not mutate the
   * returned array.  Use {@link dismiss} and {@link remove} to modify state.
   *
   * @returns An immutable view of the current entries array.
   *
   * @example
   * ```ts
   * const entries = allowlist.getEntries()
   * console.log(`${entries.length} entries in allowlist`)
   * ```
   */
  getEntries(): readonly AllowlistEntry[] {
    return this.entries as readonly AllowlistEntry[]
  }

  // -------------------------------------------------------------------------
  // persist (private)
  // -------------------------------------------------------------------------

  /**
   * Serialises the in-memory entries array to `chrome.storage.local`.
   *
   * This is an internal method called by {@link dismiss} and {@link remove}
   * after every mutation.  It must not be called directly from outside this
   * class.
   *
   * @returns A promise that resolves once the write has been acknowledged.
   * @throws Never — rejects are converted to logged warnings.
   */
  private persist(): Promise<void> {
    return new Promise<void>((resolve) => {
      try {
        if (typeof chrome === "undefined" || !chrome.storage?.local) {
          resolve()
          return
        }
        const payload: Record<string, AllowlistEntry[]> = {
          [STORAGE_KEY]: this.entries,
        }
        chrome.storage.local.set(payload, () => {
          if (chrome.runtime.lastError) {
            log.warn("persist: chrome.runtime.lastError", {
              message: chrome.runtime.lastError.message,
            })
          }
          resolve()
        })
      } catch (err) {
        log.error("persist: unexpected error", { err: String(err) })
        resolve()
      }
    })
  }
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Type guard that validates the shape of a raw storage entry.
 *
 * @param value - Unknown value read from storage.
 * @returns `true` when the value conforms to {@link AllowlistEntry}.
 */
function isValidEntry(value: unknown): value is AllowlistEntry {
  if (typeof value !== "object" || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v["textHash"] === "string" &&
    typeof v["type"] === "string" &&
    typeof v["dismissedAt"] === "number" &&
    typeof v["dismissCount"] === "number"
  )
}

/**
 * Mutates `entries` in-place to remove the entry with the smallest
 * `dismissedAt` timestamp (oldest, LRU).
 *
 * @param entries - The array to evict from (mutated directly).
 */
function evictOldest(entries: AllowlistEntry[]): void {
  if (entries.length === 0) return

  let oldestIndex = 0
  let oldestTime = entries[0].dismissedAt

  for (let i = 1; i < entries.length; i++) {
    if (entries[i].dismissedAt < oldestTime) {
      oldestTime = entries[i].dismissedAt
      oldestIndex = i
    }
  }

  entries.splice(oldestIndex, 1)
}
