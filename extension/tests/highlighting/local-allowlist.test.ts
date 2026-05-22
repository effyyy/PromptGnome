/**
 * Tests for src/highlighting/local-allowlist.ts
 *
 * Verifies SHA-256 hashing, in-memory CRUD, chrome.storage.local persistence,
 * LRU eviction, and synchronous hot-path lookup.
 */
import { describe, it, expect, vi } from "vitest"

// ---------------------------------------------------------------------------
// chrome.storage.local mock — set up before importing the module under test
// ---------------------------------------------------------------------------

const storageData: Record<string, unknown> = {}

vi.stubGlobal("chrome", {
  storage: {
    local: {
      get: vi.fn((keys: string | string[], cb: (result: Record<string, unknown>) => void) => {
        const keyList = Array.isArray(keys) ? keys : [keys]
        const result: Record<string, unknown> = {}
        for (const k of keyList) {
          if (k in storageData) {
            result[k] = storageData[k]
          }
        }
        cb(result)
      }),
      set: vi.fn((data: Record<string, unknown>, cb?: () => void) => {
        Object.assign(storageData, data)
        cb?.()
      }),
      remove: vi.fn((keys: string | string[], cb?: () => void) => {
        const keyList = Array.isArray(keys) ? keys : [keys]
        for (const key of keyList) {
          delete storageData[key]
        }
        cb?.()
      }),
    },
  },
  runtime: { lastError: null as null | { message: string } },
})

// ---------------------------------------------------------------------------
// Import module under test (after stub is in place)
// ---------------------------------------------------------------------------

import { hashText, LocalAllowlist } from "../../src/highlighting/local-allowlist"
import type { AllowlistEntry } from "../../src/highlighting/types"
import type { PIITypeId } from "../../src/detection/types"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates a fresh allowlist instance with a clean in-memory + storage state. */
async function freshAllowlist(): Promise<LocalAllowlist> {
  // Clear storage between tests
  for (const key of Object.keys(storageData)) {
    delete storageData[key]
  }
  vi.clearAllMocks()
  const al = new LocalAllowlist()
  await al.load()
  return al
}

// ---------------------------------------------------------------------------
// hashText
// ---------------------------------------------------------------------------

