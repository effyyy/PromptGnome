/**
 * Comprehensive tests for the international PII detector module.
 * Covers: Australian TFN, Brazilian CPF/CNPJ, Korean RRN, Japanese My Number,
 * UK passport, US ABA routing, US Medicare MBI, Portuguese NIF, Polish PESEL,
 * Swiss AHV, and Mexican CURP.
 * Architecture layer: Tests / Detection
 */

import { describe, it, expect } from "vitest"
import {
  detectAustralianTFN,
  detectBrazilianCPF,
  detectBrazilianCNPJ,
  detectKoreanRRN,
  detectJapaneseMyNumber,
  detectUKPassport,
  detectUSRoutingNumber,
  detectMedicareMBI,
  detectPortugueseNIF,
  detectPolishPESEL,
  detectSwissAHV,
  detectMexicanCURP,
} from "../../src/detection/regex-engine-international"

// ---------------------------------------------------------------------------
// Test data constants — all values are synthetic / fake
// ---------------------------------------------------------------------------

// Australian TFN (9-digit): weights [1,4,3,7,5,8,6,9,10], sum % 11 === 0
// Verified: 1*1+2*4+3*3+0*7+0*5+0*8+0*6+0*9+7*10 = 1+8+9+70 = 88; 88%11=0 ✓
const VALID_TFN = "123000007"
// One digit off — checksum fails
const INVALID_TFN_CHECKSUM = "123000008"
// Formatted with spaces
const VALID_TFN_FORMATTED = "123 000 007"

// Brazilian CPF (11 digits): mod-11 double-check-digit
// Verified: computeCPF("123456789") = "12345678909"
const VALID_CPF_RAW = "12345678909"
const VALID_CPF_FORMATTED = "123.456.789-09"
const INVALID_CPF_CHECKSUM = "12345678900"
const INVALID_CPF_ALL_SAME = "11111111111"

// Brazilian CNPJ (14 digits): mod-11 double-check-digit
// Verified: computeCNPJ("112223330001") = "11222333000181"
const VALID_CNPJ_RAW = "11222333000181"
const VALID_CNPJ_FORMATTED = "11.222.333/0001-81"
const INVALID_CNPJ_CHECKSUM = "11222333000182"
const INVALID_CNPJ_ALL_SAME = "11111111111111"

// South Korean RRN (XXXXXX-XXXXXXX): weights [2,3,4,5,6,7,8,9,2,3,4,5], check=(11-sum%11)%10
// Prefix "900515123456" -> check digit 9
const VALID_RRN = "900515-1234569"
const INVALID_RRN_CHECKSUM = "900515-1234560"
// Gender digit 0 is invalid (must be 1-4)
const INVALID_RRN_GENDER = "900515-0999999"
// Month 13 is invalid
const INVALID_RRN_MONTH = "901315-1234569"

// Japanese My Number (12 digits): weights [6,5,4,3,2,7,6,5,4,3,2], check = rem<=1?0:11-rem
// Verified: computeMyNumber("12345678901") = "123456789018"
const VALID_MY_NUMBER = "123456789018"
const VALID_MY_NUMBER_FORMATTED = "1234-5678-9018"
const INVALID_MY_NUMBER_CHECKSUM = "123456789019"

// UK Passport — 9 digits, purely context-gated
const VALID_UK_PASSPORT = "123456789"

// US ABA Routing Number: 3*(d1+d4+d7)+7*(d2+d5+d8)+(d3+d6+d9) mod 10 == 0
// 021000005 — valid (prefix 02, Federal Reserve NY district)
// 061000007 — valid (prefix 06, Atlanta Fed)
const VALID_ABA_ROUTING_1 = "021000005"
const VALID_ABA_ROUTING_2 = "061000007"
// Prefix 99 is not a valid Federal Reserve district (checksum happens to pass)
const INVALID_ABA_PREFIX = "990000000"
// Modify last digit to break checksum (prefix 02 is valid but checksum fails)
const INVALID_ABA_CHECKSUM = "021000006"

