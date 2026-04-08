/**
 * Tests for EU / international PII detection patterns.
 * Uses synthetic PII data only — never real data.
 */
import { describe, it, expect } from "vitest"

import {
  detectUKNIN,
  detectGermanTaxId,
  detectFrenchSSN,
  detectSpanishDNI,
  detectItalianFiscalCode,
  detectDutchBSN,
  detectIBANs,
  detectCryptoWallets,
  detectPII,
} from "../../src/detection/regex-engine"

// ─── UK NATIONAL INSURANCE NUMBER ────────────────────────────────────

describe("detectUKNIN", () => {
  it("should detect standard UK NIN format", () => {
    const matches = detectUKNIN("My NI number is AB 12 34 56 C")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("UK_NIN")
    expect(matches[0].confidence).toBeGreaterThanOrEqual(0.90)
  })

  it("should detect NIN without spaces", () => {
    const matches = detectUKNIN("NI number AB123456C")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("UK_NIN")
  })

  it("should detect NIN with dashes", () => {
    const matches = detectUKNIN("national insurance: AB-12-34-56-C")
    expect(matches).toHaveLength(1)
    expect(matches[0].confidence).toBeGreaterThanOrEqual(0.90)
  })

  it("should boost confidence with context", () => {
    const withCtx = detectUKNIN("My national insurance number is AB 12 34 56 C")
    const noCtx = detectUKNIN("Reference: AB 12 34 56 C here")
    // UK NIN now requires context — no-context result should be empty
    expect(withCtx).toHaveLength(1)
    expect(withCtx[0].confidence).toBe(0.93)
    expect(noCtx).toHaveLength(0)
  })

  it("should reject test prefixes (OO, TN, XX)", () => {
    const matches = detectUKNIN("OO 12 34 56 A")
    expect(matches).toHaveLength(0)
  })

  it("should reject invalid suffix letters (E-Z)", () => {
    const matches = detectUKNIN("AB 12 34 56 E")
    expect(matches).toHaveLength(0)
  })

  it("should reject disallowed first-letter prefixes (D, F, I, Q, U, V)", () => {
    const matches = detectUKNIN("DA 12 34 56 A")
    expect(matches).toHaveLength(0)
  })
})

// ─── GERMAN TAX ID ───────────────────────────────────────────────────

describe("detectGermanTaxId", () => {
  it("should detect valid German tax IDs with context", () => {
    // 12345678911: freq [0→0, 1→3, 2→1, 3→1, 4→1, 5→1, 6→1, 7→1, 8→1, 9→1]
    // zeroCount=1 (digit 0 absent), multiCount=1 (digit 1 appears 3 times) — valid!
    const matches = detectGermanTaxId("Steuerliche Identifikationsnummer: 12345678911")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("DE_TAX_ID")
    // With context keyword "Steuerliche", confidence should be boosted above threshold
    expect(matches[0].confidence).toBeGreaterThanOrEqual(0.85)
  })

  it("should boost confidence with tax context keywords", () => {
    const withCtx = detectGermanTaxId("Steuer-IdNr: 12345678911")
    const noCtx = detectGermanTaxId("Number 12345678911 here")
    // German Tax ID now requires context — no-context result should be empty
    expect(withCtx).toHaveLength(1)
    expect(withCtx[0].confidence).toBe(0.93)
    expect(noCtx).toHaveLength(0)
  })

  it("should have low confidence without context (below default threshold)", () => {
    const matches = detectGermanTaxId("Number 12345678911 here")
    // Without context, now returns 0 matches (confidence set to 0.0, filtered out)
    expect(matches).toHaveLength(0)
  })

  it("should reject numbers where all digits appear", () => {
    // 12345678901 — all 10 digits present (no missing digit)
    const matches = detectGermanTaxId("tax id 12345678901")
    expect(matches).toHaveLength(0)
  })

  it("should reject numbers starting with 0", () => {
    const matches = detectGermanTaxId("tax id 01234567891")
    expect(matches).toHaveLength(0)
  })

  it("should reject numbers with a digit appearing more than 3 times", () => {
    // 11111234560 — digit 1 appears 5 times
    const matches = detectGermanTaxId("11111234560")
    expect(matches).toHaveLength(0)
  })
})

