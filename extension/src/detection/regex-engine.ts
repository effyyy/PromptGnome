/**
 * Regex-based PII detection engine — core orchestrator and primary detectors.
 * Handles: email, SSN, credit card, phone, IP, IBAN, crypto wallets, MAC addresses,
 * and EU/international identifiers. Cloud/SaaS credential detectors live in
 * regex-engine-credentials.ts; context-dependent detectors in regex-engine-context.ts.
 * Architecture layer: Detection (core engine)
 */

import type { PIIMatch } from "./types"
import { createLogger } from "~src/utils/logger"
import { isValidPhoneNumber } from "libphonenumber-js"
import { isValidIBAN } from "ibantools"
import {
  type DetectorMatch,
  type DetectorFn,
  scanWithRegex,
  hasContextTrigger,
} from "./regex-helpers"
import {
  detectAWSAccessKeys,
  detectAWSSecretKeys,
  detectGitHubTokens,
  detectStripeKeys,
  detectGenericAPIKeys,
  detectOpenAIKeys,
  detectAnthropicKeys,
  detectGoogleAIKeys,
  detectSlackTokens,
  detectPrivateKeys,
  detectJWTTokens,
  detectAzureKeys,
  detectGCPKeys,
  detectTwilioKeys,
  detectSendGridKeys,
  detectMailgunKeys,
  detectDiscordTokens,
  detectHerokuKeys,
  detectVercelTokens,
  detectNetlifyTokens,
  detectDBConnectionStrings,
  detectBasicAuthURLs,
  detectTelegramTokens,
  detectDigitalOceanTokens,
  detectNpmTokens,
  detectPyPITokens,
  detectSecretAssignments,
  detectEnvFileSecrets,
  detectHighEntropySecrets,
} from "./regex-engine-credentials"
import {
  detectPassportUS,
  detectDriversLicense,
  detectDateOfBirth,
  detectStreetAddress,
  detectZipCode,
  detectVIN,
  detectMedicalLicense,
} from "./regex-engine-context"
import {
  detectShopifyTokens,
  detectDockerTokens,
  detectHuggingFaceTokens,
  detectSupabaseKeys,
  detectVaultTokens,
  detectCloudflareTokens,
  detectSentryTokens,
  detectGrafanaTokens,
  detectLinearKeys,
  detectDatabricksTokens,
  detectPostmanKeys,
  detectNotionTokens,
  detectAirtableTokens,
  detectFigmaTokens,
  detectPlanetScaleTokens,
  detectFlyioTokens,
  detectRenderTokens,
  detectDopplerTokens,
  detectSquareTokens,
  detectLaunchDarklyKeys,
  detectAlgoliaKeys,
  detectCircleCITokens,
  detectConfluentKeys,
  detectNewRelicKeys,
  detectDatadogKeys,
} from "./regex-engine-credentials-extra"
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
  detectIndianPAN,
  detectChineseNationalID,
} from "./regex-engine-international"

import {
  detectContextualPII,
} from "./regex-engine-contextual"

// Re-export split-module functions so external imports from "regex-engine" continue to work
export {
  detectAWSAccessKeys,
  detectAWSSecretKeys,
  detectGitHubTokens,
  detectStripeKeys,
  detectGenericAPIKeys,
  detectOpenAIKeys,
  detectAnthropicKeys,
  detectGoogleAIKeys,
  detectSlackTokens,
  detectPrivateKeys,
  detectJWTTokens,
  detectAzureKeys,
  detectGCPKeys,
  detectTwilioKeys,
  detectSendGridKeys,
  detectMailgunKeys,
  detectDiscordTokens,
  detectHerokuKeys,
  detectVercelTokens,
  detectNetlifyTokens,
  detectDBConnectionStrings,
  detectBasicAuthURLs,
  detectTelegramTokens,
  detectDigitalOceanTokens,
  detectNpmTokens,
  detectPyPITokens,
  detectSecretAssignments,
  detectEnvFileSecrets,
  detectHighEntropySecrets,
  detectPassportUS,
  detectDriversLicense,
  detectDateOfBirth,
  detectStreetAddress,
  detectZipCode,
  detectVIN,
  detectMedicalLicense,
  detectShopifyTokens,
  detectDockerTokens,
  detectHuggingFaceTokens,
  detectSupabaseKeys,
  detectVaultTokens,
  detectCloudflareTokens,
  detectSentryTokens,
  detectGrafanaTokens,
  detectLinearKeys,
  detectDatabricksTokens,
  detectPostmanKeys,
  detectNotionTokens,
  detectAirtableTokens,
  detectFigmaTokens,
  detectPlanetScaleTokens,
  detectFlyioTokens,
  detectRenderTokens,
  detectDopplerTokens,
  detectSquareTokens,
  detectLaunchDarklyKeys,
  detectAlgoliaKeys,
  detectCircleCITokens,
  detectConfluentKeys,
  detectNewRelicKeys,
  detectDatadogKeys,
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
  detectIndianPAN,
  detectChineseNationalID,
  detectContextualPII,
}

const log = createLogger("regex-engine")

// ─── VALIDATION HELPERS ────────────────────────────────────────────────

/**
 * Validates a credit card number using the Luhn algorithm.
 * @param digits - String of digits to validate
 * @returns true if the number passes the Luhn check
 */
function luhnCheck(digits: string): boolean {
  const nums = digits.replace(/\D/g, "")
  let sum = 0
  let alternate = false
  for (let i = nums.length - 1; i >= 0; i--) {
    let n = parseInt(nums[i], 10)
    if (alternate) {
      n *= 2
      if (n > 9) n -= 9
    }
    sum += n
    alternate = !alternate
  }
  return sum % 10 === 0
}

/**
 * Checks if a US SSN area number is valid (not 000, 666, or 900-999).
 * @param area - Three-digit area number string
 * @returns true if the area number is valid
 */
function isValidSSNArea(area: string): boolean {
  const num = parseInt(area, 10)
  return num !== 0 && num !== 666 && num < 900
}

/**
 * Validates an IBAN using the ibantools library (ISO 7064 mod-97,
 * country-specific length checks, and format validation).
 * @param iban - IBAN string (spaces allowed, will be cleaned)
 * @returns true if the IBAN is valid
 */
function validateIBANChecksum(iban: string): boolean {
  const cleaned = iban.replace(/\s/g, "").toUpperCase()
  if (cleaned.length < 15 || cleaned.length > 34) return false
  return isValidIBAN(cleaned)
}

// ─── PHONE VALIDATION HELPER ──────────────────────────────────────────