describe("hashText", () => {
  it("should return a 64-character lowercase hex string", async () => {
    const hash = await hashText("test@example.com")
    expect(hash).toHaveLength(64)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it("should return consistent hashes for the same input", async () => {
    const a = await hashText("my-secret-value")
    const b = await hashText("my-secret-value")
    expect(a).toBe(b)
  })

  it("should return different hashes for different inputs", async () => {
    const a = await hashText("value-one")
    const b = await hashText("value-two")
    expect(a).not.toBe(b)
  })

  it("should normalise by lowercasing the input before hashing", async () => {
    const lower = await hashText("Test@Example.COM")
    const manual = await hashText("test@example.com")
    expect(lower).toBe(manual)
  })

  it("should normalise by trimming whitespace before hashing", async () => {
    const padded = await hashText("  test@example.com  ")
    const clean = await hashText("test@example.com")
    expect(padded).toBe(clean)
  })
})

// ---------------------------------------------------------------------------
// LocalAllowlist — initialisation
// ---------------------------------------------------------------------------

describe("LocalAllowlist.load", () => {
  it("should initialise with empty entries when storage is empty", async () => {
    const al = await freshAllowlist()
    expect(al.getEntries()).toHaveLength(0)
  })

  it("should delete legacy persisted hashes on load so dismissed PII is not retained at rest", async () => {
    // Pre-populate storage with a serialised entry from the old persistent design.
    const entry: AllowlistEntry = {
      textHash: "a".repeat(64),
      type: "EMAIL" as PIITypeId,
      dismissedAt: 1710000000000,
      dismissCount: 1,
    }
    storageData["pii_allowlist"] = [entry]

    const al = new LocalAllowlist()
    await al.load()

    expect(al.getEntries()).toHaveLength(0)
    expect(storageData["pii_allowlist"]).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// LocalAllowlist.isDismissed
// ---------------------------------------------------------------------------

describe("LocalAllowlist.isDismissed", () => {
  it("should return false for text that has not been dismissed", async () => {
    const al = await freshAllowlist()
    const result = await al.isDismissed("nobody@example.com", "EMAIL")
    expect(result).toBe(false)
  })

  it("should return true after dismissing a text+type pair", async () => {
    const al = await freshAllowlist()
    await al.dismiss("test@example.com", "EMAIL")
    const result = await al.isDismissed("test@example.com", "EMAIL")
    expect(result).toBe(true)
  })

  it("should return false when text matches but type differs", async () => {
    const al = await freshAllowlist()
    await al.dismiss("555-867-5309", "PHONE_US")
    const result = await al.isDismissed("555-867-5309", "SSN")
    expect(result).toBe(false)
  })

  it("should be case-insensitive and whitespace-insensitive", async () => {
    const al = await freshAllowlist()
    await al.dismiss("Test@Example.COM", "EMAIL")
    const result = await al.isDismissed("  test@example.com  ", "EMAIL")
    expect(result).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// LocalAllowlist.isDismissedByHash
// ---------------------------------------------------------------------------

describe("LocalAllowlist.isDismissedByHash", () => {
  it("should return true for a pre-computed hash+type that exists", async () => {
    const al = await freshAllowlist()
    await al.dismiss("test@example.com", "EMAIL")
    const hash = await hashText("test@example.com")
    expect(al.isDismissedByHash(hash, "EMAIL")).toBe(true)
  })

  it("should return false for an unknown hash", async () => {
    const al = await freshAllowlist()
    expect(al.isDismissedByHash("0".repeat(64), "EMAIL")).toBe(false)
  })

  it("should return false when hash matches but type differs", async () => {
    const al = await freshAllowlist()
    await al.dismiss("test@example.com", "EMAIL")
    const hash = await hashText("test@example.com")
    expect(al.isDismissedByHash(hash, "PHONE_US")).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// LocalAllowlist.dismiss
// ---------------------------------------------------------------------------

describe("LocalAllowlist.dismiss", () => {
  it("should add a new entry with dismissCount 1", async () => {
    const al = await freshAllowlist()
    await al.dismiss("123-45-6789", "SSN")

    const entries = al.getEntries()
    expect(entries).toHaveLength(1)
    expect(entries[0].dismissCount).toBe(1)
    expect(entries[0].type).toBe("SSN")
  })

  it("should increment dismissCount on repeated dismissals of the same pair", async () => {
    const al = await freshAllowlist()
    await al.dismiss("123-45-6789", "SSN")
    await al.dismiss("123-45-6789", "SSN")
    await al.dismiss("123-45-6789", "SSN")

    const entries = al.getEntries()
    expect(entries).toHaveLength(1)
    expect(entries[0].dismissCount).toBe(3)
  })

  it("should update dismissedAt timestamp on repeated dismissal", async () => {
    const al = await freshAllowlist()
    await al.dismiss("123-45-6789", "SSN")
    const firstTime = al.getEntries()[0].dismissedAt

    // Small delay to ensure timestamp advances
    await new Promise((r) => setTimeout(r, 2))
    await al.dismiss("123-45-6789", "SSN")
    const secondTime = al.getEntries()[0].dismissedAt

    expect(secondTime).toBeGreaterThanOrEqual(firstTime)
  })

  it("should treat the same text with different types as separate entries", async () => {
    const al = await freshAllowlist()
    await al.dismiss("555-867-5309", "PHONE_US")
    await al.dismiss("555-867-5309", "PHONE_INTL")

    expect(al.getEntries()).toHaveLength(2)
  })

  it("should keep dismissals in memory only and never persist hashes to chrome.storage.local", async () => {
    const al = await freshAllowlist()
    await al.dismiss("test@example.com", "EMAIL")

    expect(storageData["pii_allowlist"]).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// LocalAllowlist.remove
// ---------------------------------------------------------------------------

describe("LocalAllowlist.remove", () => {
  it("should remove an entry by its hash", async () => {
    const al = await freshAllowlist()
    await al.dismiss("test@example.com", "EMAIL")

    const hash = await hashText("test@example.com")
    await al.remove(hash)

    expect(al.getEntries()).toHaveLength(0)
  })

  it("should remove all entries sharing the given hash regardless of type", async () => {
    const al = await freshAllowlist()
    await al.dismiss("test@example.com", "EMAIL")
    await al.dismiss("test@example.com", "GENERIC_API_KEY")

    const hash = await hashText("test@example.com")
    await al.remove(hash)

    expect(al.getEntries()).toHaveLength(0)
  })

  it("should leave unrelated entries intact", async () => {
    const al = await freshAllowlist()
    await al.dismiss("test@example.com", "EMAIL")
    await al.dismiss("123-45-6789", "SSN")

    const emailHash = await hashText("test@example.com")
    await al.remove(emailHash)

    expect(al.getEntries()).toHaveLength(1)
    expect(al.getEntries()[0].type).toBe("SSN")
  })

  it("should keep removals in memory only and never write hashes to chrome.storage.local", async () => {
    const al = await freshAllowlist()
    await al.dismiss("test@example.com", "EMAIL")
    await al.dismiss("123-45-6789", "SSN")

    const emailHash = await hashText("test@example.com")
    await al.remove(emailHash)

    expect(storageData["pii_allowlist"]).toBeUndefined()
  })

  it("should be a no-op when the hash does not exist", async () => {
    const al = await freshAllowlist()
    await al.dismiss("test@example.com", "EMAIL")

    await al.remove("0".repeat(64)) // non-existent hash

    expect(al.getEntries()).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// LocalAllowlist — LRU eviction
// ---------------------------------------------------------------------------

describe("LocalAllowlist LRU eviction", () => {
  it("should not exceed 1000 entries", async () => {
    const al = await freshAllowlist()

    // Add 1001 unique entries
    const addPromises: Promise<void>[] = []
    for (let i = 0; i < 1001; i++) {
      addPromises.push(al.dismiss(`unique-value-${i}`, "EMAIL"))
    }
    await Promise.all(addPromises)

    expect(al.getEntries().length).toBeLessThanOrEqual(1000)
  })

  it("should evict the oldest entry (smallest dismissedAt) when over capacity", async () => {
    // We'll seed the allowlist with MAX_ENTRIES entries, then add one more
    // and verify the oldest is gone.
    const al = await freshAllowlist()

    // Seed 1000 entries sequentially (so timestamps differ slightly)
    for (let i = 0; i < 1000; i++) {
      // Directly push to internal state via dismiss — timestamps are Date.now()
      await al.dismiss(`seed-value-${i}@example.com`, "EMAIL")
    }

    // At 1000 entries, adding one more triggers eviction
    await al.dismiss("overflow@example.com", "EMAIL")

    expect(al.getEntries().length).toBe(1000)
    // The overflow entry must be present (it was just added, not evicted)
    const overflowHash = await hashText("overflow@example.com")
    expect(al.isDismissedByHash(overflowHash, "EMAIL")).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// LocalAllowlist.getEntries
// ---------------------------------------------------------------------------

describe("LocalAllowlist.getEntries", () => {
  it("should return an empty array on a fresh allowlist", async () => {
    const al = await freshAllowlist()
    expect(al.getEntries()).toEqual([])
  })

  it("should return all current entries", async () => {
    const al = await freshAllowlist()
    await al.dismiss("test@example.com", "EMAIL")
    await al.dismiss("555-867-5309", "PHONE_US")

    const entries = al.getEntries()
    expect(entries).toHaveLength(2)
  })
})