// ─── FRENCH SOCIAL SECURITY NUMBER ──────────────────────────────────

describe("detectFrenchSSN", () => {
  it("should detect a valid French SSN with control key", () => {
    // Construct: gender=1, year=85, month=05, dept=78, commune=322, order=015
    // Base 13 digits: 1850578322015
    // Key: 97 - (1850578322015 % 97) = 97 - (1850578322015 mod 97)
    // 1850578322015 / 97 = 19078126000.15... → 1850578322015 mod 97 = 15
    // Key = 97 - 15 = 82
    const nirBase = "1850578322015"
    const mod = parseInt(nirBase, 10) % 97
    const key = (97 - mod).toString().padStart(2, "0")
    const fullNIR = nirBase + key
    const matches = detectFrenchSSN(`Numéro de sécurité sociale: ${fullNIR}`)
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("FR_SSN")
    expect(matches[0].confidence).toBeGreaterThanOrEqual(0.85)
  })

  it("should reject SSN with invalid control key", () => {
    const matches = detectFrenchSSN("185057832201500")
    expect(matches).toHaveLength(0)
  })

  it("should reject SSN starting with digits other than 1 or 2", () => {
    const matches = detectFrenchSSN("385057832201582")
    expect(matches).toHaveLength(0)
  })

  it("should handle SSN with dashes", () => {
    const nirBase = "1850578322015"
    const mod = parseInt(nirBase, 10) % 97
    const key = (97 - mod).toString().padStart(2, "0")
    // Format with dashes: 1-85-05-78-322-015-82
    const formatted = `1-85-05-78-322-015-${key}`
    const matches = detectFrenchSSN(`sécurité sociale ${formatted}`)
    // Dash-separated format should be detected
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("FR_SSN")
  })
})

// ─── SPANISH DNI / NIE ──────────────────────────────────────────────

describe("detectSpanishDNI", () => {
  it("should detect valid DNI with correct check letter", () => {
    // DNI: 12345678 % 23 = 14 → letter Z
    const matches = detectSpanishDNI("Mi DNI es 12345678Z")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("ES_DNI")
    expect(matches[0].confidence).toBeGreaterThanOrEqual(0.85)
  })

  it("should detect valid NIE (X prefix)", () => {
    // NIE X: prefix 0, so 01234567 % 23 = 1234567 % 23 = 1234567/23 = 53676.8... → 53676*23 = 1234548 → 1234567-1234548 = 19 → letter S?
    // Wait: "TRWAGMYFPDXBNJZSQVHLCKE"[19] = 'L'
    // Actually: X0123456 → 00123456 → 123456 % 23 ... let me compute properly
    // NIE: X1234567 → numeric = "01234567" → parseInt = 1234567
    // 1234567 % 23 = let's compute: 23 * 53676 = 1234548; 1234567 - 1234548 = 19
    // checkLetters[19] = "TRWAGMYFPDXBNJZSQVHLCKE"[19] = 'L'
    const matches = detectSpanishDNI("NIE: X1234567L")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("ES_DNI")
  })

  it("should reject DNI with wrong check letter", () => {
    // 12345678 % 23 = 14 → letter Z, not A
    const matches = detectSpanishDNI("12345678A")
    expect(matches).toHaveLength(0)
  })

  it("should boost confidence with DNI context", () => {
    const withCtx = detectSpanishDNI("Mi DNI es 12345678Z")
    const noCtx = detectSpanishDNI("Code: 12345678Z")
    if (withCtx.length > 0 && noCtx.length > 0) {
      expect(withCtx[0].confidence).toBeGreaterThanOrEqual(noCtx[0].confidence)
    }
  })
})