/**
 * Validates an international phone number string using libphonenumber-js.
 * Covers ALL countries with Google's comprehensive numbering plan database.
 * @param phoneStr - Phone number string including + prefix
 * @returns true if the number is valid per the country's numbering plan
 */
function isValidIntlPhone(phoneStr: string): boolean {
  try {
    // Normalize: strip everything except digits and leading +
    const cleaned = phoneStr.replace(/[^\d+]/g, "").replace(/(?!^)\+/g, "")
    return isValidPhoneNumber(cleaned)
  } catch {
    return false
  }
}

// ─── TIER 1: HIGH CONFIDENCE DETECTORS ────────────────────────────────

/**
 * Detects email addresses (simplified RFC 5322).
 * @param text - Input text to scan
 * @returns Array of email matches
 */
export function detectEmails(text: string): DetectorMatch[] {
  const pattern = /[a-zA-Z0-9](?:[a-zA-Z0-9._%+\-]*[a-zA-Z0-9])?@[a-zA-Z0-9](?:[a-zA-Z0-9.\-]*[a-zA-Z0-9])?\.[a-zA-Z]{2,}/g
  // RFC 2606 reserved second-level domains and RFC 6761 reserved TLDs
  const RESERVED_DOMAINS = ["example.com", "example.org", "example.net"]
  const RESERVED_TLDS = [".test", ".example", ".invalid", ".localhost"]
  return scanWithRegex(text, pattern, "EMAIL", 0.95)
    .filter((m) => {
      const domain = m.value.split("@")[1]?.toLowerCase() ?? ""
      // Reject reserved domains (RFC 2606) — never real addresses
      if (RESERVED_DOMAINS.some((d) => domain === d || domain.endsWith("." + d))) return false
      // Reject reserved TLDs (RFC 6761) — never real addresses
      if (RESERVED_TLDS.some((tld) => domain.endsWith(tld))) return false
      return true
    })
}

/**
 * Detects US Social Security Numbers (XXX-XX-XXXX format).
 * REQUIRES dashes or spaces between groups (e.g. 123-45-6789, 123 45 6789).
 * Pure 9-digit sequences without separators are ONLY matched with strong SSN context.
 * @param text - Input text to scan
 * @returns Array of SSN matches with area number validation
 */
export function detectSSNs(text: string): DetectorMatch[] {
  const SSN_CONTEXT = ["ssn", "social security", "social:", "my social", "ss#", "ss #"]
  // Pattern 1: Formatted SSN (requires dashes or spaces) — high confidence
  const formattedPattern = /\b(\d{3}[-\s]\d{2}[-\s]\d{4})\b/g
  // Pattern 2: Unformatted 9 digits — only with strong context
  const unformattedPattern = /\b(\d{9})\b/g

  const matches: DetectorMatch[] = []

  // Formatted SSNs — high confidence
  for (const m of scanWithRegex(text, formattedPattern, "SSN", 0.92)) {
    const digits = m.value.replace(/\D/g, "")
    const hasContext = hasContextTrigger(text, m.start, SSN_CONTEXT)
    // With context, relax sequential rejection — if someone says "my SSN is 123-45-6789", flag it
    if (!isValidSSNDigits(digits, hasContext)) continue
    const contextBoost = hasContext ? 0.05 : 0
    matches.push({ ...m, confidence: Math.min(1.0, 0.95 + contextBoost) })
  }

  // Unformatted — ONLY with context
  for (const m of scanWithRegex(text, unformattedPattern, "SSN", 0.60)) {
    if (!hasContextTrigger(text, m.start, SSN_CONTEXT)) continue
    if (!isValidSSNDigits(m.value, true)) continue
    matches.push({ ...m, confidence: 0.88 })
  }

  return matches
}

/**
 * Validates SSN digit rules (area, group, serial, sequences).
 * @param digits - 9-digit string
 * @returns true if digits pass all SSN validation rules
 */
function isValidSSNDigits(digits: string, allowSequential = false): boolean {
  if (digits.length !== 9) return false
  const area = digits.slice(0, 3)
  const group = digits.slice(3, 5)
  const serial = digits.slice(5)
  if (!isValidSSNArea(area)) return false
  if (group === "00" || serial === "0000") return false
  if (digits === "078051120") return false
  if (/^(\d)\1{8}$/.test(digits)) return false
  // Skip sequential rejection when context trigger confirms it's an SSN
  if (!allowSequential && (digits === "123456789" || digits === "987654321")) return false
  return true
}

/**
 * Detects credit card numbers (Visa, Mastercard, Amex, Discover, JCB, UnionPay, Diners Club) with Luhn validation.
 * @param text - Input text to scan
 * @returns Array of credit card matches, Luhn-invalid cards are hard-rejected
 */
export function detectCreditCards(text: string): DetectorMatch[] {
  const pattern = /\b(?:4[0-9]{3}[-\s]?[0-9]{4}[-\s]?[0-9]{4}[-\s]?[0-9]{4}|5[1-5][0-9]{2}[-\s]?[0-9]{4}[-\s]?[0-9]{4}[-\s]?[0-9]{4}|3[47][0-9]{1,2}[-\s]?[0-9]{4,6}[-\s]?[0-9]{4,5}|6(?:011|5[0-9]{2})[-\s]?[0-9]{4}[-\s]?[0-9]{4}[-\s]?[0-9]{4}|35(?:2[89]|[3-8][0-9])[-\s]?[0-9]{4}[-\s]?[0-9]{4}[-\s]?[0-9]{4}|62[0-9]{2}[-\s]?[0-9]{4}[-\s]?[0-9]{4}[-\s]?[0-9]{4,6}|3(?:0[0-5]|[68][0-9])[-\s]?[0-9]{6}[-\s]?[0-9]{4})\b/g
  // Well-known test/example card numbers to reject
  const TEST_CARDS = new Set([
    "4111111111111111", "4012888888881881", "4222222222222",
    "5555555555554444", "5105105105105100",
    "378282246310005", "371449635398431",
    "6011111111111117", "6011000990139424",
    "3530111333300000", "3566002020360505",
    "30569309025904", "38520000023237",
    "4242424242424242", "4000056655665556",
  ])
  const raw = scanWithRegex(text, pattern, "CREDIT_CARD", 0.90)
  return raw
    .filter((m) => {
      const digits = m.value.replace(/\D/g, "")
      if (!luhnCheck(digits)) return false
      if (TEST_CARDS.has(digits)) return false
      return true
    })
    .map((m) => {
      const contextBoost = hasContextTrigger(text, m.start, [
        "card", "credit", "visa", "mastercard", "amex", "payment", "cc", "jcb", "unionpay", "diners"
      ]) ? 0.05 : 0
      return { ...m, confidence: Math.min(1.0, 0.95 + contextBoost) }
    })
}

