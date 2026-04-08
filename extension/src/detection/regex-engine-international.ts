/**
 * Additional international PII detectors and US financial identifiers.
 * Covers: Australian TFN, Brazilian CPF/CNPJ, South Korean RRN,
 * Japanese My Number, UK passport, US ABA routing number, US Medicare MBI,
 * Portuguese NIF, Polish PESEL, Swiss AHV, Mexican CURP/RFC,
 * Indian PAN, Chinese National ID.
 * Architecture layer: Detection (international sub-module)
 */

import { type DetectorMatch, scanWithRegex, hasContextTrigger } from "./regex-helpers"

/**
 * Detects Australian Tax File Numbers (8-9 digits with weighted checksum).
 * Context-gated to reduce false positives.
 * @param text - Input text to scan
 * @returns Array of Australian TFN matches
 */
export function detectAustralianTFN(text: string): DetectorMatch[] {
  const pattern = /\b(\d{3}[\s-]?\d{3}[\s-]?\d{2,3})\b/g
  const raw = scanWithRegex(text, pattern, "AU_TFN", 0.60)
  return raw
    .filter((m) => {
      const digits = m.value.replace(/\D/g, "")
      if (digits.length !== 8 && digits.length !== 9) return false
      // TFN weighted checksum: weights [1, 4, 3, 7, 5, 8, 6, 9, 10] for 9-digit
      const weights9 = [1, 4, 3, 7, 5, 8, 6, 9, 10]
      const weights8 = [10, 7, 8, 4, 6, 3, 5, 1] // 8-digit historical format
      const weights = digits.length === 9 ? weights9 : weights8
      let sum = 0
      for (let i = 0; i < digits.length; i++) {
        sum += parseInt(digits[i], 10) * weights[i]
      }
      return sum % 11 === 0
    })
    .map((m) => {
      if (hasContextTrigger(text, m.start, [
        "tfn", "tax file", "tax file number", "australian tax",
        "ato", "tax number"
      ])) {
        return { ...m, confidence: 0.92 }
      }
      return { ...m, confidence: 0.0 }
    })
    .filter((m) => m.confidence > 0)
}

/**
 * Detects Brazilian CPF numbers (XXX.XXX.XXX-XX, 11 digits with checksum).
 * @param text - Input text to scan
 * @returns Array of CPF matches
 */
export function detectBrazilianCPF(text: string): DetectorMatch[] {
  const CPF_CONTEXT = ["cpf", "cadastro", "pessoa física", "pessoa fisica"]
  const pattern = /\b(\d{3}\.?\d{3}\.?\d{3}[-.]?\d{2})\b/g
  const raw = scanWithRegex(text, pattern, "BR_CPF", 0.60)
  return raw
    .filter((m) => {
      const digits = m.value.replace(/\D/g, "")
      if (digits.length !== 11) return false
      // Reject all-same digits
      if (/^(\d)\1{10}$/.test(digits)) return false
      // When context trigger is present, skip checksum — user explicitly labeled it as CPF
      const hasContext = hasContextTrigger(text, m.start, CPF_CONTEXT)
      if (hasContext) return true
      // Without context, validate checksum
      let sum = 0
      for (let i = 0; i < 9; i++) {
        sum += parseInt(digits[i], 10) * (10 - i)
      }
      let check1 = 11 - (sum % 11)
      if (check1 >= 10) check1 = 0
      if (check1 !== parseInt(digits[9], 10)) return false
      sum = 0
      for (let i = 0; i < 10; i++) {
        sum += parseInt(digits[i], 10) * (11 - i)
      }
      let check2 = 11 - (sum % 11)
      if (check2 >= 10) check2 = 0
      return check2 === parseInt(digits[10], 10)
    })
    .map((m) => {
      if (hasContextTrigger(text, m.start, CPF_CONTEXT)) {
        return { ...m, confidence: 0.90 }
      }
      return { ...m, confidence: 0.0 }
    })
    .filter((m) => m.confidence > 0)
}

/**
 * Detects Brazilian CNPJ numbers (XX.XXX.XXX/XXXX-XX, 14 digits with checksum).
 * @param text - Input text to scan
 * @returns Array of CNPJ matches
 */