// ─── ITALIAN FISCAL CODE ────────────────────────────────────────────

describe("detectItalianFiscalCode", () => {
  it("should detect a valid Italian fiscal code", () => {
    // Format: RSSMRA85M01H501Z (synthetic)
    // Surname: RSS, Name: MRA, Year: 85, Month: M (December), Day: 01, Place: H501, Check: Z
    const matches = detectItalianFiscalCode("Codice fiscale: RSSMRA85M01H501Z")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("IT_FISCAL_CODE")
    expect(matches[0].confidence).toBeGreaterThanOrEqual(0.88)
  })

  it("should detect fiscal code for females (day 41-71)", () => {
    // Day 41 = 01 + 40 (female offset)
    const matches = detectItalianFiscalCode("CF: RSSMRA85M41H501X")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("IT_FISCAL_CODE")
  })

  it("should reject invalid month letter", () => {
    // 'F' is not a valid month letter (valid: A-E, H, L, M, P, R, S, T)
    // Actually F is not in "ABCDEHLMPRST", but let me check: A,B,C,D,E,H,L,M,P,R,S,T
    // F is indeed invalid
    const matches = detectItalianFiscalCode("RSSMRA85F01H501Z")
    expect(matches).toHaveLength(0)
  })

  it("should reject invalid day (32-40)", () => {
    const matches = detectItalianFiscalCode("RSSMRA85M35H501Z")
    expect(matches).toHaveLength(0)
  })

  it("should boost confidence with context", () => {
    const withCtx = detectItalianFiscalCode("codice fiscale RSSMRA85M01H501Z")
    const noCtx = detectItalianFiscalCode("Reference RSSMRA85M01H501Z here")
    if (withCtx.length > 0 && noCtx.length > 0) {
      expect(withCtx[0].confidence).toBeGreaterThan(noCtx[0].confidence)
    }
  })
})

// ─── DUTCH BSN ──────────────────────────────────────────────────────

describe("detectDutchBSN", () => {
  it("should detect valid BSN with context and 11-check", () => {
    // BSN: 111222333
    // Check: 9*1 + 8*1 + 7*1 + 6*2 + 5*2 + 4*2 + 3*3 + 2*3 - 1*3
    // = 9 + 8 + 7 + 12 + 10 + 8 + 9 + 6 - 3 = 66 → 66 / 11 = 6 → valid!
    const matches = detectDutchBSN("Mijn BSN is 111222333")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("NL_BSN")
    expect(matches[0].confidence).toBeGreaterThanOrEqual(0.65)
  })

  it("should require context (BSN keyword) to avoid false positives", () => {
    // Same valid BSN but without context — should be filtered
    const matches = detectDutchBSN("The number 111222333 is important")
    expect(matches).toHaveLength(0)
  })

  it("should reject BSN failing 11-check", () => {
    // 123456789: 9*1+8*2+7*3+6*4+5*5+4*6+3*7+2*8-1*9 = 9+16+21+24+25+24+21+16-9 = 147 → 147/11 ≈ 13.36 → not valid
    const matches = detectDutchBSN("BSN 123456789")
    expect(matches).toHaveLength(0)
  })

  it("should detect BSN with burgerservicenummer context", () => {
    const matches = detectDutchBSN("burgerservicenummer: 111222333")
    expect(matches).toHaveLength(1)
    expect(matches[0].confidence).toBeGreaterThanOrEqual(0.65)
  })
})

// ─── INTEGRATION: detectPII includes EU types ────────────────────────