/**
 * Detects US phone numbers. REQUIRES visible formatting (parentheses, dashes,
 * dots, or spaces between groups). Pure 10+ digit sequences are NOT matched
 * to prevent false positives on order numbers, timestamps, etc.
 *
 * Validates NANP rules:
 * - Area code: 2-9 for first digit, cannot be N11 (e.g. 411, 911)
 * - Exchange: first digit 2-9
 * - Rejects 555-01XX test numbers
 * @param text - Input text to scan
 * @returns Array of US phone matches
 */
export function detectUSPhones(text: string): DetectorMatch[] {
  const PHONE_CONTEXT = [
    "phone", "call", "tel", "mobile", "cell", "reach me",
    "text me", "contact", "fax", "dial", "number"
  ]

  // REQUIRE at least one separator (dash, dot, space, or parens)
  // Formats: (NPA) NXX-XXXX, NPA-NXX-XXXX, NPA.NXX.XXXX, +1-NPA-NXX-XXXX
  const pattern = /(?:\+?1[-.\s])?(?:\([2-9]\d{2}\)[-.\s]?|[2-9]\d{2}[-.\s])[2-9]\d{2}[-.\s]\d{4}\b/g
  const raw = scanWithRegex(text, pattern, "PHONE_US", 0.88)
  return raw
    .filter((m) => {
      const digits = m.value.replace(/\D/g, "")
      if (digits.length < 10 || digits.length > 11) return false
      // Extract area code (last 10 digits to handle +1 prefix)
      const areaStart = digits.length === 11 ? 1 : 0
      const areaCode = digits.slice(areaStart, areaStart + 3)
      const exchange = digits.slice(areaStart + 3, areaStart + 6)
      // Reject N11 area codes (211, 311, 411, 511, 611, 711, 811, 911)
      if (areaCode[1] === "1" && areaCode[2] === "1") return false
      // Reject N11 exchange codes
      if (exchange[1] === "1" && exchange[2] === "1") return false
      // Reject 555-01XX test numbers
      if (exchange === "555") {
        const subscriber = digits.slice(areaStart + 6)
        if (subscriber.startsWith("01")) return false
      }
      // Must have formatting — reject if no separators present
      if (/^\+?\d{10,11}$/.test(m.value.trim())) return false
      // Validate with libphonenumber-js for full NANP compliance
      const e164 = digits.length === 11 ? `+${digits}` : `+1${digits}`
      if (!isValidIntlPhone(e164)) return false
      return true
    })
    .map((m) => {
      const contextBoost = hasContextTrigger(text, m.start, PHONE_CONTEXT) ? 0.07 : 0
      return { ...m, confidence: Math.min(1.0, m.confidence + contextBoost) }
    })
}

/**
 * Detects international phone numbers. REQUIRES the + prefix (E.164) AND
 * at least one separator between digit groups. Validates using
 * libphonenumber-js for country-specific digit rules (digit count,
 * first-digit constraints, carrier patterns).
 *
 * Valid: +91 98765 43210 (India, starts 6-9, 10 digits), +44 20 7946 0958 (UK)
 * Invalid: +91 12345 67890 (India, starts 1), +12345678901 (no separators)
 * @param text - Input text to scan
 * @returns Array of international phone matches
 */
export function detectIntlPhones(text: string): DetectorMatch[] {
  // REQUIRE + prefix AND at least one separator (space, dash, dot, or parens)
  const pattern = /\+[1-9][0-9]{0,2}[-.\s]\(?[0-9]{1,4}\)?[-.\s]?[0-9][-.\s0-9]{4,12}[0-9]/g
  const raw = scanWithRegex(text, pattern, "PHONE_INTL", 0.85)
  return raw
    .filter((m) => {
      const digits = m.value.replace(/\D/g, "")
      if (digits.length < 8 || digits.length > 15) return false
      // Must contain at least one separator character
      if (!/[-.\s()]/.test(m.value.slice(1))) return false
      // Reject if it looks like a version number
      if (/^\+\d+\.\d+\.\d+/.test(m.value)) return false
      // Validate using libphonenumber-js — rejects invalid country/subscriber combos
      // e.g. +91 with first digit 0-5 is invalid for India
      if (!isValidIntlPhone(m.value)) return false
      return true
    })
    .map((m) => {
      const contextBoost = hasContextTrigger(text, m.start, [
        "phone", "call", "tel", "mobile", "number", "reach", "whatsapp", "sms"
      ]) ? 0.05 : 0
      return { ...m, confidence: Math.min(1.0, m.confidence + contextBoost) }
    })
}

/**
 * Detects IPv4 addresses, excluding non-PII addresses, version numbers,
 * and common software patterns.
 *
 * Rejects: loopback, broadcast, common DNS, private range defaults,
 * version numbers (preceded by v/version/V), all-small-octets patterns
 * that are almost certainly version numbers (e.g. 1.2.3.4, 2.0.0.1).
 * @param text - Input text to scan
 * @returns Array of IPv4 matches
 */
export function detectIPv4(text: string): DetectorMatch[] {
  const pattern = /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g
  const NON_PII_IPS = new Set([
    "127.0.0.1", "0.0.0.0", "255.255.255.255",
    "255.255.255.0", "255.0.0.0", "192.168.0.1",
    "192.168.1.1", "10.0.0.1", "1.1.1.1", "8.8.8.8",
    "8.8.4.4",
    "10.0.0.0", "172.16.0.1", "172.31.255.255", "192.168.0.0", "192.168.255.255",
    "169.254.0.0", "169.254.255.255",
    "208.67.222.222", "208.67.220.220",
    "9.9.9.9", "4.4.4.4",
  ])
  // RFC 5737 documentation/test ranges — never real user IPs
  const DOC_PREFIXES = ["192.0.2.", "198.51.100.", "203.0.113."]
  const IP_CONTEXT = ["ip", "ip address", "address", "server", "host", "connect", "bind", "listen", "network", "subnet", "gateway"]
  return scanWithRegex(text, pattern, "IPV4", 0.60)
    .filter((m) => {
      if (NON_PII_IPS.has(m.value)) return false
      // Reject RFC 5737 documentation ranges
      if (DOC_PREFIXES.some((p) => m.value.startsWith(p))) return false
      // Check for IP context early — if present, skip version-number heuristics
      const hasIPCtx = hasContextTrigger(text, m.start, IP_CONTEXT)
      // Reject version numbers: preceded by 'v', 'V', 'version', '=' etc.
      const preceding = text.slice(Math.max(0, m.start - 10), m.start)
      if (/(?:^|[^0-9])v\s*$/i.test(preceding)) return false
      if (/version\s*$/i.test(preceding)) return false
      // Colon/equals heuristic for assignments like `port: 0.0.0.0` —
      // but NOT when IP context is present (e.g. "IP Address: 10.1.2.3")
      if (!hasIPCtx && /[:=]\s*$/.test(preceding)) return false
      // Reject likely version numbers: all 4 octets are small (< 30)
      const octets = m.value.split(".").map(Number)
      if (octets.every((o) => o < 30)) return false
      // Reject if followed by common version suffixes
      const following = text.slice(m.end, m.end + 10)
      if (/^[-.]?(alpha|beta|rc|dev|pre|snapshot)/i.test(following)) return false
      return true
    })
    .map((m) => {
      // REQUIRE context to fire — bare IP-like numbers cause too many false positives
      if (hasContextTrigger(text, m.start, IP_CONTEXT)) {
        return { ...m, confidence: 0.90 }
      }
      // Without context, do NOT fire — even public IPs with high octets
      return { ...m, confidence: 0.0 }
    })
    .filter((m) => m.confidence > 0)
}