export function detectBrazilianCNPJ(text: string): DetectorMatch[] {
  const pattern = /\b(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}[-.]?\d{2})\b/g
  const raw = scanWithRegex(text, pattern, "BR_CNPJ", 0.60)
  return raw
    .filter((m) => {
      const digits = m.value.replace(/\D/g, "")
      if (digits.length !== 14) return false
      if (/^(\d)\1{13}$/.test(digits)) return false
      // First check digit
      const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      let sum = 0
      for (let i = 0; i < 12; i++) {
        sum += parseInt(digits[i], 10) * w1[i]
      }
      let check1 = sum % 11 < 2 ? 0 : 11 - (sum % 11)
      if (check1 !== parseInt(digits[12], 10)) return false
      // Second check digit
      const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      sum = 0
      for (let i = 0; i < 13; i++) {
        sum += parseInt(digits[i], 10) * w2[i]
      }
      let check2 = sum % 11 < 2 ? 0 : 11 - (sum % 11)
      return check2 === parseInt(digits[13], 10)
    })
    .map((m) => {
      if (hasContextTrigger(text, m.start, [
        "cnpj", "cadastro nacional", "pessoa jurídica", "pessoa juridica"
      ])) {
        return { ...m, confidence: 0.95 }
      }
      // REQUIRE context — formatted 14-digit numbers can appear in other number systems
      return { ...m, confidence: 0.0 }
    })
    .filter((m) => m.confidence > 0)
}

/**
 * Detects South Korean Resident Registration Numbers (XXXXXX-XXXXXXX).
 * Context-gated due to sensitivity. 13 digits with gender/century digit.
 * @param text - Input text to scan
 * @returns Array of Korean RRN matches
 */
export function detectKoreanRRN(text: string): DetectorMatch[] {
  const pattern = /\b(\d{6}[-]\d{7})\b/g
  const raw = scanWithRegex(text, pattern, "KR_RRN", 0.60)
  return raw
    .filter((m) => {
      const digits = m.value.replace(/\D/g, "")
      if (digits.length !== 13) return false
      // First digit of second part: 1-4 (gender/century)
      const gender = parseInt(digits[6], 10)
      if (gender < 1 || gender > 4) return false
      // Validate birth date portion
      const month = parseInt(digits.slice(2, 4), 10)
      const day = parseInt(digits.slice(4, 6), 10)
      if (month < 1 || month > 12 || day < 1 || day > 31) return false
      // Checksum validation
      const weights = [2, 3, 4, 5, 6, 7, 8, 9, 2, 3, 4, 5]
      let sum = 0
      for (let i = 0; i < 12; i++) {
        sum += parseInt(digits[i], 10) * weights[i]
      }
      const check = (11 - (sum % 11)) % 10
      return check === parseInt(digits[12], 10)
    })
    .map((m) => {
      if (hasContextTrigger(text, m.start, [
        "주민등록", "resident registration", "rrn", "주민번호"
      ])) {
        return { ...m, confidence: 0.95 }
      }
      // REQUIRE context — 6-7 digit dash-separated numbers are common (dates, serials)
      return { ...m, confidence: 0.0 }
    })
    .filter((m) => m.confidence > 0)
}

/**
 * Detects Japanese My Number (Individual Number, 12 digits with checksum).
 * Context-gated to avoid false positives on generic 12-digit numbers.
 * @param text - Input text to scan
 * @returns Array of My Number matches
 */
export function detectJapaneseMyNumber(text: string): DetectorMatch[] {
  const pattern = /\b(\d{4}[\s-]?\d{4}[\s-]?\d{4})\b/g
  const raw = scanWithRegex(text, pattern, "JP_MY_NUMBER", 0.60)
  return raw
    .filter((m) => {
      const digits = m.value.replace(/\D/g, "")
      if (digits.length !== 12) return false
      // Check digit: weighted sum of first 11 digits
      const weights = [6, 5, 4, 3, 2, 7, 6, 5, 4, 3, 2]
      let sum = 0
      for (let i = 0; i < 11; i++) {
        sum += parseInt(digits[i], 10) * weights[i]
      }
      const remainder = sum % 11
      const check = remainder <= 1 ? 0 : 11 - remainder
      return check === parseInt(digits[11], 10)
    })
    .map((m) => {
      if (hasContextTrigger(text, m.start, [
        "マイナンバー", "my number", "個人番号", "kojin bangō",
        "individual number", "mynumber"
      ])) {
        return { ...m, confidence: 0.92 }
      }
      return { ...m, confidence: 0.0 }
    })
    .filter((m) => m.confidence > 0)
}

/**
 * Detects UK passport numbers (9 digits, context-gated).
 * @param text - Input text to scan
 * @returns Array of UK passport matches
 */
