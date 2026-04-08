/**
 * Vitest tests for the Web Crypto API helpers in src/utils/crypto.ts.
 * Covers salt/IV/passphrase generation, key derivation, encrypt/decrypt
 * round-trips, wrong-key rejection, and post-decrypt memory clearing.
 * No chrome APIs are used or mocked — this module depends only on Web Crypto.
 */
import { describe, it, expect } from "vitest"

import {
  generateSalt,
  generateIV,
  generatePassphrase,
  deriveKey,
  encrypt,
  decrypt,
  type EncryptResult,
} from "../../src/utils/crypto"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Derives a fresh AES-GCM key from a random passphrase and salt. */
async function freshKey(): Promise<CryptoKey> {
  const passphrase = generatePassphrase()
  const salt = generateSalt()
  return deriveKey(passphrase, salt)
}

/** Returns true when every byte in the array is 0. */
function isZeroed(buf: ArrayBuffer): boolean {
  return new Uint8Array(buf).every((b) => b === 0)
}

// ---------------------------------------------------------------------------
// generateSalt
// ---------------------------------------------------------------------------

describe("generateSalt", () => {
  it("should return 16 bytes by default", () => {
    const salt = generateSalt()
    expect(salt).toBeInstanceOf(Uint8Array)
    expect(salt.byteLength).toBe(16)
  })

  it("should return the requested number of bytes when specified", () => {
    expect(generateSalt(8).byteLength).toBe(8)
    expect(generateSalt(32).byteLength).toBe(32)
    expect(generateSalt(64).byteLength).toBe(64)
  })

  it("should produce different values on successive calls (randomness)", () => {
    const a = generateSalt()
    const b = generateSalt()
    // The probability of two 16-byte random arrays being identical is ~2^-128
    expect(Array.from(a)).not.toEqual(Array.from(b))
  })

  it("should not return an all-zero array", () => {
    const salt = generateSalt(16)
    // Statistically impossible to be all zeros from a CSPRNG
    expect(salt.some((b) => b !== 0)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// generateIV
// ---------------------------------------------------------------------------

describe("generateIV", () => {
  it("should return exactly 12 bytes", () => {
    const iv = generateIV()
    expect(iv).toBeInstanceOf(Uint8Array)
    expect(iv.byteLength).toBe(12)
  })

  it("should produce different values on successive calls", () => {
    const a = generateIV()
    const b = generateIV()
    expect(Array.from(a)).not.toEqual(Array.from(b))
  })

  it("should not return an all-zero array", () => {
    const iv = generateIV()
    expect(iv.some((b) => b !== 0)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// generatePassphrase
// ---------------------------------------------------------------------------

describe("generatePassphrase", () => {
  it("should return a 64-character string", () => {
    const passphrase = generatePassphrase()
    expect(typeof passphrase).toBe("string")
    expect(passphrase).toHaveLength(64)
  })

  it("should contain only valid lowercase hexadecimal characters", () => {
    const passphrase = generatePassphrase()
    expect(/^[0-9a-f]{64}$/.test(passphrase)).toBe(true)
  })

  it("should produce different values on successive calls", () => {
    const a = generatePassphrase()
    const b = generatePassphrase()
    expect(a).not.toBe(b)
  })

  it("should encode exactly 32 bytes of entropy (64 hex chars = 32 bytes)", () => {
    const passphrase = generatePassphrase()
    // Each byte becomes exactly 2 hex characters
    expect(passphrase.length / 2).toBe(32)
  })
})

// ---------------------------------------------------------------------------
// deriveKey
// ---------------------------------------------------------------------------

describe("deriveKey", () => {
  it("should return a CryptoKey", async () => {
    const key = await freshKey()
    expect(key).toBeInstanceOf(CryptoKey)
  })

  it("should return a key with the AES-GCM algorithm", async () => {
    const key = await freshKey()
    expect((key.algorithm as AesKeyAlgorithm).name).toBe("AES-GCM")
  })

  it("should return a 256-bit key", async () => {
    const key = await freshKey()
    expect((key.algorithm as AesKeyAlgorithm).length).toBe(256)
  })

  it("should return a non-extractable key", async () => {
    const key = await freshKey()
    expect(key.extractable).toBe(false)
  })

  it("should return a key usable for both encrypt and decrypt", async () => {
    const key = await freshKey()
    expect(key.usages).toContain("encrypt")
    expect(key.usages).toContain("decrypt")
  })

  it("should derive a different key for a different passphrase with the same salt", async () => {
    const salt = generateSalt()
    const keyA = await deriveKey(generatePassphrase(), salt)
    const keyB = await deriveKey(generatePassphrase(), salt)
    // We can't compare CryptoKey objects directly, but encrypting with keyA
    // and decrypting with keyB should fail — tested in the decrypt suite below.
    // Here we just verify both are CryptoKey instances (structural check).
    expect(keyA).toBeInstanceOf(CryptoKey)
    expect(keyB).toBeInstanceOf(CryptoKey)
  })

  it("should derive a different key for the same passphrase with a different salt", async () => {
    const passphrase = generatePassphrase()
    const keyA = await deriveKey(passphrase, generateSalt())
    const keyB = await deriveKey(passphrase, generateSalt())
    expect(keyA).toBeInstanceOf(CryptoKey)
    expect(keyB).toBeInstanceOf(CryptoKey)
  })
})

// ---------------------------------------------------------------------------
// encrypt
// ---------------------------------------------------------------------------

describe("encrypt", () => {
  it("should return an object with ciphertext and iv properties", async () => {
    const key = await freshKey()
    const result: EncryptResult = await encrypt("hello world", key)
    expect(result).toHaveProperty("ciphertext")
    expect(result).toHaveProperty("iv")
  })

  it("should return ciphertext as an ArrayBuffer-like object", async () => {
    const key = await freshKey()
    const { ciphertext } = await encrypt("secret", key)
    // crypto.subtle.encrypt may return a plain ArrayBuffer or a
    // SharedArrayBuffer-backed buffer depending on the JS engine; both expose
    // byteLength and can be wrapped by Uint8Array.
    expect(typeof ciphertext.byteLength).toBe("number")
    expect(() => new Uint8Array(ciphertext)).not.toThrow()
  })

  it("should return iv as a 12-byte Uint8Array", async () => {
    const key = await freshKey()
    const { iv } = await encrypt("secret", key)
    expect(iv).toBeInstanceOf(Uint8Array)
    expect(iv.byteLength).toBe(12)
  })

  it("should produce ciphertext larger than the plaintext (due to GCM auth tag)", async () => {
    const key = await freshKey()
    const plaintext = "short"
    const { ciphertext } = await encrypt(plaintext, key)
    // AES-GCM appends a 16-byte authentication tag
    expect(ciphertext.byteLength).toBeGreaterThan(new TextEncoder().encode(plaintext).byteLength)
  })

  it("should produce different ciphertext for the same plaintext on successive calls (unique IV)", async () => {
    const key = await freshKey()
    const { ciphertext: ct1, iv: iv1 } = await encrypt("same input", key)
    const { ciphertext: ct2, iv: iv2 } = await encrypt("same input", key)
    // IVs should be different (randomly generated per call)
    expect(Array.from(iv1)).not.toEqual(Array.from(iv2))
    // And therefore the ciphertexts differ
    expect(new Uint8Array(ct1)).not.toEqual(new Uint8Array(ct2))
  })

  it("should encrypt an empty string without throwing", async () => {
    const key = await freshKey()
    const { ciphertext } = await encrypt("", key)
    // Empty plaintext produces at least the 16-byte GCM auth tag
    expect(ciphertext.byteLength).toBeGreaterThanOrEqual(16)
  })

  it("should encrypt a long string without throwing", async () => {
    const key = await freshKey()
    const longText = "a".repeat(10_000)
    const { ciphertext } = await encrypt(longText, key)
    expect(ciphertext.byteLength).toBeGreaterThan(10_000)
  })
})

// ---------------------------------------------------------------------------
// decrypt
// ---------------------------------------------------------------------------

describe("decrypt", () => {
  it("should return the original plaintext after encrypt + decrypt", async () => {
    const key = await freshKey()
    const original = "Hello, World! This is a test message."
    const { ciphertext, iv } = await encrypt(original, key)
    const result = await decrypt(ciphertext, key, iv)
    expect(result).toBe(original)
  })

  it("should round-trip an empty string", async () => {
    const key = await freshKey()
    const { ciphertext, iv } = await encrypt("", key)
    const result = await decrypt(ciphertext, key, iv)
    expect(result).toBe("")
  })

  it("should round-trip a string containing Unicode characters", async () => {
    const key = await freshKey()
    const unicode = "Héllo wörld 日本語 🔐 привет"
    const { ciphertext, iv } = await encrypt(unicode, key)
    const result = await decrypt(ciphertext, key, iv)
    expect(result).toBe(unicode)
  })

  it("should round-trip a string containing sensitive PII-like patterns", async () => {
    const key = await freshKey()
    const pii = "My SSN is 123-45-6789 and email is test@example.com"
    const { ciphertext, iv } = await encrypt(pii, key)
    const result = await decrypt(ciphertext, key, iv)
    expect(result).toBe(pii)
  })

  it("should round-trip a very long string", async () => {
    const key = await freshKey()
    const longText = "x".repeat(100_000)
    const { ciphertext, iv } = await encrypt(longText, key)
    const result = await decrypt(ciphertext, key, iv)
    expect(result).toBe(longText)
  })

  it("should return a string (not a Buffer or ArrayBuffer)", async () => {
    const key = await freshKey()
    const { ciphertext, iv } = await encrypt("test", key)
    const result = await decrypt(ciphertext, key, iv)
    expect(typeof result).toBe("string")
  })
})

// ---------------------------------------------------------------------------
// decrypt — wrong key / tampered data
// ---------------------------------------------------------------------------

describe("decrypt with wrong key", () => {
  it("should throw when decrypting with a different key", async () => {
    const passphrase = generatePassphrase()
    const salt = generateSalt()
    const key = await deriveKey(passphrase, salt)

    const { ciphertext, iv } = await encrypt("sensitive data", key)

    // Derive a completely different key
    const wrongKey = await deriveKey(generatePassphrase(), generateSalt())

    await expect(decrypt(ciphertext, wrongKey, iv)).rejects.toThrow()
  })

  it("should throw when decrypting with the same passphrase but different salt", async () => {
    const passphrase = generatePassphrase()
    const correctKey = await deriveKey(passphrase, generateSalt())
    const { ciphertext, iv } = await encrypt("private value", correctKey)

    const wrongKey = await deriveKey(passphrase, generateSalt())
    await expect(decrypt(ciphertext, wrongKey, iv)).rejects.toThrow()
  })

  it("should throw when the IV is incorrect", async () => {
    const key = await freshKey()
    const { ciphertext } = await encrypt("data", key)

    // Use a freshly generated IV that does not match the one used during encryption
    const wrongIV = generateIV()
    await expect(decrypt(ciphertext, key, wrongIV)).rejects.toThrow()
  })

  it("should throw when the ciphertext has been tampered with", async () => {
    const key = await freshKey()
    const { ciphertext, iv } = await encrypt("untouched", key)

    // Flip the last byte of the ciphertext (corrupts the GCM auth tag)
    const tampered = ciphertext.slice(0)
    const view = new Uint8Array(tampered)
    view[view.length - 1] ^= 0xff

    await expect(decrypt(tampered, key, iv)).rejects.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Memory clearing after decrypt
// ---------------------------------------------------------------------------

describe("decrypt memory clearing", () => {
  it("should zero out the decrypted ArrayBuffer after use", async () => {
    const key = await freshKey()
    const plaintext = "zero me out"
    const { ciphertext, iv } = await encrypt(plaintext, key)

    // Capture the raw decrypted buffer by spying on crypto.subtle.decrypt.
    // Because the module calls view.fill(0) on the same ArrayBuffer returned
    // by crypto.subtle.decrypt, we intercept the result to verify zeroing.
    let capturedBuffer: ArrayBuffer | null = null
    const originalDecrypt = crypto.subtle.decrypt.bind(crypto.subtle)
    crypto.subtle.decrypt = async (
      ...args: Parameters<typeof crypto.subtle.decrypt>
    ): Promise<ArrayBuffer> => {
      const buf = await originalDecrypt(...args)
      capturedBuffer = buf
      return buf
    }

    try {
      const result = await decrypt(ciphertext, key, iv)
      // The return value must still be the correct plaintext
      expect(result).toBe(plaintext)
      // The underlying ArrayBuffer must have been zeroed by view.fill(0)
      expect(capturedBuffer).not.toBeNull()
      expect(isZeroed(capturedBuffer!)).toBe(true)
    } finally {
      // Restore the original implementation
      crypto.subtle.decrypt = originalDecrypt
    }
  })
})