// Medicare MBI: [1-9][A][0-9A-Z][A][0-9][A][0-9][A][A][0-9][0-9]
// where A = [AC-HJKMNP-RT-WY] (no B,I,L,O,S,Z,X)
// Verified: "1E9A5H3KT45" matches regex
const VALID_MBI_1 = "1E9A5H3KT45"
const VALID_MBI_2 = "2H3K5M7NT89"
// Contains 'S' in position 1 — S is excluded from allowed letters
const INVALID_MBI_EXCLUDED_LETTER = "1SA1AC1AA12"
// First digit is 0 — must be 1-9
const INVALID_MBI_ZERO_FIRST = "0A1A1A1AA12"

// Portuguese NIF (9 digits): weights 9,8,7,6,5,4,3,2; check = 11-(sum%11), >=10 → 0
// Verified: computeNIF("12345678") = "123456789"
// Must start with 1,2,3,5,6,9
const VALID_NIF_1 = "123456789"
const VALID_NIF_2 = "256789010"
const INVALID_NIF_CHECKSUM = "123456780"
// Starts with 4 — excluded by regex
const INVALID_NIF_PREFIX = "412345678"

// Polish PESEL (11 digits): weights [1,3,7,9,1,3,7,9,1,3]; check=(10-sum%10)%10
// Verified: computePESEL("9005041234") = "90050412344"
// Month range for 1900s: 01-12 (monthMod = month % 20 must be 1-12)
const VALID_PESEL = "90050412344"
// One digit off checksum
const INVALID_PESEL_CHECKSUM = "90050412345"
// Month 13 is invalid (13 % 20 = 13 > 12)
const INVALID_PESEL_MONTH = "90130412345"

// Swiss AHV (EAN-13 starting with 756): alternating weights 1,3 for first 12, check=(10-sum%10)%10
// Verified: computeAHV("756123456789") = "7561234567897"
const VALID_AHV_RAW = "7561234567897"
const VALID_AHV_FORMATTED = "756.1234.5678.97"

// Mexican CURP (18 chars): [A-Z]{4}+YYMMDD+gender+state+3consonants+1char+1digit
// State must be in approved list; month 1-12; day 1-31
const VALID_CURP = "ABCD900515HGTBCDA5"
const VALID_CURP_FEMALE = "XYZW850315MGTDEFA3"
// State 'XX' not in valid states set
const INVALID_CURP_STATE = "ABCD900515HXXBCDA5"
// Month 13 is invalid
const INVALID_CURP_MONTH = "ABCD901315HGTBCDA5"

// ---------------------------------------------------------------------------
// detectAustralianTFN
// ---------------------------------------------------------------------------

describe("detectAustralianTFN", () => {
  it("should detect a valid 9-digit TFN with context trigger", () => {
    const text = `My TFN is ${VALID_TFN} for my tax return.`
    const matches = detectAustralianTFN(text)
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("AU_TFN")
    expect(matches[0].value).toBe(VALID_TFN)
    expect(matches[0].confidence).toBe(0.92)
  })

  it("should detect a formatted TFN with spaces when context is present", () => {
    const text = `tax file number: ${VALID_TFN_FORMATTED}`
    const matches = detectAustralianTFN(text)
    expect(matches).toHaveLength(1)
    expect(matches[0].confidence).toBe(0.92)
  })

  it("should reject a TFN with invalid checksum even with context", () => {
    const text = `TFN: ${INVALID_TFN_CHECKSUM}`
    const matches = detectAustralianTFN(text)
    expect(matches).toHaveLength(0)
  })

  it("should return empty when context trigger is absent", () => {
    const text = `The number is ${VALID_TFN} please process it.`
    const matches = detectAustralianTFN(text)
    expect(matches).toHaveLength(0)
  })

  it("should return empty for non-matching text", () => {
    expect(detectAustralianTFN("Hello world, no numbers here.")).toHaveLength(0)
  })

  it("should use 'ato' as a valid context trigger", () => {
    const text = `ATO reference: ${VALID_TFN}`
    const matches = detectAustralianTFN(text)
    expect(matches).toHaveLength(1)
    expect(matches[0].confidence).toBe(0.92)
  })

  it("should use 'australian tax' as a valid context trigger", () => {
    const text = `Australian tax: ${VALID_TFN}`
    const matches = detectAustralianTFN(text)
    expect(matches).toHaveLength(1)
    expect(matches[0].confidence).toBe(0.92)
  })
})

// ---------------------------------------------------------------------------
// detectBrazilianCPF
// ---------------------------------------------------------------------------