export function detectUKPassport(text: string): DetectorMatch[] {
  const pattern = /\b(\d{9})\b/g
  const raw = scanWithRegex(text, pattern, "PASSPORT_UK", 0.60)
  return raw
    .map((m) => {
      if (hasContextTrigger(text, m.start, [
        "passport", "uk passport", "british passport", "hm passport",
        "passport no", "passport number"
      ])) {
        return { ...m, confidence: 0.88 }
      }
      return { ...m, confidence: 0.0 }
    })
    .filter((m) => m.confidence > 0)
}

/**
 * Detects US ABA routing transit numbers (9 digits with checksum).
 * Context-gated because 9-digit numbers are common.
 * @param text - Input text to scan
 * @returns Array of routing number matches
 */
export function detectUSRoutingNumber(text: string): DetectorMatch[] {
  const pattern = /\b(\d{9})\b/g
  const raw = scanWithRegex(text, pattern, "US_ROUTING", 0.60)
  return raw
    .filter((m) => {
      const digits = m.value
      // ABA checksum: 3*(d1+d4+d7) + 7*(d2+d5+d8) + (d3+d6+d9) mod 10 == 0
      const sum =
        3 * (parseInt(digits[0], 10) + parseInt(digits[3], 10) + parseInt(digits[6], 10)) +
        7 * (parseInt(digits[1], 10) + parseInt(digits[4], 10) + parseInt(digits[7], 10)) +
        (parseInt(digits[2], 10) + parseInt(digits[5], 10) + parseInt(digits[8], 10))
      if (sum % 10 !== 0) return false
      // First 2 digits must be valid Federal Reserve district (01-12, 21-32, 61-72, 80)
      const prefix = parseInt(digits.slice(0, 2), 10)
      const validRanges = (prefix >= 1 && prefix <= 12) ||
        (prefix >= 21 && prefix <= 32) ||
        (prefix >= 61 && prefix <= 72) ||
        prefix === 80
      return validRanges
    })
    .map((m) => {
      if (hasContextTrigger(text, m.start, [
        "routing", "routing number", "aba", "transit number",
        "routing:", "aba:", "bank routing"
      ])) {
        return { ...m, confidence: 0.92 }
      }
      return { ...m, confidence: 0.0 }
    })
    .filter((m) => m.confidence > 0)
}

/**
 * Detects US Medicare Beneficiary Identifiers (MBI format: 1C-AN-A9A-AA99).
 * @param text - Input text to scan
 * @returns Array of Medicare MBI matches
 */
export function detectMedicareMBI(text: string): DetectorMatch[] {
  // MBI format: C = digit 1-9, A = uppercase letter (no S,L,O,I,B,Z), N = digit 0-9
  // Pattern: 1C AN A9A AA99  (no hyphens in actual MBI, but may appear with dashes)
  const allowedLetters = "[AC-HJKMNP-RT-WY]"
  const pattern = new RegExp(
    `\\b([1-9]${allowedLetters}[0-9A-Z]${allowedLetters}[0-9]${allowedLetters}[0-9]${allowedLetters}${allowedLetters}[0-9]{2})\\b`,
    "g"
  )
  const raw = scanWithRegex(text, pattern, "MEDICARE_MBI", 0.60)
  return raw.map((m) => {
    if (hasContextTrigger(text, m.start, [
      "medicare", "mbi", "beneficiary", "cms", "medicare id",
      "medicare number", "medicare:"
    ])) {
      return { ...m, confidence: 0.93 }
    }
    return { ...m, confidence: 0.0 }
  }).filter((m) => m.confidence > 0)
}

/**
 * Detects Portuguese NIF (Tax Identification Number, 9 digits with checksum).
 * @param text - Input text to scan
 * @returns Array of Portuguese NIF matches
 */
export function detectPortugueseNIF(text: string): DetectorMatch[] {
  const pattern = /\b([123569]\d{8})\b/g
  const raw = scanWithRegex(text, pattern, "PT_NIF", 0.60)
  return raw
    .filter((m) => {
      const digits = m.value
      // Checksum: weights 9,8,7,6,5,4,3,2 for first 8 digits
      let sum = 0
      for (let i = 0; i < 8; i++) {
        sum += parseInt(digits[i], 10) * (9 - i)
      }
      const check = 11 - (sum % 11)
      const expected = check >= 10 ? 0 : check
      return expected === parseInt(digits[8], 10)
    })
    .map((m) => {
      if (hasContextTrigger(text, m.start, [
        "nif", "contribuinte", "tax identification", "número fiscal"
      ])) {
        return { ...m, confidence: 0.92 }
      }
      return { ...m, confidence: 0.0 }
    })
    .filter((m) => m.confidence > 0)
}