/**
 * Detects IPv6 addresses.
 * @param text - Input text to scan
 * @returns Array of IPv6 matches
 */
export function detectIPv6(text: string): DetectorMatch[] {
  const IPV6_CONTEXT = ["ip", "ipv6", "address", "server", "host", "connect", "bind", "network", "subnet", "inet6"]
  const pattern = /\b(?:[0-9a-fA-F]{1,4}:){2,7}[0-9a-fA-F]{1,4}\b|::(?:ffff:)?(?:\d{1,3}\.){3}\d{1,3}\b|\b(?:[0-9a-fA-F]{1,4}:){1,6}::[0-9a-fA-F]{0,4}\b/g
  return scanWithRegex(text, pattern, "IPV6", 0.60)
    .filter((m) => {
      if (m.value === "::1" || m.value === "::") return false
      // Require at least 3 colon-separated groups to avoid matching short hex sequences
      const groups = m.value.split(":").filter((g) => g.length > 0)
      if (groups.length < 3) return false
      // Exclude MAC addresses: exactly 6 groups of exactly 2 hex chars
      if (/^[0-9a-fA-F]{2}(?:[:\-][0-9a-fA-F]{2}){5}$/.test(m.value)) return false
      return true
    })
    .map((m) => {
      if (hasContextTrigger(text, m.start, IPV6_CONTEXT)) {
        return { ...m, confidence: 0.92 }
      }
      // Full 8-group IPv6 is structurally distinctive enough
      const groups = m.value.split(":").filter((g) => g.length > 0)
      if (groups.length >= 6) return { ...m, confidence: 0.85 }
      // Shorter forms without context — too ambiguous
      return { ...m, confidence: 0.0 }
    })
    .filter((m) => m.confidence > 0)
}

/**
 * Detects IBAN numbers with country-specific length validation.
 * @param text - Input text to scan
 * @returns Array of IBAN matches
 */
export function detectIBANs(text: string): DetectorMatch[] {
  const pattern = /\b([A-Z]{2}\d{2}[\s]?[\dA-Z]{4}[\s]?(?:[\dA-Z]{4}[\s]?){2,7}[\dA-Z]{1,4})\b/g
  const IBAN_LENGTHS: Record<string, number> = {
    AL: 28, AD: 24, AT: 20, AZ: 28, BH: 22, BY: 28, BE: 16, BA: 20,
    BR: 29, BG: 22, CR: 22, HR: 21, CY: 28, CZ: 24, DK: 18, DO: 28,
    TL: 23, EE: 20, FI: 18, FR: 27, GE: 22, DE: 22, GI: 23, GR: 27,
    GL: 18, GT: 28, HU: 28, IS: 26, IE: 22, IL: 23, IT: 27, JO: 30,
    KZ: 20, XK: 20, KW: 30, LV: 21, LB: 28, LI: 21, LT: 20, LU: 20,
    MK: 19, MT: 31, MR: 27, MU: 30, MC: 27, MD: 24, ME: 22, NL: 18,
    NO: 15, PK: 24, PS: 29, PL: 28, PT: 25, QA: 29, RO: 24, SM: 27,
    SA: 24, RS: 22, SK: 24, SI: 19, ES: 24, SE: 24, CH: 21, TN: 24,
    TR: 26, AE: 23, GB: 22, VA: 22, VG: 24
  }
  return scanWithRegex(text, pattern, "IBAN", 0.90)
    .filter((m) => {
      const cleaned = m.value.replace(/\s/g, "")
      const country = cleaned.slice(0, 2).toUpperCase()
      const expectedLen = IBAN_LENGTHS[country]
      if (expectedLen && cleaned.length !== expectedLen) return false
      return cleaned.length >= 15 && cleaned.length <= 34
    })
    .filter((m) => validateIBANChecksum(m.value))
    .map((m) => {
      const contextBoost = hasContextTrigger(text, m.start, [
        "iban", "account", "transfer", "bank", "payment"
      ]) ? 0.05 : 0
      return { ...m, confidence: Math.min(1.0, 0.95 + contextBoost) }
    })
}

/**
 * Detects cryptocurrency wallet addresses (Bitcoin and Ethereum).
 * @param text - Input text to scan
 * @returns Array of crypto wallet matches
 */
export function detectCryptoWallets(text: string): DetectorMatch[] {
  const CRYPTO_CONTEXT = [
    "wallet", "bitcoin", "btc", "ethereum", "eth", "crypto", "blockchain",
    "address", "send to", "deposit", "withdraw", "0x", "satoshi", "wei", "gwei"
  ]
  const matches: DetectorMatch[] = []
  // Bitcoin legacy (P2PKH/P2SH): starts with 1 or 3, total 25-34 chars
  // Context-gated — base58 strings starting with 1 or 3 are too common
  const btcLegacyPattern = /\b([13][a-km-zA-HJ-NP-Z1-9]{24,33})\b/g
  for (const m of scanWithRegex(text, btcLegacyPattern, "CRYPTO_WALLET", 0.60)) {
    if (hasContextTrigger(text, m.start, CRYPTO_CONTEXT)) {
      matches.push({ ...m, confidence: 0.92 })
    }
  }
  // Bitcoin bech32 (P2WPKH/P2WSH): bc1 prefix — structurally unique
  const btcBech32Pattern = /\b(bc1[a-z0-9]{39,59})\b/g
  matches.push(...scanWithRegex(text, btcBech32Pattern, "CRYPTO_WALLET", 0.95))
  // Ethereum addresses: 0x + 40 hex chars — context-gated (0x + 40 hex could be hashes)
  const ethPattern = /\b(0x[a-fA-F0-9]{40})\b/g
  for (const m of scanWithRegex(text, ethPattern, "CRYPTO_WALLET", 0.60)) {
    if (hasContextTrigger(text, m.start, CRYPTO_CONTEXT)) {
      matches.push({ ...m, confidence: 0.92 })
    } else {
      // Check for EIP-55 mixed-case checksum (if address has both upper and lower hex)
      const addr = m.value.slice(2) // strip 0x
      const hasUpper = /[A-F]/.test(addr)
      const hasLower = /[a-f]/.test(addr)
      if (hasUpper && hasLower) {
        // Mixed case = likely EIP-55 checksummed address — more distinctive
        matches.push({ ...m, confidence: 0.85 })
      }
    }
  }
  return matches
}