describe("detectBrazilianCPF", () => {
  it("should detect a valid CPF with context trigger at high confidence", () => {
    const text = `CPF: ${VALID_CPF_RAW}`
    const matches = detectBrazilianCPF(text)
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("BR_CPF")
    expect(matches[0].value).toBe(VALID_CPF_RAW)
    expect(matches[0].confidence).toBe(0.90)
  })

  it("should NOT detect a formatted CPF without context (zero false positives)", () => {
    const text = `Please verify ${VALID_CPF_FORMATTED} for the record.`
    const matches = detectBrazilianCPF(text)
    expect(matches).toHaveLength(0)
  })

  it("should detect with context trigger 'cadastro' at 0.90 confidence", () => {
    const text = `cadastro: ${VALID_CPF_FORMATTED}`
    const matches = detectBrazilianCPF(text)
    expect(matches).toHaveLength(1)
    expect(matches[0].confidence).toBe(0.90)
  })

  it("should detect CPF with invalid checksum when context trigger is present", () => {
    const text = `CPF: ${INVALID_CPF_CHECKSUM}`
    const matches = detectBrazilianCPF(text)
    expect(matches).toHaveLength(1)
    expect(matches[0].confidence).toBe(0.90)
  })

  it("should reject CPF with invalid checksum when NO context trigger is present", () => {
    const text = `Reference ${INVALID_CPF_CHECKSUM} for the file.`
    const matches = detectBrazilianCPF(text)
    expect(matches).toHaveLength(0)
  })

  it("should reject all-same-digit CPF (e.g. 11111111111)", () => {
    const text = `CPF: ${INVALID_CPF_ALL_SAME}`
    const matches = detectBrazilianCPF(text)
    expect(matches).toHaveLength(0)
  })

  it("should return empty when CPF is raw digits without formatting and no context", () => {
    const text = `The reference is ${VALID_CPF_RAW} today.`
    const matches = detectBrazilianCPF(text)
    expect(matches).toHaveLength(0)
  })

  it("should return empty for non-matching text", () => {
    expect(detectBrazilianCPF("No CPF here.")).toHaveLength(0)
  })

  it("should detect with 'pessoa fisica' context trigger", () => {
    const text = `pessoa fisica ${VALID_CPF_FORMATTED}`
    const matches = detectBrazilianCPF(text)
    expect(matches).toHaveLength(1)
    expect(matches[0].confidence).toBe(0.90)
  })
})

// ---------------------------------------------------------------------------
// detectBrazilianCNPJ
// ---------------------------------------------------------------------------

describe("detectBrazilianCNPJ", () => {
  it("should detect a valid CNPJ with context trigger at 0.95", () => {
    const text = `CNPJ: ${VALID_CNPJ_RAW}`
    const matches = detectBrazilianCNPJ(text)
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("BR_CNPJ")
    expect(matches[0].value).toBe(VALID_CNPJ_RAW)
    expect(matches[0].confidence).toBe(0.95)
  })

  it("should detect a formatted CNPJ (XX.XXX.XXX/XXXX-XX) with context", () => {
    const text = `cnpj: ${VALID_CNPJ_FORMATTED}`
    const matches = detectBrazilianCNPJ(text)
    expect(matches).toHaveLength(1)
    expect(matches[0].value).toBe(VALID_CNPJ_FORMATTED)
    expect(matches[0].confidence).toBe(0.95)
  })

  it("should NOT detect formatted CNPJ without context (zero false positives)", () => {
    const text = `Company identifier ${VALID_CNPJ_FORMATTED}.`
    const matches = detectBrazilianCNPJ(text)
    expect(matches).toHaveLength(0)
  })

  it("should reject CNPJ with invalid checksum", () => {
    const text = `CNPJ: ${INVALID_CNPJ_CHECKSUM}`
    const matches = detectBrazilianCNPJ(text)
    expect(matches).toHaveLength(0)
  })

  it("should reject all-same-digit CNPJ", () => {
    const text = `CNPJ: ${INVALID_CNPJ_ALL_SAME}`
    const matches = detectBrazilianCNPJ(text)
    expect(matches).toHaveLength(0)
  })

  it("should return empty when CNPJ lacks slash and context", () => {
    const text = `The number ${VALID_CNPJ_RAW} is referenced here.`
    const matches = detectBrazilianCNPJ(text)
    expect(matches).toHaveLength(0)
  })

  it("should return empty for non-matching text", () => {
    expect(detectBrazilianCNPJ("No CNPJ present.")).toHaveLength(0)
  })

  it("should detect with 'cadastro nacional' context trigger", () => {
    const text = `cadastro nacional: ${VALID_CNPJ_RAW}`
    const matches = detectBrazilianCNPJ(text)
    expect(matches).toHaveLength(1)
    expect(matches[0].confidence).toBe(0.95)
  })

  it("should detect with 'pessoa juridica' context trigger", () => {
    const text = `pessoa juridica ${VALID_CNPJ_RAW}`
    const matches = detectBrazilianCNPJ(text)
    expect(matches).toHaveLength(1)
    expect(matches[0].confidence).toBe(0.95)
  })
})