/**
 * Detects Polish PESEL (Universal Electronic System for Registration of the Population).
 * 11 digits encoding birthdate + gender + checksum.
 * @param text - Input text to scan
 * @returns Array of PESEL matches
 */
export function detectPolishPESEL(text: string): DetectorMatch[] {
  const pattern = /\b(\d{11})\b/g
  const raw = scanWithRegex(text, pattern, "PL_PESEL", 0.60)
  return raw
    .filter((m) => {
      const digits = m.value
      // Weighted checksum
      const weights = [1, 3, 7, 9, 1, 3, 7, 9, 1, 3]
      let sum = 0
      for (let i = 0; i < 10; i++) {
        sum += parseInt(digits[i], 10) * weights[i]
      }
      const check = (10 - (sum % 10)) % 10
      if (check !== parseInt(digits[10], 10)) return false
      // Validate month (01-12, 21-32 for 2000s, 41-52 for 2100s, etc.)
      const month = parseInt(digits.slice(2, 4), 10)
      const monthMod = month % 20
      if (monthMod < 1 || monthMod > 12) return false
      // Validate day
      const day = parseInt(digits.slice(4, 6), 10)
      return day >= 1 && day <= 31
    })
    .map((m) => {
      if (hasContextTrigger(text, m.start, [
        "pesel", "ewidencji ludności", "personal identification"
      ])) {
        return { ...m, confidence: 0.92 }
      }
      return { ...m, confidence: 0.0 }
    })
    .filter((m) => m.confidence > 0)
}

/**
 * Detects Swiss AHV/AVS numbers (756.XXXX.XXXX.XX format with EAN-13 checksum).
 * @param text - Input text to scan
 * @returns Array of Swiss AHV matches
 */
export function detectSwissAHV(text: string): DetectorMatch[] {
  const pattern = /\b(756\.?\d{4}\.?\d{4}\.?\d{2})\b/g
  const raw = scanWithRegex(text, pattern, "CH_AHV", 0.80)
  return raw
    .filter((m) => {
      const digits = m.value.replace(/\D/g, "")
      if (digits.length !== 13) return false
      // EAN-13 checksum
      let sum = 0
      for (let i = 0; i < 12; i++) {
        sum += parseInt(digits[i], 10) * (i % 2 === 0 ? 1 : 3)
      }
      const check = (10 - (sum % 10)) % 10
      return check === parseInt(digits[12], 10)
    })
    .map((m) => {
      if (hasContextTrigger(text, m.start, [
        "ahv", "avs", "sozialversicherung", "assurance sociale",
        "ahv-nr", "avs-nr"
      ])) {
        return { ...m, confidence: 0.95 }
      }
      // REQUIRE context — 756-prefixed EAN-13 barcodes are common in Swiss retail
      return { ...m, confidence: 0.0 }
    })
    .filter((m) => m.confidence > 0)
}

/**
 * Detects Mexican CURP (Clave Única de Registro de Población, 18 chars).
 * @param text - Input text to scan
 * @returns Array of Mexican CURP matches
 */
export function detectMexicanCURP(text: string): DetectorMatch[] {
  // CURP: 4 letters + 6 digits (YYMMDD) + gender letter (H/M) + 2 state letters + 3 consonants + 1 digit/letter + 1 check digit
  const pattern = /\b([A-Z]{4}\d{6}[HM][A-Z]{2}[A-Z]{3}[A-Z0-9]\d)\b/g
  const raw = scanWithRegex(text, pattern, "MX_CURP", 0.85)
  return raw
    .filter((m) => {
      // Validate date portion
      const val = m.value
      const month = parseInt(val.slice(6, 8), 10)
      const day = parseInt(val.slice(8, 10), 10)
      if (month < 1 || month > 12 || day < 1 || day > 31) return false
      // Validate state code (2-letter Mexican state abbreviations)
      const validStates = new Set([
        "AS", "BC", "BS", "CC", "CL", "CM", "CS", "CH", "DF", "DG",
        "GT", "GR", "HG", "JC", "MC", "MN", "MS", "NT", "NL", "OC",
        "PL", "QT", "QR", "SP", "SL", "SR", "TC", "TS", "TL", "VZ",
        "YN", "ZS", "NE"
      ])
      const state = val.slice(11, 13)
      return validStates.has(state)
    })
    .map((m) => {
      if (hasContextTrigger(text, m.start, [
        "curp", "registro de población", "registro de poblacion",
        "clave única", "clave unica"
      ])) {
        return { ...m, confidence: 0.95 }
      }
      return { ...m, confidence: 0.0 }
    })
    .filter((m) => m.confidence > 0)
}