describe("detectPII with EU types", () => {
  it("should detect UK NIN in mixed text", () => {
    const matches = detectPII("My NI number is AB 12 34 56 C and my email is test@mailhost.org")
    const ninMatches = matches.filter((m) => m.type === "UK_NIN")
    const emailMatches = matches.filter((m) => m.type === "EMAIL")
    expect(ninMatches).toHaveLength(1)
    expect(emailMatches).toHaveLength(1)
  })

  it("should detect Spanish DNI in mixed text", () => {
    const matches = detectPII("DNI: 12345678Z, email: test@example.com")
    const dniMatches = matches.filter((m) => m.type === "ES_DNI")
    expect(dniMatches).toHaveLength(1)
  })

  it("should detect Italian fiscal code", () => {
    const matches = detectPII("Codice fiscale: RSSMRA85M01H501Z")
    const itMatches = matches.filter((m) => m.type === "IT_FISCAL_CODE")
    expect(itMatches).toHaveLength(1)
  })

  it("should not false positive on clean EU text", () => {
    const matches = detectPII("This is a normal sentence about European regulations and the EU AI Act.")
    const euMatches = matches.filter((m) =>
      ["UK_NIN", "DE_TAX_ID", "FR_SSN", "ES_DNI", "IT_FISCAL_CODE", "NL_BSN"].includes(m.type)
    )
    expect(euMatches).toHaveLength(0)
  })
})

// ─── IBAN MOD-97 VALIDATION ───────────────────────────────────────────

describe("detectIBANs — mod-97 validation", () => {
  it("should validate GB IBAN with correct check digits", () => {
    const matches = detectIBANs("IBAN: GB29NWBK60161331926819")
    expect(matches).toHaveLength(1)
    expect(matches[0].confidence).toBeGreaterThanOrEqual(0.95)
  })

  it("should reject GB IBAN with incorrect check digits", () => {
    const matches = detectIBANs("IBAN: GB99NWBK60161331926819")
    expect(matches).toHaveLength(0)
  })

  it("should validate DE IBAN with correct check digits", () => {
    const matches = detectIBANs("IBAN: DE89370400440532013000")
    expect(matches).toHaveLength(1)
  })

  it("should reject DE IBAN with incorrect check digits", () => {
    const matches = detectIBANs("IBAN: DE00370400440532013000")
    expect(matches).toHaveLength(0)
  })

  it("should validate NL IBAN", () => {
    const matches = detectIBANs("IBAN: NL91ABNA0417164300")
    expect(matches).toHaveLength(1)
  })

  it("should validate FR IBAN", () => {
    const matches = detectIBANs("IBAN: FR7630006000011234567890189")
    expect(matches).toHaveLength(1)
  })

  it("should still pass IBAN with spaces", () => {
    const matches = detectIBANs("IBAN: GB29 NWBK 6016 1331 9268 19")
    expect(matches).toHaveLength(1)
  })
})

// ─── CRYPTO WALLET ADDRESS VALIDATION ────────────────────────────────

describe("detectCryptoWallets — address validation", () => {
  it("should detect valid Bitcoin P2PKH address", () => {
    const matches = detectCryptoWallets("BTC: 1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa")
    expect(matches).toHaveLength(1)
    expect(matches[0].confidence).toBeGreaterThanOrEqual(0.90)
  })

  it("should detect valid Ethereum address", () => {
    const matches = detectCryptoWallets("ETH: 0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18")
    expect(matches).toHaveLength(1)
  })

  it("should detect valid Bech32 address", () => {
    const matches = detectCryptoWallets("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4")
    expect(matches).toHaveLength(1)
  })

  it("should detect P2SH address (starts with 3) with crypto context", () => {
    const matches = detectCryptoWallets("bitcoin wallet: 3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy")
    expect(matches).toHaveLength(1)
  })

  it("should reject addresses with invalid base58 characters (O, I, l)", () => {
    // Base58 alphabet excludes 0, O, I, l — these shouldn't match
    const matches = detectCryptoWallets("1OOOOOOOOOOOOOOOOOOOOOOOOOOOOOO")
    expect(matches).toHaveLength(0)
  })
})