// ─── EU / INTERNATIONAL PII DETECTORS ────────────────────────────────

/**
 * Detects UK National Insurance Numbers (AB 12 34 56 C format).
 * @param text - Input text to scan
 * @returns Array of UK NI number matches
 */
export function detectUKNIN(text: string): DetectorMatch[] {
  const NIN_CONTEXT = ["national insurance", "ni number", "nino", "ni no", "ni:", "insurance number"]
  const result: DetectorMatch[] = []

  // Strict pattern: 2 prefix letters (not D, F, I, Q, U, V) + 6 digits + suffix A-D
  const strictPattern = /\b([A-CEGHJ-PR-TW-Z][A-CEGHJ-NPR-TW-Z][\s-]?\d{2}[\s-]?\d{2}[\s-]?\d{2}[\s-]?[A-D])\b/gi
  for (const m of scanWithRegex(text, strictPattern, "UK_NIN", 0.60)) {
    const cleaned = m.value.replace(/[\s-]/g, "").toUpperCase()
    if (cleaned.startsWith("OO") || cleaned.startsWith("TN") || cleaned.startsWith("XX")) continue
    if (hasContextTrigger(text, m.start, NIN_CONTEXT)) {
      result.push({ ...m, confidence: 0.93 })
    }
  }

  // Loose pattern: any 2 letters + 6 digits + suffix A-D — ONLY with context
  // Catches values with restricted prefix letters (D, F, I, Q, U, V) when user explicitly labels as NIN
  const loosePattern = /\b([A-Z]{2}[\s-]?\d{2}[\s-]?\d{2}[\s-]?\d{2}[\s-]?[A-D])\b/gi
  for (const m of scanWithRegex(text, loosePattern, "UK_NIN", 0.60)) {
    if (!hasContextTrigger(text, m.start, NIN_CONTEXT)) continue
    // Skip if already matched by strict pattern (avoid duplicates)
    if (result.some((r) => r.start === m.start && r.end === m.end)) continue
    result.push({ ...m, confidence: 0.85 })
  }

  return result
}

/**
 * Detects German Tax Identification Numbers (Steuerliche Identifikationsnummer).
 * 11-digit number where: no digit appears more than 3 times, exactly one digit
 * appears twice or thrice while one digit is absent.
 * @param text - Input text to scan
 * @returns Array of German tax ID matches
 */
export function detectGermanTaxId(text: string): DetectorMatch[] {
  // 11 digits, first digit is not 0
  const pattern = /\b([1-9]\d{10})\b/g
  // Low base confidence since 11-digit numbers are common; context required
  const rawMatches = scanWithRegex(text, pattern, "DE_TAX_ID", 0.40)
  return rawMatches.map((m) => {
    const digits = m.value
    // Validate: count digit frequencies
    const freq = new Array<number>(10).fill(0)
    for (const d of digits) freq[parseInt(d, 10)]++
    // At least one digit must be absent (appear 0 times)
    const zeroCount = freq.filter((f) => f === 0).length
    if (zeroCount < 1) return { ...m, confidence: 0.0 }
    // At least one digit must appear more than once
    const multiCount = freq.filter((f) => f >= 2).length
    if (multiCount < 1) return { ...m, confidence: 0.0 }
    // No digit appears more than 3 times
    if (freq.some((f) => f > 3)) return { ...m, confidence: 0.0 }
    // REQUIRE context — 11-digit numbers are too common without it
    if (hasContextTrigger(text, m.start, ["steuer", "tax id", "identifikationsnummer", "tin", "steuerliche"])) {
      return { ...m, confidence: 0.93 }
    }
    return { ...m, confidence: 0.0 }
  }).filter((m) => m.confidence > 0)
}

/**
 * Detects French Social Security Numbers (Numéro de Sécurité Sociale / NIR).
 * 13 digits + 2-digit control key. Format: S AA MM DDD CCC NNN KK.
 * @param text - Input text to scan
 * @returns Array of French SSN matches
 */
export function detectFrenchSSN(text: string): DetectorMatch[] {
  // 15 digits with optional spaces/dots between groups
  // Gender(1) Year(2) Month(2) Department(2-3) Commune(2-3) Order(3) Key(2)
  const pattern = /\b([12][- ]?\d{2}[- ]?(0[1-9]|1[0-2]|[2-9]\d)[- ]?\d{2,3}[- ]?\d{3}[- ]?\d{3}[- ]?\d{2})\b/g
  const rawMatches = scanWithRegex(text, pattern, "FR_SSN", 0.85)
  return rawMatches.map((m) => {
    const cleaned = m.value.replace(/[\s-]/g, "")
    // Must be exactly 15 digits
    if (!/^\d{15}$/.test(cleaned)) return { ...m, confidence: 0.0 }
    // Validate control key: number formed by first 13 digits, mod 97 gives key
    const base = parseInt(cleaned.slice(0, 13), 10)
    const key = parseInt(cleaned.slice(13, 15), 10)
    if (97 - (base % 97) !== key) return { ...m, confidence: 0.0 }
    // REQUIRE context — 15-digit sequences with valid mod-97 can occur randomly
    if (hasContextTrigger(text, m.start, ["sécurité sociale", "nir", "numéro de sécurité", "securite sociale", "social security"])) {
      return { ...m, confidence: 0.93 }
    }
    return { ...m, confidence: 0.0 }
  }).filter((m) => m.confidence > 0)
}

/**
 * Detects Spanish DNI/NIE numbers.
 * DNI: 8 digits + 1 check letter. NIE: X/Y/Z + 7 digits + 1 check letter.
 * @param text - Input text to scan
 * @returns Array of Spanish ID matches
 */