/**
 * Detects Indian Permanent Account Numbers (PAN).
 * Format: 5 uppercase letters + 4 digits + 1 uppercase letter.
 * Fourth letter indicates entity type (P=Person, C=Company, H=HUF, etc.).
 * Context-gated to avoid matching random alphanumeric codes.
 * @param text - Input text to scan
 * @returns Array of Indian PAN matches
 */
export function detectIndianPAN(text: string): DetectorMatch[] {
  // PAN: [A-Z]{3}[ABCFGHLJPT][A-Z][0-9]{4}[A-Z]
  // 4th char: A=AOP, B=BOI, C=Company, F=Firm, G=Govt, H=HUF, J=AJP, L=Local, P=Person, T=Trust
  const pattern = /\b([A-Z]{3}[ABCFGHLJPT][A-Z]\d{4}[A-Z])\b/g
  const raw = scanWithRegex(text, pattern, "IN_PAN", 0.60)
  return raw
    .map((m) => {
      const preceding = text.slice(Math.max(0, m.start - 100), m.start).toLowerCase()
      // Multi-word triggers are safe (no ambiguity)
      const hasMultiWord = ["pan card", "pan number", "pan no", "permanent account", "income tax", "pan:"].some(
        (t) => preceding.includes(t)
      )
      // Bare "PAN" must be a standalone word (\b) to avoid matching "japan", "company", etc.
      const hasPanWord = !hasMultiWord && /\bpan\b/.test(preceding)
      if (!hasMultiWord && !hasPanWord) {
        return { ...m, confidence: 0.0 }
      }
      return { ...m, confidence: 0.93 }
    })
    .filter((m) => m.confidence > 0)
}

/**
 * Detects Chinese National ID (Resident Identity Card) numbers.
 * Format: 18 characters — 6-digit region + 8-digit birthdate (YYYYMMDD) +
 * 3-digit sequence + 1 check digit (0-9 or X).
 * Context-gated to avoid false positives on long digit strings.
 * @param text - Input text to scan
 * @returns Array of Chinese National ID matches
 */
export function detectChineseNationalID(text: string): DetectorMatch[] {
  const CN_ID_CONTEXT = [
    "身份证", "identity card", "national id", "chinese id", "id card",
    "resident id", "id number", "id no", "id:", "with id"
  ]
  const result: DetectorMatch[] = []

  // Pattern 1: Pure 18-digit format (17 digits + check digit 0-9 or X)
  const purePattern = /\b(\d{17}[\dXx])\b/g
  // Pattern 2: CN-prefixed format (common in international contexts)
  const prefixedPattern = /\b(CN\d{17}[\dXx])\b/gi

  for (const pattern of [purePattern, prefixedPattern]) {
    for (const m of scanWithRegex(text, pattern, "CN_NATIONAL_ID", 0.60)) {
      // Strip optional CN prefix for validation
      const digits = m.value.replace(/^CN/i, "").toUpperCase()
      if (digits.length !== 18) continue
      // Validate embedded birthdate (positions 6-13)
      const year = parseInt(digits.slice(6, 10), 10)
      const month = parseInt(digits.slice(10, 12), 10)
      const day = parseInt(digits.slice(12, 14), 10)
      if (year < 1900 || year > 2100) continue
      if (month < 1 || month > 12) continue
      if (day < 1 || day > 31) continue

      const hasContext = hasContextTrigger(text, m.start, CN_ID_CONTEXT)
      if (!hasContext) continue

      // Verify check digit (ISO 7064:1983 MOD 11-2) when no context
      // With context, skip checksum — user explicitly labeled it as ID
      const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2]
      const checkChars = "10X98765432"
      let sum = 0
      for (let i = 0; i < 17; i++) {
        sum += parseInt(digits[i], 10) * weights[i]
      }
      const expected = checkChars[sum % 11]
      const checksumValid = digits[17] === expected

      if (result.some((r) => r.start === m.start && r.end === m.end)) continue
      result.push({ ...m, confidence: checksumValid ? 0.93 : 0.85 })
    }
  }

  return result
}