// ---------------------------------------------------------------------------
// detectKoreanRRN
// ---------------------------------------------------------------------------

describe("detectKoreanRRN", () => {
  it("should NOT detect a valid RRN without context (zero false positives)", () => {
    const text = `The applicant ID is ${VALID_RRN}.`
    const matches = detectKoreanRRN(text)
    expect(matches).toHaveLength(0)
  })

  it("should boost confidence to 0.95 when context trigger 'rrn' is present", () => {
    const text = `RRN: ${VALID_RRN}`
    const matches = detectKoreanRRN(text)
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("KR_RRN")
    expect(matches[0].value).toBe(VALID_RRN)
    expect(matches[0].confidence).toBe(0.95)
  })

  it("should report correct start and end positions", () => {
    const text = `RRN: ${VALID_RRN}`
    const matches = detectKoreanRRN(text)
    expect(matches).toHaveLength(1)
    expect(matches[0].start).toBe(5)
    expect(matches[0].end).toBe(5 + VALID_RRN.length)
  })

  it("should boost confidence with Korean context trigger '주민등록'", () => {
    const text = `주민등록 ${VALID_RRN}`
    const matches = detectKoreanRRN(text)
    expect(matches).toHaveLength(1)
    expect(matches[0].confidence).toBe(0.95)
  })

  it("should reject RRN with invalid checksum", () => {
    const text = `RRN: ${INVALID_RRN_CHECKSUM}`
    const matches = detectKoreanRRN(text)
    expect(matches).toHaveLength(0)
  })

  it("should reject RRN with gender digit 0", () => {
    const text = `The number is ${INVALID_RRN_GENDER}`
    const matches = detectKoreanRRN(text)
    expect(matches).toHaveLength(0)
  })

  it("should reject RRN with invalid month (13)", () => {
    const text = `The number is ${INVALID_RRN_MONTH}`
    const matches = detectKoreanRRN(text)
    expect(matches).toHaveLength(0)
  })

  it("should return empty for non-matching text", () => {
    expect(detectKoreanRRN("No Korean ID here.")).toHaveLength(0)
  })

  it("should detect a second valid RRN correctly", () => {
    // Verified: computeKoreanRRN("850315200001") = "8503152000012"
    const rrn2 = "850315-2000012"
    const text = `resident registration: ${rrn2}`
    const matches = detectKoreanRRN(text)
    expect(matches).toHaveLength(1)
    expect(matches[0].confidence).toBe(0.95)
  })
})

// ---------------------------------------------------------------------------
// detectJapaneseMyNumber
// ---------------------------------------------------------------------------