export function detectSpanishDNI(text: string): DetectorMatch[] {
  const pattern = /\b([XYZ]?\d{7,8}[A-Z])\b/g
  const rawMatches = scanWithRegex(text, pattern, "ES_DNI", 0.85)
  const checkLetters = "TRWAGMYFPDXBNJZSQVHLCKE"
  return rawMatches.map((m) => {
    const val = m.value.toUpperCase()
    let numericPart: string
    if (/^[XYZ]/.test(val)) {
      // NIE: replace prefix letter with digit
      const prefix = val[0] === "X" ? "0" : val[0] === "Y" ? "1" : "2"
      numericPart = prefix + val.slice(1, -1)
    } else {
      numericPart = val.slice(0, -1)
    }
    if (numericPart.length !== 8 || !/^\d{8}$/.test(numericPart)) return { ...m, confidence: 0.0 }
    const expectedLetter = checkLetters[parseInt(numericPart, 10) % 23]
    if (val.slice(-1) !== expectedLetter) return { ...m, confidence: 0.0 }
    // REQUIRE context — 8-digit + check letter matches too many product codes and serial numbers
    if (hasContextTrigger(text, m.start, ["dni", "nie", "documento nacional", "identificación"])) {
      return { ...m, confidence: 0.93 }
    }
    return { ...m, confidence: 0.0 }
  }).filter((m) => m.confidence > 0)
}

/**
 * Detects Italian Fiscal Codes (Codice Fiscale).
 * 16-character alphanumeric code with specific structure.
 * @param text - Input text to scan
 * @returns Array of Italian fiscal code matches
 */
export function detectItalianFiscalCode(text: string): DetectorMatch[] {
  // 6 letters (surname+name) + 2 digits (year) + 1 letter (month) + 2 digits (day) + 1 letter + 3 digits + 1 check letter
  const pattern = /\b([A-Z]{6}\d{2}[A-EHLMPR-T]\d{2}[A-Z]\d{3}[A-Z])\b/gi
  const rawMatches = scanWithRegex(text, pattern, "IT_FISCAL_CODE", 0.88)
  return rawMatches.map((m) => {
    const val = m.value.toUpperCase()
    // Validate month letter: A-E, H, L, M, P, R, S, T
    const monthChar = val[8]
    if (!"ABCDEHLMPRST".includes(monthChar)) return { ...m, confidence: 0.0 }
    // Day: 01-31 for males, 41-71 for females
    const day = parseInt(val.slice(9, 11), 10)
    if (!((day >= 1 && day <= 31) || (day >= 41 && day <= 71))) return { ...m, confidence: 0.0 }
    // REQUIRE context — 16-char alphanumeric strings can match random IDs
    if (hasContextTrigger(text, m.start, ["codice fiscale", "fiscal code", "cf:"])) {
      return { ...m, confidence: 0.93 }
    }
    return { ...m, confidence: 0.0 }
  }).filter((m) => m.confidence > 0)
}

/**
 * Detects Dutch BSN (Burgerservicenummer / Citizen Service Number).
 * 9-digit number validated by the 11-check.
 * @param text - Input text to scan
 * @returns Array of Dutch BSN matches
 */
export function detectDutchBSN(text: string): DetectorMatch[] {
  const pattern = /\b(\d{9})\b/g
  const rawMatches = scanWithRegex(text, pattern, "NL_BSN", 0.65)
  return rawMatches.map((m) => {
    const digits = m.value
    // 11-check: 9*d1 + 8*d2 + 7*d3 + ... + 2*d8 - 1*d9 must be divisible by 11 and not 0
    let sum = 0
    for (let i = 0; i < 8; i++) {
      sum += (9 - i) * parseInt(digits[i], 10)
    }
    sum -= parseInt(digits[8], 10)
    if (sum <= 0 || sum % 11 !== 0) return { ...m, confidence: 0.0 }
    // Must require context since 9-digit numbers are very common
    if (hasContextTrigger(text, m.start, ["bsn", "burgerservicenummer", "citizen service", "sofinummer"])) {
      return { ...m, confidence: Math.min(m.confidence + 0.25, 0.95) }
    }
    // Without context, too many false positives
    return { ...m, confidence: 0.0 }
  }).filter((m) => m.confidence > 0)
}

/**
 * Detects MAC (Media Access Control) hardware addresses in colon, hyphen, and Cisco dot formats.
 * Filters: broadcast, all-zeros, multicast common addresses, and CSS-like hex patterns.
 * Requires context to boost confidence since hex:hex patterns appear in many non-PII contexts.
 * @param text - Input text to scan
 * @returns Array of MAC address matches
 */
export function detectMACAddresses(text: string): DetectorMatch[] {
  const MAC_CONTEXT = ["mac", "mac address", "hardware address", "ethernet", "physical address", "wifi", "interface"]
  const matches: DetectorMatch[] = []
  // Colon or hyphen separated: XX:XX:XX:XX:XX:XX or XX-XX-XX-XX-XX-XX
  const colonPattern = /\b([0-9A-Fa-f]{2}(?:[:\-][0-9A-Fa-f]{2}){5})\b/g
  matches.push(...scanWithRegex(text, colonPattern, "MAC_ADDRESS", 0.75))
  // Cisco dot format: XXXX.XXXX.XXXX
  const ciscoPattern = /\b([0-9A-Fa-f]{4}\.[0-9A-Fa-f]{4}\.[0-9A-Fa-f]{4})\b/g
  matches.push(...scanWithRegex(text, ciscoPattern, "MAC_ADDRESS", 0.80))

  return matches.filter((m) => {
    const hex = m.value.replace(/[:\-.\s]/g, "").toUpperCase()
    if (hex === "FFFFFFFFFFFF" || hex === "000000000000") return false
    // Reject if preceded by '#' (CSS color context)
    const before = text.slice(Math.max(0, m.start - 5), m.start).trim()
    if (before.endsWith("#")) return false
    // Reject if preceded by 'color', 'background', 'rgb', 'fill', 'stroke'
    const preceding = text.slice(Math.max(0, m.start - 20), m.start).toLowerCase()
    if (/(?:color|background|fill|stroke|rgb)\s*[:=]?\s*$/.test(preceding)) return false
    return true
  }).map((m) => {
    // REQUIRE context — hex:hex patterns appear in too many non-PII contexts
    if (hasContextTrigger(text, m.start, MAC_CONTEXT)) {
      return { ...m, confidence: 0.92 }
    }
    return { ...m, confidence: 0.0 }
  }).filter((m) => m.confidence > 0)
}

// ─── INTERNATIONAL PII DETECTORS ──────────────────────────────────────

/**
 * Detects Canadian Social Insurance Numbers (XXX-XXX-XXX, Luhn-validated).
 * Context-gated to avoid false positives on 9-digit numbers.
 * @param text - Input text to scan
 * @returns Array of Canadian SIN matches
 */
