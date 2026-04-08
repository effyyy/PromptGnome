/**
 * Tests for the AES-256-GCM encrypted IndexedDB mapping store.
 *
 * jsdom (used by Vitest) does not ship with a real IndexedDB implementation,
 * so this file installs a minimal synchronous-style in-memory IndexedDB mock
 * on `globalThis` before importing the module under test.  The mock supports
 * `put`, `get`, and `openCursor` operations on a single object store, which
 * is everything EncryptedMappingStore uses.
 *
 * `chrome.storage.session` is stubbed via `vi.stubGlobal`.
 *
 * Architecture layer: Tests — anonymization
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

// ---------------------------------------------------------------------------
// chrome.storage.session mock (must be defined before any module import)
// ---------------------------------------------------------------------------

const mockSessionStorage: Record<string, unknown> = {}

vi.stubGlobal("chrome", {
  storage: {
    session: {
      get: vi.fn((keys: string[]) =>
        Promise.resolve(
          Object.fromEntries(keys.map((k) => [k, mockSessionStorage[k]])),
        ),
      ),
      set: vi.fn((items: Record<string, unknown>) => {
        Object.assign(mockSessionStorage, items)
        return Promise.resolve()
      }),
    },
  },
})

// ---------------------------------------------------------------------------
// Minimal in-memory IndexedDB mock
// ---------------------------------------------------------------------------

/** In-memory backing store — reset between tests via beforeEach. */
let idbStore: Record<string, unknown> = {}

/**
 * Creates a fake IDBRequest-like object whose callbacks are scheduled
 * via `queueMicrotask` so the code under test can attach handlers
 * synchronously before they fire (mirrors real IndexedDB async behaviour).
 */
function fakeRequest<T>(value: T, error: DOMException | null = null) {
  const req: Partial<IDBRequest<T>> & {
    onsuccess: ((e: { target: { result: T } }) => void) | null
    onerror: ((e: { target: { error: DOMException | null } }) => void) | null
    result: T
    error: DOMException | null
  } = {
    onsuccess: null,
    onerror: null,
    result: value,
    error,
  }

  queueMicrotask(() => {
    if (error !== null && req.onerror) {
      req.onerror({ target: { error } })
    } else if (req.onsuccess) {
      req.onsuccess({ target: { result: value } })
    }
  })

  return req
}

/**
 * Builds an in-memory cursor that walks all current entries in `idbStore`.
 * Each iteration re-fires `onsuccess` on the same request object via a
 * microtask, mirroring the real IndexedDB cursor behaviour.  Supports
 * `delete()` and `continue()`.
 */
function fakeCursorRequest() {
  // Snapshot entries at cursor-open time.
  const keys = Object.keys(idbStore)
  let index = 0

  // The single request object that consumers hold a reference to.
  const req: {
    onsuccess: ((e: { target: { result: IDBCursorWithValue | null } }) => void) | null
    onerror: ((e: { target: { error: DOMException | null } }) => void) | null
  } = {
    onsuccess: null,
    onerror: null,
  }

  /** Fires onsuccess on the shared `req` for the current index. */
  function advance() {
    queueMicrotask(() => {
      if (!req.onsuccess) return

      if (index >= keys.length) {
        req.onsuccess({ target: { result: null } })
        return
      }

      const key = keys[index]!

      const cursor = {
        get value() { return idbStore[key] },
        delete: () => {
          delete idbStore[key]
          return fakeRequest(undefined)
        },
        continue: () => {
          index++
          advance()
        },
      } as unknown as IDBCursorWithValue

      req.onsuccess({ target: { result: cursor } })
    })
  }

  // Schedule the first advance after the caller attaches onsuccess.
  // advance() itself uses queueMicrotask so the caller can set .onsuccess first.
  advance()

  return req
}

/** Builds a fake IDBObjectStore with put, get, openCursor. */
function fakeObjectStore(): IDBObjectStore {
  return {
    put: (value: unknown) => {
      const record = value as { sessionId: string }
      idbStore[record.sessionId] = record
      return fakeRequest(record.sessionId) as unknown as IDBRequest<IDBValidKey>
    },
    get: (key: IDBValidKey | IDBKeyRange) => {
      const val = idbStore[key as string]
      return fakeRequest(val) as unknown as IDBRequest<unknown>
    },
    openCursor: () => {
      return fakeCursorRequest() as unknown as IDBRequest<IDBCursorWithValue | null>
    },
  } as unknown as IDBObjectStore
}

/** Fake IDBDatabase returned by `fakeOpen`. */
function fakeDatabase(): IDBDatabase {
  return {
    transaction: (_storeNames: string | string[], _mode?: IDBTransactionMode) => ({
      objectStore: (_name: string) => fakeObjectStore(),
    }),
    objectStoreNames: { contains: () => true },
    createObjectStore: () => fakeObjectStore(),
  } as unknown as IDBDatabase
}

/** Builds a fake `indexedDB.open` result that succeeds asynchronously. */
function fakeOpen(): IDBOpenDBRequest {
  const db = fakeDatabase()
  const req = {
    onsuccess: null as ((e: { target: { result: IDBDatabase } }) => void) | null,
    onerror: null as ((e: { target: { error: DOMException | null } }) => void) | null,
    onupgradeneeded: null as unknown,
    result: db,
    error: null,
  }

  queueMicrotask(() => {
    if (req.onsuccess) {
      req.onsuccess({ target: { result: db } })
    }
  })

  return req as unknown as IDBOpenDBRequest
}

