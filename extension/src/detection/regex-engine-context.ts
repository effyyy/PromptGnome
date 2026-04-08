/**
 * Context-dependent PII detectors for the regex detection engine.
 * These detectors rely heavily on surrounding keyword context to avoid
 * false positives on generic numeric or alphanumeric sequences.
 * Covers: US passport numbers, driver's licenses, dates of birth,
 * street addresses, ZIP codes, VINs, and medical license numbers.
 * Architecture layer: Detection (context sub-module)
 */

import { type DetectorMatch, scanWithRegex, hasContextTrigger } from "./regex-helpers"

/**
 * Detects US passport numbers (9-digit sequences) when preceded by passport context.
 * Low base confidence due to high false-positive risk with numeric sequences.
 * @param text - Input text to scan
 * @returns Array of passport matches (only where context trigger is present)
 */
export function detectPassportUS(text: string): DetectorMatch[] {
  const PASSPORT_CONTEXT = [
    "passport", "travel document", "passport no", "passport number",
    "passport #", "passport num"
  ]
  const result: DetectorMatch[] = []

  // Pattern 1: US format — 9 digits
  const usPattern = /\b(\d{9})\b/g
  for (const m of scanWithRegex(text, usPattern, "PASSPORT_US", 0.60)) {
    if (!hasContextTrigger(text, m.start, PASSPORT_CONTEXT)) continue
    result.push({ ...m, confidence: 0.90 })
  }

  // Pattern 2: International alphanumeric formats — 1-2 letters + 6-8 digits
  // Covers formats like XG123456, AB1234567, C12345678
  const intlPattern = /\b([A-Z]{1,2}\d{6,8})\b/gi
  for (const m of scanWithRegex(text, intlPattern, "PASSPORT_US", 0.60)) {
    if (!hasContextTrigger(text, m.start, PASSPORT_CONTEXT)) continue
    if (result.some((r) => r.start === m.start && r.end === m.end)) continue
    result.push({ ...m, confidence: 0.88 })
  }

  return result
}

/**
 * Detects driver's license numbers in common US state formats.
 * Supports alphanumeric (1 letter + 7-12 digits) and 8-digit numeric formats.
 * Requires context trigger to avoid false positives on product codes.
 * @param text - Input text to scan
 * @returns Array of driver's license matches
 */
export function detectDriversLicense(text: string): DetectorMatch[] {
  const matches: DetectorMatch[] = []
  const triggers = [
    "driver", "license", "licence", "dl", "driving",
    "driver's license", "drivers license", "dl:",
    "dl number", "license number", "licence number"
  ]
  // Format 1: 1 letter + 7-12 digits (CA, NY, FL, IL, etc.)
  const alphaPattern = /\b([A-Z]\d{7,12})\b/gi
  for (const m of scanWithRegex(text, alphaPattern, "DRIVERS_LICENSE", 0.60)) {
    if (hasContextTrigger(text, m.start, triggers)) {
      matches.push({ ...m, confidence: 0.90 })
    }
  }
  // Format 2: 8-digit pure numeric (TX, some states)
  const numericPattern = /\b(\d{8})\b/g
  for (const m of scanWithRegex(text, numericPattern, "DRIVERS_LICENSE", 0.60)) {
    if (hasContextTrigger(text, m.start, triggers)) {
      matches.push({ ...m, confidence: 0.85 })
    }
  }
  return matches
}

/**
 * Detects dates of birth in common formats (MM/DD/YYYY, YYYY-MM-DD, Month DD YYYY).
 * Requires DOB/birthday context trigger to reduce false positives with ordinary dates.
 * @param text - Input text to scan
 * @returns Array of date-of-birth matches
 */