export function detectCanadaSIN(text: string): DetectorMatch[] {
  const pattern = /\b(\d{3}[-\s]?\d{3}[-\s]?\d{3})\b/g
  const raw = scanWithRegex(text, pattern, "CA_SIN", 0.60)
  return raw
    .filter((m) => {
      const digits = m.value.replace(/\D/g, "")
      if (digits.length !== 9) return false
      // Luhn check
      let sum = 0
      let alternate = false
      for (let i = digits.length - 1; i >= 0; i--) {
        let n = parseInt(digits[i], 10)
        if (alternate) { n *= 2; if (n > 9) n -= 9 }
        sum += n
        alternate = !alternate
      }
      return sum % 10 === 0
    })
    .map((m) => {
      if (hasContextTrigger(text, m.start, [
        "sin", "social insurance", "social insurance number", "canadian sin",
        "canada sin", "sin:"
      ])) {
        return { ...m, confidence: 0.92 }
      }
      return { ...m, confidence: 0.0 }
    })
    .filter((m) => m.confidence > 0)
}

/**
 * Detects Indian Aadhaar numbers (12 digits, context-gated).
 * First digit cannot be 0 or 1.
 * @param text - Input text to scan
 * @returns Array of Aadhaar matches
 */
export function detectIndiaAadhaar(text: string): DetectorMatch[] {
  const AADHAAR_CONTEXT = [
    "aadhaar", "aadhar", "uidai", "uid number", "aadhaar number",
    "aadhaar no", "aadhaar:"
  ]
  const result: DetectorMatch[] = []

  // Strict pattern: first digit 2-9 (per UIDAI specification)
  const strictPattern = /\b([2-9]\d{3}[\s-]?\d{4}[\s-]?\d{4})\b/g
  for (const m of scanWithRegex(text, strictPattern, "IN_AADHAAR", 0.60)) {
    const digits = m.value.replace(/\D/g, "")
    if (digits.length !== 12) continue
    if (hasContextTrigger(text, m.start, AADHAAR_CONTEXT)) {
      result.push({ ...m, confidence: 0.92 })
    }
  }

  // Loose pattern: first digit 1-9 — ONLY with context
  // Catches values starting with 1 when user explicitly labels as Aadhaar
  const loosePattern = /\b([1-9]\d{3}[\s-]?\d{4}[\s-]?\d{4})\b/g
  for (const m of scanWithRegex(text, loosePattern, "IN_AADHAAR", 0.60)) {
    const digits = m.value.replace(/\D/g, "")
    if (digits.length !== 12) continue
    if (!hasContextTrigger(text, m.start, AADHAAR_CONTEXT)) continue
    if (result.some((r) => r.start === m.start && r.end === m.end)) continue
    result.push({ ...m, confidence: 0.85 })
  }

  return result
}

/**
 * Detects SWIFT/BIC codes (8 or 11 character bank identifiers).
 * Format: 4 bank code + 2 country + 2 location + optional 3 branch.
 * Context-gated to avoid matching random 8-char strings.
 * @param text - Input text to scan
 * @returns Array of SWIFT/BIC code matches
 */