// Install the mock on globalThis so the module under test picks it up.
vi.stubGlobal("indexedDB", {
  open: () => fakeOpen(),
})

// ---------------------------------------------------------------------------
// Imports (after all stubs are in place)
// ---------------------------------------------------------------------------

import { EncryptedMappingStore } from "~src/anonymization/encrypted-store"
import { SessionMapper } from "~src/anonymization/session-mapper"

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("EncryptedMappingStore", () => {
  beforeEach(() => {
    // Reset both in-memory stores between tests.
    idbStore = {}
    for (const key of Object.keys(mockSessionStorage)) {
      delete mockSessionStorage[key]
    }
  })

  it("should store and retrieve a session mapper", async () => {
    const store = new EncryptedMappingStore()
    await store.init()

    const mapper = new SessionMapper()
    mapper.getOrCreatePlaceholder("EMAIL", "test@example.com")
    mapper.getOrCreatePlaceholder("NAME", "Jane Testperson")

    await store.store("tab:123", mapper)
    const retrieved = await store.retrieve("tab:123")

    expect(retrieved).not.toBeNull()
    expect(retrieved!.getOriginalValue("[EMAIL_1]")).toBe("test@example.com")
    expect(retrieved!.getOriginalValue("[NAME_1]")).toBe("Jane Testperson")
  })

  it("should return null for non-existent session", async () => {
    const store = new EncryptedMappingStore()
    await store.init()

    expect(await store.retrieve("tab:nonexistent")).toBeNull()
  })

  it("should overwrite existing session data", async () => {
    const store = new EncryptedMappingStore()
    await store.init()

    const m1 = new SessionMapper()
    m1.getOrCreatePlaceholder("EMAIL", "old@example.com")
    await store.store("tab:123", m1)

    const m2 = new SessionMapper()
    m2.getOrCreatePlaceholder("EMAIL", "new@example.com")
    await store.store("tab:123", m2)

    const retrieved = await store.retrieve("tab:123")
    expect(retrieved!.getOriginalValue("[EMAIL_1]")).toBe("new@example.com")
  })

  it("should persist passphrase and salt in chrome.storage.session", async () => {
    const store = new EncryptedMappingStore()
    await store.init()

    expect(mockSessionStorage["encryptionPassphrase"]).toBeDefined()
    expect(typeof mockSessionStorage["encryptionPassphrase"]).toBe("string")
    expect(Array.isArray(mockSessionStorage["encryptionSalt"])).toBe(true)
  })

  it("should reuse existing passphrase and salt from chrome.storage.session", async () => {
    // First store initialises key material.
    const store1 = new EncryptedMappingStore()
    await store1.init()

    const passphrase = mockSessionStorage["encryptionPassphrase"]
    const salt = mockSessionStorage["encryptionSalt"]

    // Second store must pick up the same key material.
    const store2 = new EncryptedMappingStore()
    await store2.init()

    expect(mockSessionStorage["encryptionPassphrase"]).toBe(passphrase)
    expect(mockSessionStorage["encryptionSalt"]).toStrictEqual(salt)
  })

  it("should preserve multiple placeholder types across store/retrieve", async () => {
    const store = new EncryptedMappingStore()
    await store.init()

    const mapper = new SessionMapper()
    mapper.getOrCreatePlaceholder("SSN", "123-45-6789")
    mapper.getOrCreatePlaceholder("EMAIL", "test@example.com")
    mapper.getOrCreatePlaceholder("SSN", "987-65-4321")

    await store.store("tab:456", mapper)
    const retrieved = await store.retrieve("tab:456")

    expect(retrieved).not.toBeNull()
    expect(retrieved!.getOriginalValue("[SSN_1]")).toBe("123-45-6789")
    expect(retrieved!.getOriginalValue("[EMAIL_1]")).toBe("test@example.com")
    expect(retrieved!.getOriginalValue("[SSN_2]")).toBe("987-65-4321")
  })

  it("should return null when decryption fails due to corrupted data", async () => {
    const store = new EncryptedMappingStore()
    await store.init()

    // Directly plant a corrupted (non-decryptable) record in the idbStore.
    idbStore["tab:bad"] = {
      sessionId: "tab:bad",
      ciphertext: [1, 2, 3, 4, 5],
      iv: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      createdAt: Date.now(),
    }

    expect(await store.retrieve("tab:bad")).toBeNull()
  })

  it("cleanup() should remove entries older than 24 hours", async () => {
    const store = new EncryptedMappingStore()
    await store.init()

    // Plant a stale record directly.
    const staleTs = Date.now() - 25 * 60 * 60 * 1000 // 25 hours ago
    idbStore["tab:old"] = {
      sessionId: "tab:old",
      ciphertext: [],
      iv: [],
      createdAt: staleTs,
    }

    // Plant a fresh record.
    const freshMapper = new SessionMapper()
    freshMapper.getOrCreatePlaceholder("EMAIL", "keep@example.com")
    await store.store("tab:fresh", freshMapper)

    await store.cleanup()

    // The stale entry should be gone.
    expect(idbStore["tab:old"]).toBeUndefined()

    // The fresh entry should survive.
    expect(idbStore["tab:fresh"]).toBeDefined()
  })
})