describe("detectJapaneseMyNumber", () => {
  it("should detect a valid My Number with context trigger at 0.92", () => {
    const text = `My number: ${VALID_MY_NUMBER}`
    const matches = detectJapaneseMyNumber(text)
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("JP_MY_NUMBER")
    expect(matches[0].value).toBe(VALID_MY_NUMBER)
    expect(matches[0].confidence).toBe(0.92)
  })

  it("should detect a formatted My Number (with dashes) with context", () => {
    const text = `個人番号: ${VALID_MY_NUMBER_FORMATTED}`
    const matches = detectJapaneseMyNumber(text)
    expect(matches).toHaveLength(1)
    expect(matches[0].confidence).toBe(0.92)
  })

  it("should reject My Number with invalid checksum even with context", () => {
    const text = `マイナンバー: ${INVALID_MY_NUMBER_CHECKSUM}`
    const matches = detectJapaneseMyNumber(text)
    expect(matches).toHaveLength(0)
  })

  it("should return empty when context trigger is absent", () => {
    const text = `The code is ${VALID_MY_NUMBER} please use it.`
    const matches = detectJapaneseMyNumber(text)
    expect(matches).toHaveLength(0)
  })

  it("should return empty for non-matching text", () => {
    expect(detectJapaneseMyNumber("No Japanese ID here.")).toHaveLength(0)
  })

  it("should detect with 'individual number' context trigger", () => {
    const text = `individual number ${VALID_MY_NUMBER}`
    const matches = detectJapaneseMyNumber(text)
    expect(matches).toHaveLength(1)
    expect(matches[0].confidence).toBe(0.92)
  })

  it("should detect with 'mynumber' context trigger", () => {
    const text = `mynumber: ${VALID_MY_NUMBER}`
    const matches = detectJapaneseMyNumber(text)
    expect(matches).toHaveLength(1)
    expect(matches[0].confidence).toBe(0.92)
  })

  it("should detect a second valid My Number", () => {
    // computeMyNumber("98765432109") = "987654321093"
    const mn2 = "987654321093"
    const text = `kojin bangō: ${mn2}`
    const matches = detectJapaneseMyNumber(text)
    expect(matches).toHaveLength(1)
    expect(matches[0].confidence).toBe(0.92)
  })
})

// ---------------------------------------------------------------------------
// detectUKPassport
// ---------------------------------------------------------------------------