export function detectDateOfBirth(text: string): DetectorMatch[] {
  const triggers = [
    "date of birth", "dob", "birthday", "born on", "born",
    "birth date", "birthdate", "d.o.b", "d.o.b."
  ]
  const matches: DetectorMatch[] = []

  // Format 1: MM/DD/YYYY or MM-DD-YYYY
  const slashPattern = /\b((?:0[1-9]|1[0-2])[/\-](?:0[1-9]|[12]\d|3[01])[/\-](?:19|20)\d{2})\b/g
  for (const m of scanWithRegex(text, slashPattern, "DATE_OF_BIRTH", 0.60)) {
    if (hasContextTrigger(text, m.start, triggers)) {
      matches.push({ ...m, confidence: 0.92 })
    }
  }

  // Format 2: YYYY-MM-DD (ISO)
  const isoPattern = /\b((?:19|20)\d{2}[/\-](?:0[1-9]|1[0-2])[/\-](?:0[1-9]|[12]\d|3[01]))\b/g
  for (const m of scanWithRegex(text, isoPattern, "DATE_OF_BIRTH", 0.60)) {
    if (hasContextTrigger(text, m.start, triggers)) {
      matches.push({ ...m, confidence: 0.92 })
    }
  }

  // Format 3: Month DD, YYYY (e.g., "March 15, 1990")
  const namedPattern = /\b((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+(?:19|20)\d{2})\b/gi
  for (const m of scanWithRegex(text, namedPattern, "DATE_OF_BIRTH", 0.60)) {
    if (hasContextTrigger(text, m.start, triggers)) {
      matches.push({ ...m, confidence: 0.92 })
    }
  }

  return matches
}

/**
 * Detects US street addresses (house number + street name + street suffix).
 * Requires address context trigger to avoid matching incidental number+word sequences.
 * @param text - Input text to scan
 * @returns Array of street address matches
 */
export function detectStreetAddress(text: string): DetectorMatch[] {
  const triggers = [
    "address", "lives at", "located at", "reside", "residence",
    "mailing address", "home address", "street address", "ship to",
    "deliver to", "billing address", "shipping address"
  ]
  const suffixes = "(?:Street|St|Avenue|Ave|Boulevard|Blvd|Drive|Dr|Lane|Ln|Road|Rd|Court|Ct|Way|Place|Pl|Circle|Cir|Terrace|Ter|Trail|Trl|Parkway|Pkwy|Highway|Hwy|Pike|Square|Sq)"
  const pattern = new RegExp(
    `\\b(\\d{1,6}\\s+[A-Z][a-zA-Z]+(?:\\s+[A-Z][a-zA-Z]+)?\\s+${suffixes})\\b(?:\\s+(?:Apt|Suite|Ste|Unit|#)\\s*\\w+)?`,
    "gi"
  )
  const raw = scanWithRegex(text, pattern, "STREET_ADDRESS", 0.60)
  return raw
    .map((m) => {
      if (!hasContextTrigger(text, m.start, triggers)) {
        return { ...m, confidence: 0.0 }
      }
      return { ...m, confidence: 0.88 }
    })
    .filter((m) => m.confidence > 0)
}

/**
 * Detects US ZIP codes (5-digit and ZIP+4 formats) near postal/zip context.
 * Without context, 5-digit numbers are too common to flag reliably.
 * @param text - Input text to scan
 * @returns Array of ZIP code matches
 */
export function detectZipCode(text: string): DetectorMatch[] {
  const triggers = [
    "zip", "zip code", "zipcode", "postal", "postal code",
    "zip:", "zipcode:", "postal code:"
  ]
  const pattern = /\b(\d{5}(?:-\d{4})?)\b/g
  const raw = scanWithRegex(text, pattern, "ZIP_CODE", 0.60)
  return raw
    .map((m) => {
      if (!hasContextTrigger(text, m.start, triggers)) {
        return { ...m, confidence: 0.0 }
      }
      return { ...m, confidence: 0.88 }
    })
    .filter((m) => m.confidence > 0)
}

/**
 * Detects Vehicle Identification Numbers (17-character alphanumeric, no I/O/Q).
 * REQUIRES context trigger — 17-char alphanumeric strings are too common
 * (API keys, hashes, tokens) to flag without VIN context.
 * Also validates: check digit position 9, year code position 10,
 * and requires at least some digits (not all letters).
 * @param text - Input text to scan
 * @returns Array of VIN matches
 */
export function detectVIN(text: string): DetectorMatch[] {
  const VIN_CONTEXT = [
    "vin", "vehicle identification", "vehicle id", "vin:",
    "vin number", "vehicle number", "vin#"
  ]
  const pattern = /\b([A-HJ-NPR-Z0-9]{17})\b/g
  const raw = scanWithRegex(text, pattern, "VIN", 0.60)
  return raw
    .filter((m) => {
      // Position 9 is check digit (0-9 or X)
      const checkDigit = m.value[8]
      if (!/[0-9X]/.test(checkDigit)) return false
      // Year code position 10 must not be U, Z, or 0
      const yearCode = m.value[9]
      if (yearCode === "U" || yearCode === "Z" || yearCode === "0") return false
      // Must contain mix of letters and digits (not all-alpha or all-numeric)
      if (!/\d/.test(m.value) || !/[A-Z]/.test(m.value.toUpperCase())) return false
      // Must start with a valid WMI region (1-5, J, K, L, S, W, Z, etc.)
      const first = m.value[0]
      if (!/[1-5A-HJ-NPR-Z]/.test(first)) return false
      return true
    })
    .map((m) => {
      if (hasContextTrigger(text, m.start, VIN_CONTEXT)) {
        return { ...m, confidence: 0.92 }
      }
      // WITHOUT context, do NOT flag — too many false positives
      return { ...m, confidence: 0.0 }
    })
    .filter((m) => m.confidence > 0)
}

/**
 * Detects US medical license numbers: DEA numbers and NPI (National Provider Identifier).
 * @param text - Input text to scan
 * @returns Array of medical license matches
 */
export function detectMedicalLicense(text: string): DetectorMatch[] {
  const matches: DetectorMatch[] = []
  // DEA number: 2 letters + 7 digits (first letter is registrant type: A,B,C,D,E,F,G,M)
  const deaPattern = /\b([ABCDEFGM][A-Z]\d{7})\b/g
  for (const m of scanWithRegex(text, deaPattern, "MEDICAL_LICENSE", 0.60)) {
    // DEA checksum: sum of digits 1,3,5 + 2*(sum of digits 2,4,6) → last digit matches
    const digits = m.value.slice(2)
    const odd = parseInt(digits[0], 10) + parseInt(digits[2], 10) + parseInt(digits[4], 10)
    const even = parseInt(digits[1], 10) + parseInt(digits[3], 10) + parseInt(digits[5], 10)
    const checksum = (odd + 2 * even) % 10
    if (checksum === parseInt(digits[6], 10)) {
      const boost = hasContextTrigger(text, m.start, ["dea", "dea number", "drug enforcement"]) ? 0.05 : 0
      matches.push({ ...m, confidence: 0.93 + boost })
    }
  }
  // NPI: 10 digits starting with 1 or 2 (Luhn check on full 10 digits with prefix 80840)
  const npiPattern = /\b([12]\d{9})\b/g
  for (const m of scanWithRegex(text, npiPattern, "MEDICAL_LICENSE", 0.60)) {
    if (hasContextTrigger(text, m.start, [
      "npi", "national provider", "provider identifier", "npi:",
      "npi number", "provider number"
    ])) {
      matches.push({ ...m, confidence: 0.90 })
    }
  }
  return matches
}