export function detectSWIFTCode(text: string): DetectorMatch[] {
  // SWIFT/BIC: 4 bank letters + 2 ISO country code + 2 location + optional 3 branch
  // Use ISO 3166-1 alpha-2 country codes for positions 5-6 to reduce false positives
  const ISO_COUNTRIES = new Set([
    "AD","AE","AF","AG","AL","AM","AO","AR","AT","AU","AZ","BA","BB","BD","BE","BF","BG","BH","BI","BJ",
    "BN","BO","BR","BS","BT","BW","BY","BZ","CA","CD","CF","CG","CH","CI","CK","CL","CM","CN","CO","CR",
    "CU","CV","CY","CZ","DE","DJ","DK","DM","DO","DZ","EC","EE","EG","ER","ES","ET","FI","FJ","FM","FR",
    "GA","GB","GD","GE","GH","GM","GN","GR","GT","GW","GY","HK","HN","HR","HT","HU","ID","IE","IL","IN",
    "IQ","IR","IS","IT","JM","JO","JP","KE","KG","KH","KI","KM","KN","KP","KR","KW","KZ","LA","LB","LC",
    "LI","LK","LR","LS","LT","LU","LV","LY","MA","MC","MD","ME","MG","MK","ML","MM","MN","MR","MT","MU",
    "MV","MW","MX","MY","MZ","NA","NE","NG","NI","NL","NO","NP","NR","NZ","OM","PA","PE","PG","PH","PK",
    "PL","PT","PY","QA","RO","RS","RU","RW","SA","SB","SC","SD","SE","SG","SI","SK","SL","SM","SN","SO",
    "SR","SS","ST","SV","SY","SZ","TD","TG","TH","TJ","TL","TM","TN","TO","TR","TT","TV","TW","TZ","UA",
    "UG","US","UY","UZ","VA","VC","VE","VN","VU","WS","YE","ZA","ZM","ZW","XK",
  ])
  const pattern = /\b([A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?)\b/g
  const raw = scanWithRegex(text, pattern, "SWIFT_BIC", 0.60)
  return raw
    .filter((m) => {
      const val = m.value
      if (val.length !== 8 && val.length !== 11) return false
      // Validate country code at positions 4-5
      const country = val.slice(4, 6)
      return ISO_COUNTRIES.has(country)
    })
    .map((m) => {
      if (hasContextTrigger(text, m.start, [
        "swift", "bic", "bank identifier", "swift code", "bic code",
        "swift:", "bic:", "routing"
      ])) {
        return { ...m, confidence: 0.92 }
      }
      // Even with valid country code, require context
      return { ...m, confidence: 0.0 }
    })
    .filter((m) => m.confidence > 0)
}

/**
 * Detects US Employer Identification Numbers (XX-XXXXXXX format).
 * Context-gated to avoid false positives.
 * @param text - Input text to scan
 * @returns Array of EIN matches
 */
export function detectUSEIN(text: string): DetectorMatch[] {
  const pattern = /\b(\d{2}-\d{7})\b/g
  const raw = scanWithRegex(text, pattern, "US_EIN", 0.60)
  return raw
    .filter((m) => {
      const prefix = parseInt(m.value.slice(0, 2), 10)
      // Valid EIN prefixes: 01-06, 10-16, 20-27, 30-39, 40-48, 50-59, 60-68, 71-77, 80-88, 90-95, 98-99
      const validPrefixes = [
        ...Array.from({ length: 6 }, (_, i) => i + 1),
        ...Array.from({ length: 7 }, (_, i) => i + 10),
        ...Array.from({ length: 8 }, (_, i) => i + 20),
        ...Array.from({ length: 10 }, (_, i) => i + 30),
        ...Array.from({ length: 9 }, (_, i) => i + 40),
        ...Array.from({ length: 10 }, (_, i) => i + 50),
        ...Array.from({ length: 9 }, (_, i) => i + 60),
        ...Array.from({ length: 7 }, (_, i) => i + 71),
        ...Array.from({ length: 9 }, (_, i) => i + 80),
        ...Array.from({ length: 6 }, (_, i) => i + 90),
        98, 99
      ]
      return validPrefixes.includes(prefix)
    })
    .map((m) => {
      if (hasContextTrigger(text, m.start, [
        "ein", "employer identification", "tax id", "federal tax",
        "fein", "employer id", "ein:", "tax identification"
      ])) {
        return { ...m, confidence: 0.90 }
      }
      return { ...m, confidence: 0.0 }
    })
    .filter((m) => m.confidence > 0)
}

// ─── MAIN DETECTION ORCHESTRATOR ──────────────────────────────────────

/** All detector functions in execution order */
const DETECTORS: DetectorFn[] = [
  detectEmails,
  detectSSNs,
  detectCreditCards,
  detectUSPhones,
  detectIntlPhones,
  detectIPv4,
  detectIPv6,
  detectAWSAccessKeys,
  detectAWSSecretKeys,
  detectGitHubTokens,
  detectStripeKeys,
  detectGenericAPIKeys,
  detectSecretAssignments,
  detectEnvFileSecrets,
  detectHighEntropySecrets,
  detectIBANs,
  detectOpenAIKeys,
  detectAnthropicKeys,
  detectGoogleAIKeys,
  detectSlackTokens,
  detectPrivateKeys,
  detectJWTTokens,
  detectCryptoWallets,
  detectUKNIN,
  detectGermanTaxId,
  detectFrenchSSN,
  detectSpanishDNI,
  detectItalianFiscalCode,
  detectDutchBSN,
  detectPassportUS,
  detectDriversLicense,
  detectDateOfBirth,
  detectStreetAddress,
  detectZipCode,
  detectMACAddresses,
  detectDBConnectionStrings,
  detectBasicAuthURLs,
  detectAzureKeys,
  detectGCPKeys,
  detectTwilioKeys,
  detectSendGridKeys,
  detectMailgunKeys,
  detectDiscordTokens,
  detectHerokuKeys,
  detectVercelTokens,
  detectNetlifyTokens,
  detectTelegramTokens,
  detectDigitalOceanTokens,
  detectNpmTokens,
  detectPyPITokens,
  detectCanadaSIN,
  detectIndiaAadhaar,
  detectSWIFTCode,
  detectUSEIN,
  detectVIN,
  detectMedicalLicense,
  // Extra credentials
  detectShopifyTokens,
  detectDockerTokens,
  detectHuggingFaceTokens,
  detectSupabaseKeys,
  detectVaultTokens,
  detectCloudflareTokens,
  detectSentryTokens,
  detectGrafanaTokens,
  detectLinearKeys,
  detectDatabricksTokens,
  detectPostmanKeys,
  detectNotionTokens,
  detectAirtableTokens,
  detectFigmaTokens,
  detectPlanetScaleTokens,
  detectFlyioTokens,
  detectRenderTokens,
  detectDopplerTokens,
  detectSquareTokens,
  detectLaunchDarklyKeys,
  detectAlgoliaKeys,
  detectCircleCITokens,
  detectConfluentKeys,
  detectNewRelicKeys,
  detectDatadogKeys,
  // International PII
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
  detectIndianPAN,
  detectChineseNationalID,
  // Contextual trigger-phrase detectors
  detectContextualPII,
]

/**
 * Deduplicates overlapping matches, keeping the one with highest confidence.
 * @param matches - Array of matches that may overlap
 * @returns Deduplicated array sorted by position
 */
export function deduplicateMatches(matches: DetectorMatch[]): DetectorMatch[] {
  if (matches.length === 0) return []
  const sorted = [...matches].sort((a, b) => a.start - b.start || b.confidence - a.confidence)
  const result: DetectorMatch[] = [sorted[0]]

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i]
    const last = result[result.length - 1]
    if (current.start < last.end) {
      if (current.confidence > last.confidence) {
        result[result.length - 1] = current
      }
    } else {
      result.push(current)
    }
  }
  return result
}

/**
 * Runs all PII detectors on the input text and returns deduplicated results.
 * @param text - Input text to scan for PII
 * @param enabledTypes - Optional set of PII type IDs to check. If null, check all.
 * @returns Array of deduplicated PII matches sorted by position
 * @example
 * ```ts
 * const matches = detectPII("My email is test@example.com")
 * // [{ type: "EMAIL", value: "test@example.com", start: 12, end: 28, confidence: 0.95 }]
 * ```
 */
export function detectPII(
  text: string,
  enabledTypes?: Set<string> | null
): PIIMatch[] {
  const allMatches: DetectorMatch[] = []
  const start = performance.now()
  log.group(`detectPII (${text.length} chars)`)
  log.debug("Starting all detectors", { textLen: text.length, enabledTypes: enabledTypes ? [...enabledTypes].join(",") : "all" })

  for (const detector of DETECTORS) {
    try {
      const detectorStart = performance.now()
      const matches = detector(text)
      const kept: DetectorMatch[] = []
      for (const match of matches) {
        if (!enabledTypes || enabledTypes.has(match.type)) {
          allMatches.push(match)
          kept.push(match)
        }
      }
      if (kept.length > 0) {
        log.debug(`${detector.name} — ${kept.length} match(es)`, {
          detector: detector.name,
          matches: kept.length,
          types: [...new Set(kept.map((m) => m.type))].join(","),
          durationMs: Math.round(performance.now() - detectorStart),
        })
      }
    } catch {
      // Fail-open: if a detector throws, skip it and continue
      log.warn("Detector threw — skipping", { detector: detector.name })
      continue
    }
  }

  const beforeDedup = allMatches.length
  const deduped = deduplicateMatches(allMatches)
  if (beforeDedup !== deduped.length) {
    log.debug("Deduplication removed overlapping matches", {
      before: beforeDedup,
      after: deduped.length,
      removed: beforeDedup - deduped.length,
    })
  }

  log.info("detectPII complete", {
    textLen: text.length,
    totalRaw: beforeDedup,
    afterDedup: deduped.length,
    totalMs: Math.round(performance.now() - start),
    types: [...new Set(deduped.map((m) => m.type))].join(",") || "(none)",
  })
  log.groupEnd()

  return deduped.map((m) => ({
    type: m.type,
    value: m.value,
    start: m.start,
    end: m.end,
    confidence: m.confidence,
    source: "regex" as const
  }))
}