describe("detectUKPassport", () => {
  it("should detect a 9-digit number as UK passport when 'passport' context is present", () => {
    const text = `passport: ${VALID_UK_PASSPORT}`
    const matches = detectUKPassport(text)
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("PASSPORT_UK")
    expect(matches[0].value).toBe(VALID_UK_PASSPORT)
    expect(matches[0].confidence).toBe(0.88)
  })

  it("should detect with 'uk passport' context trigger", () => {
    const text = `uk passport ${VALID_UK_PASSPORT}`
    const matches = detectUKPassport(text)
    expect(matches).toHaveLength(1)
    expect(matches[0].confidence).toBe(0.88)
  })

  it("should detect with 'british passport' context trigger", () => {
    const text = `british passport number: ${VALID_UK_PASSPORT}`
    const matches = detectUKPassport(text)
    expect(matches).toHaveLength(1)
  })

  it("should detect with 'passport no' context trigger", () => {
    const text = `passport no: ${VALID_UK_PASSPORT}`
    const matches = detectUKPassport(text)
    expect(matches).toHaveLength(1)
  })

  it("should return empty when context trigger is absent", () => {
    const text = `The ID is ${VALID_UK_PASSPORT} for the order.`
    const matches = detectUKPassport(text)
    expect(matches).toHaveLength(0)
  })

  it("should return empty for non-matching text", () => {
    expect(detectUKPassport("No passport here.")).toHaveLength(0)
  })

  it("should not match an 8-digit number (too short)", () => {
    const text = `passport: 12345678`
    const matches = detectUKPassport(text)
    expect(matches).toHaveLength(0)
  })

  it("should not match a 10-digit number (too long)", () => {
    // The regex pattern is \b(\d{9})\b — so 10 consecutive digits won't match
    const text = `passport: 1234567890`
    const matches = detectUKPassport(text)
    expect(matches).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// detectUSRoutingNumber
// ---------------------------------------------------------------------------

describe("detectUSRoutingNumber", () => {
  it("should detect a valid ABA routing number with context trigger at 0.92", () => {
    const text = `routing number: ${VALID_ABA_ROUTING_1}`
    const matches = detectUSRoutingNumber(text)
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("US_ROUTING")
    expect(matches[0].value).toBe(VALID_ABA_ROUTING_1)
    expect(matches[0].confidence).toBe(0.92)
  })

  it("should detect a second valid routing number with 'aba' context trigger", () => {
    const text = `ABA: ${VALID_ABA_ROUTING_2}`
    const matches = detectUSRoutingNumber(text)
    expect(matches).toHaveLength(1)
    expect(matches[0].confidence).toBe(0.92)
  })

  it("should detect with 'bank routing' context trigger", () => {
    const text = `bank routing ${VALID_ABA_ROUTING_1}`
    const matches = detectUSRoutingNumber(text)
    expect(matches).toHaveLength(1)
  })

  it("should detect with 'transit number' context trigger", () => {
    const text = `transit number: ${VALID_ABA_ROUTING_1}`
    const matches = detectUSRoutingNumber(text)
    expect(matches).toHaveLength(1)
  })

  it("should reject a number with an invalid Federal Reserve prefix (99)", () => {
    const text = `routing: ${INVALID_ABA_PREFIX}`
    const matches = detectUSRoutingNumber(text)
    expect(matches).toHaveLength(0)
  })

  it("should reject a number with invalid ABA checksum", () => {
    const text = `routing: ${INVALID_ABA_CHECKSUM}`
    const matches = detectUSRoutingNumber(text)
    expect(matches).toHaveLength(0)
  })

  it("should return empty when context trigger is absent", () => {
    const text = `The number ${VALID_ABA_ROUTING_1} is in the document.`
    const matches = detectUSRoutingNumber(text)
    expect(matches).toHaveLength(0)
  })

  it("should return empty for non-matching text", () => {
    expect(detectUSRoutingNumber("No routing number here.")).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// detectMedicareMBI
// ---------------------------------------------------------------------------

describe("detectMedicareMBI", () => {
  it("should NOT detect MBI without context (requires context trigger)", () => {
    // No context trigger words (medicare, mbi, beneficiary, cms) in this text
    const text = `The identifier is ${VALID_MBI_1}.`
    const matches = detectMedicareMBI(text)
    // MBI now requires context — returns 0 matches without a trigger
    expect(matches).toHaveLength(0)
  })

  it("should boost confidence to 0.93 when 'medicare' context is present", () => {
    const text = `medicare: ${VALID_MBI_1}`
    const matches = detectMedicareMBI(text)
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("MEDICARE_MBI")
    expect(matches[0].value).toBe(VALID_MBI_1)
    expect(matches[0].confidence).toBe(0.93)
  })

  it("should detect with 'cms' context trigger", () => {
    const text = `cms ${VALID_MBI_1}`
    const matches = detectMedicareMBI(text)
    expect(matches).toHaveLength(1)
    expect(matches[0].confidence).toBe(0.93)
  })

  it("should detect with 'medicare number' context trigger", () => {
    const text = `medicare number: ${VALID_MBI_1}`
    const matches = detectMedicareMBI(text)
    expect(matches).toHaveLength(1)
    expect(matches[0].confidence).toBe(0.93)
  })

  it("should boost confidence with 'mbi' context trigger", () => {
    const text = `MBI: ${VALID_MBI_2}`
    const matches = detectMedicareMBI(text)
    expect(matches).toHaveLength(1)
    expect(matches[0].confidence).toBe(0.93)
  })

  it("should boost confidence with 'beneficiary' context trigger", () => {
    const text = `beneficiary ${VALID_MBI_1}`
    const matches = detectMedicareMBI(text)
    expect(matches).toHaveLength(1)
    expect(matches[0].confidence).toBe(0.93)
  })

  it("should detect a second valid MBI value", () => {
    const text = `medicare id ${VALID_MBI_2}`
    const matches = detectMedicareMBI(text)
    expect(matches).toHaveLength(1)
    expect(matches[0].confidence).toBe(0.93)
  })

  it("should reject MBI with excluded letter S in position 1", () => {
    const text = `medicare: ${INVALID_MBI_EXCLUDED_LETTER}`
    const matches = detectMedicareMBI(text)
    expect(matches).toHaveLength(0)
  })

  it("should reject MBI starting with digit 0", () => {
    const text = `medicare: ${INVALID_MBI_ZERO_FIRST}`
    const matches = detectMedicareMBI(text)
    expect(matches).toHaveLength(0)
  })

  it("should return empty for non-matching text", () => {
    expect(detectMedicareMBI("No MBI here.")).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// detectPortugueseNIF
// ---------------------------------------------------------------------------

describe("detectPortugueseNIF", () => {
  it("should detect a valid NIF with context trigger at 0.92", () => {
    const text = `NIF: ${VALID_NIF_1}`
    const matches = detectPortugueseNIF(text)
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("PT_NIF")
    expect(matches[0].value).toBe(VALID_NIF_1)
    expect(matches[0].confidence).toBe(0.92)
  })

  it("should detect a second valid NIF with 'contribuinte' context trigger", () => {
    const text = `contribuinte: ${VALID_NIF_2}`
    const matches = detectPortugueseNIF(text)
    expect(matches).toHaveLength(1)
    expect(matches[0].confidence).toBe(0.92)
  })

  it("should detect with 'tax identification' context trigger", () => {
    const text = `tax identification: ${VALID_NIF_1}`
    const matches = detectPortugueseNIF(text)
    expect(matches).toHaveLength(1)
  })

  it("should reject NIF with invalid checksum even with context", () => {
    const text = `NIF: ${INVALID_NIF_CHECKSUM}`
    const matches = detectPortugueseNIF(text)
    expect(matches).toHaveLength(0)
  })

  it("should not match a number starting with 4 (regex-level rejection)", () => {
    const text = `NIF: ${INVALID_NIF_PREFIX}`
    const matches = detectPortugueseNIF(text)
    expect(matches).toHaveLength(0)
  })

  it("should return empty when context trigger is absent", () => {
    const text = `The code is ${VALID_NIF_1} in the file.`
    const matches = detectPortugueseNIF(text)
    expect(matches).toHaveLength(0)
  })

  it("should return empty for non-matching text", () => {
    expect(detectPortugueseNIF("No NIF present.")).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// detectPolishPESEL
// ---------------------------------------------------------------------------

describe("detectPolishPESEL", () => {
  it("should detect a valid PESEL with context trigger at 0.92", () => {
    const text = `PESEL: ${VALID_PESEL}`
    const matches = detectPolishPESEL(text)
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("PL_PESEL")
    expect(matches[0].value).toBe(VALID_PESEL)
    expect(matches[0].confidence).toBe(0.92)
  })

  it("should detect with 'personal identification' context trigger", () => {
    const text = `personal identification: ${VALID_PESEL}`
    const matches = detectPolishPESEL(text)
    expect(matches).toHaveLength(1)
    expect(matches[0].confidence).toBe(0.92)
  })

  it("should reject PESEL with invalid checksum even with context", () => {
    const text = `PESEL: ${INVALID_PESEL_CHECKSUM}`
    const matches = detectPolishPESEL(text)
    expect(matches).toHaveLength(0)
  })

  it("should reject PESEL with invalid month (13) even with context", () => {
    const text = `PESEL: ${INVALID_PESEL_MONTH}`
    const matches = detectPolishPESEL(text)
    expect(matches).toHaveLength(0)
  })

  it("should return empty when context trigger is absent", () => {
    const text = `The number is ${VALID_PESEL} in the register.`
    const matches = detectPolishPESEL(text)
    expect(matches).toHaveLength(0)
  })

  it("should return empty for non-matching text", () => {
    expect(detectPolishPESEL("No PESEL here.")).toHaveLength(0)
  })

  it("should detect a 2000s-born PESEL (month + 20 encoding)", () => {
    // computePESEL("0021154321") = "00211543211"
    // Month 21 means January in 2000s (21 % 20 = 1)
    const text = `ewidencji ludności: 00211543211`
    const matches = detectPolishPESEL(text)
    expect(matches).toHaveLength(1)
    expect(matches[0].confidence).toBe(0.92)
  })
})

// ---------------------------------------------------------------------------
// detectSwissAHV
// ---------------------------------------------------------------------------

describe("detectSwissAHV", () => {
  it("should NOT detect a valid formatted AHV number without context (zero false positives)", () => {
    const text = `The barcode number is ${VALID_AHV_FORMATTED}.`
    const matches = detectSwissAHV(text)
    expect(matches).toHaveLength(0)
  })

  it("should boost confidence to 0.95 when 'ahv' context trigger is present", () => {
    const text = `AHV: ${VALID_AHV_FORMATTED}`
    const matches = detectSwissAHV(text)
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("CH_AHV")
    expect(matches[0].value).toBe(VALID_AHV_FORMATTED)
    expect(matches[0].confidence).toBe(0.95)
  })

  it("should detect with 'sozialversicherung' context trigger", () => {
    const text = `sozialversicherung: ${VALID_AHV_FORMATTED}`
    const matches = detectSwissAHV(text)
    expect(matches).toHaveLength(1)
    expect(matches[0].confidence).toBe(0.95)
  })

  it("should detect with 'assurance sociale' context trigger", () => {
    const text = `assurance sociale ${VALID_AHV_FORMATTED}`
    const matches = detectSwissAHV(text)
    expect(matches).toHaveLength(1)
    expect(matches[0].confidence).toBe(0.95)
  })

  it("should boost confidence with 'avs' context trigger", () => {
    const text = `avs: ${VALID_AHV_FORMATTED}`
    const matches = detectSwissAHV(text)
    expect(matches).toHaveLength(1)
    expect(matches[0].confidence).toBe(0.95)
  })

  it("should boost confidence with 'ahv-nr' context trigger", () => {
    const text = `ahv-nr: ${VALID_AHV_FORMATTED}`
    const matches = detectSwissAHV(text)
    expect(matches).toHaveLength(1)
    expect(matches[0].confidence).toBe(0.95)
  })

  it("should detect a raw (unformatted) valid AHV number", () => {
    const text = `sozialversicherung: ${VALID_AHV_RAW}`
    const matches = detectSwissAHV(text)
    expect(matches).toHaveLength(1)
    expect(matches[0].confidence).toBe(0.95)
  })

  it("should reject AHV with invalid EAN-13 checksum", () => {
    const text = `AHV: 756.1234.5678.98`
    const matches = detectSwissAHV(text)
    expect(matches).toHaveLength(0)
  })

  it("should return empty for non-matching text", () => {
    expect(detectSwissAHV("No AHV number here.")).toHaveLength(0)
  })

  it("should detect a second valid AHV value", () => {
    // computeAHV("756987654321") = "7569876543217"
    const text = `assurance sociale: 756.9876.5432.17`
    const matches = detectSwissAHV(text)
    expect(matches).toHaveLength(1)
    expect(matches[0].confidence).toBe(0.95)
  })
})

// ---------------------------------------------------------------------------
// detectMexicanCURP
// ---------------------------------------------------------------------------

describe("detectMexicanCURP", () => {
  it("should NOT detect CURP without context (requires context trigger)", () => {
    // No context trigger words (curp, registro, clave) in this text
    const text = `Please enter ${VALID_CURP} to proceed.`
    const matches = detectMexicanCURP(text)
    // CURP now requires context — returns 0 matches without a trigger
    expect(matches).toHaveLength(0)
  })

  it("should boost confidence to 0.95 when 'curp' context trigger is present", () => {
    const text = `curp: ${VALID_CURP}`
    const matches = detectMexicanCURP(text)
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("MX_CURP")
    expect(matches[0].value).toBe(VALID_CURP)
    expect(matches[0].confidence).toBe(0.95)
  })

  it("should detect with 'clave única' (accented) context trigger", () => {
    const text = `clave única: ${VALID_CURP}`
    const matches = detectMexicanCURP(text)
    expect(matches).toHaveLength(1)
    expect(matches[0].confidence).toBe(0.95)
  })

  it("should detect a female CURP with 'clave unica' context", () => {
    const text = `clave unica ${VALID_CURP_FEMALE}`
    const matches = detectMexicanCURP(text)
    expect(matches).toHaveLength(1)
    expect(matches[0].confidence).toBe(0.95)
  })

  it("should detect with 'registro de poblacion' context trigger", () => {
    const text = `registro de poblacion: ${VALID_CURP}`
    const matches = detectMexicanCURP(text)
    expect(matches).toHaveLength(1)
    expect(matches[0].confidence).toBe(0.95)
  })

  it("should reject CURP with invalid state code (XX)", () => {
    const text = `curp: ${INVALID_CURP_STATE}`
    const matches = detectMexicanCURP(text)
    expect(matches).toHaveLength(0)
  })

  it("should reject CURP with invalid month (13)", () => {
    const text = `curp: ${INVALID_CURP_MONTH}`
    const matches = detectMexicanCURP(text)
    expect(matches).toHaveLength(0)
  })

  it("should return empty for non-matching text", () => {
    expect(detectMexicanCURP("No CURP here.")).toHaveLength(0)
  })

  it("should NOT detect CURP without context at base confidence", () => {
    const text = `Send your data: ${VALID_CURP} today.`
    const matches = detectMexicanCURP(text)
    // CURP now requires context — returns 0 matches without a trigger
    expect(matches).toHaveLength(0)
  })

  it("should not match a lowercase CURP (pattern requires uppercase)", () => {
    const lowerCURP = VALID_CURP.toLowerCase()
    const text = `curp: ${lowerCURP}`
    const matches = detectMexicanCURP(text)
    expect(matches).toHaveLength(0)
  })
})
