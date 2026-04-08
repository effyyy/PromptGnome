/**
 * Web Crypto API helpers for encryption operations.
 * All randomness is sourced from crypto.getRandomValues (CSPRNG).
 * NEVER uses Math.random anywhere in this module.
 */

/** Number of PBKDF2 iterations for key derivation. */
const PBKDF2_ITERATIONS = 100_000

/** AES-GCM key length in bits. */
const AES_KEY_BITS = 256

/** Byte length for AES-GCM initialization vectors. */
const IV_BYTE_LENGTH = 12

/** Default salt length in bytes. */
const DEFAULT_SALT_BYTES = 16

/** Byte length for passphrase generation. */
const PASSPHRASE_BYTES = 32

/**
 * Generates a cryptographically secure random salt.
 *
 * @param bytes - Number of random bytes (default: 16)
 * @returns A Uint8Array filled with random bytes
 */
export function generateSalt(bytes: number = DEFAULT_SALT_BYTES): Uint8Array {
  const salt = new Uint8Array(bytes)
  crypto.getRandomValues(salt)
  return salt
}

/**
 * Generates a 12-byte initialization vector for AES-GCM.
 * Each encryption operation MUST use a unique IV with the same key.
 *
 * @returns A 12-byte Uint8Array filled with random bytes
 */
export function generateIV(): Uint8Array {
  const iv = new Uint8Array(IV_BYTE_LENGTH)
  crypto.getRandomValues(iv)
  return iv
}

/**
 * Generates a 32-byte random passphrase encoded as a hex string.
 * Suitable for use as a symmetric key seed with {@link deriveKey}.
 *
 * @returns A 64-character hex string (32 bytes of entropy)
 */
export function generatePassphrase(): string {
  const bytes = new Uint8Array(PASSPHRASE_BYTES)
  crypto.getRandomValues(bytes)
  return bytesToHex(bytes)
}

/**
 * Converts a Uint8Array to a lowercase hex string.
 * Used internally for passphrase encoding.
 */
function bytesToHex(bytes: Uint8Array): string {
  const hexPairs: string[] = []
  for (let i = 0; i < bytes.length; i++) {
    hexPairs.push(bytes[i].toString(16).padStart(2, "0"))
  }
  return hexPairs.join("")
}

/**
 * Derives an AES-256-GCM CryptoKey from a passphrase and salt
 * using PBKDF2 with SHA-256.
 *
 * @param passphrase - The passphrase string to derive from
 * @param salt - A random salt (use {@link generateSalt})
 * @returns A CryptoKey suitable for AES-GCM encrypt/decrypt
 */
export async function deriveKey(
  passphrase: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const encoder = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  )

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: AES_KEY_BITS },
    false,
    ["encrypt", "decrypt"]
  )
}

/**
 * Result of an encryption operation containing the ciphertext and IV
 * needed for decryption.
 */
export interface EncryptResult {
  /** The encrypted data. */
  ciphertext: ArrayBuffer
  /** The initialization vector used; must be stored alongside ciphertext. */
  iv: Uint8Array
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 *
 * @param data - The plaintext string to encrypt
 * @param key - An AES-GCM CryptoKey from {@link deriveKey}
 * @returns The ciphertext and the IV used for encryption
 */
export async function encrypt(
  data: string,
  key: CryptoKey
): Promise<EncryptResult> {
  const encoder = new TextEncoder()
  const iv = generateIV()
  const encoded = encoder.encode(data)

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    encoded
  )

  return { ciphertext, iv }
}

/**
 * Decrypts AES-256-GCM ciphertext back to a plaintext string.
 * Clears the intermediate plaintext buffer after decoding.
 *
 * @param ciphertext - The encrypted data from {@link encrypt}
 * @param key - The same AES-GCM CryptoKey used for encryption
 * @param iv - The initialization vector from the encrypt result
 * @returns The decrypted plaintext string
 * @throws If decryption fails (wrong key, tampered data, or wrong IV)
 */
export async function decrypt(
  ciphertext: ArrayBuffer,
  key: CryptoKey,
  iv: Uint8Array
): Promise<string> {
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    ciphertext
  )

  const decoder = new TextDecoder()
  const plaintext = decoder.decode(decrypted)

  const view = new Uint8Array(decrypted)
  view.fill(0)

  return plaintext
}
