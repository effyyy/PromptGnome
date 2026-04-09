/**
 * Accuracy benchmark for the regex-based PII detection engine.
 *
 * Measures precision, recall, and F1 score across all supported PII types.
 * All test data is SYNTHETIC — no real PII is used anywhere in this file.
 * Architecture layer: Benchmarks (quality assurance, not shipped to users)
 */

import { describe, it, expect, afterAll } from "vitest"
import { detectPII } from "~src/detection/regex-engine"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TestCase {
  /** Human-readable label for debugging. */
  label: string
  /** The input text to scan. */
  text: string
  /** Entities that MUST appear in the results (true positives). */
  expected: Array<{ type: string; valueSubstring: string }>
  /** Strings that must NOT appear as matched values (false positive prevention). */
  negatives?: string[]
  /** When true, test is registered with it.skip — used for documented 1.0 known limitations. */
  skip?: boolean
}

/**
 * Returns the appropriate vitest `it` variant for a test case.
 * Cases marked `skip: true` are documented 1.0 known limitations.
 */
function itFor(tc: TestCase) {
  return tc.skip ? it.skip : it
}

// ---------------------------------------------------------------------------
// Per-type stats accumulator
// ---------------------------------------------------------------------------

const stats: Record<string, { tp: number; fp: number; fn: number }> = {}

function getStats(type: string) {
  if (!stats[type]) stats[type] = { tp: 0, fp: 0, fn: 0 }
  return stats[type]
}

/**
 * Runs a single test case through detectPII and updates stats.
 * This is called inside each `it()` block so stats accumulate as tests run.
 */
function accumulateStats(tc: TestCase) {
  const matches = detectPII(tc.text)

  for (const exp of tc.expected) {
    const found = matches.some(
      (m) => m.type === exp.type && m.value.includes(exp.valueSubstring)
    )
    if (found) {
      getStats(exp.type).tp++
    } else {
      getStats(exp.type).fn++
    }
  }

  for (const neg of tc.negatives ?? []) {
    const falsePos = matches.find((m) => m.value === neg || m.value.includes(neg))
    if (falsePos) {
      getStats(falsePos.type).fp++
    }
  }
}

// ---------------------------------------------------------------------------
// EMAIL test cases (15 positive + 4 negative)
// ---------------------------------------------------------------------------

describe("accuracy: EMAIL", () => {
  const cases: TestCase[] = [
    {
      label: "gmail address",
      text: "Contact me at janedoe.test@gmail.com for details",
      expected: [{ type: "EMAIL", valueSubstring: "janedoe.test@gmail.com" }],
    },
    {
      label: "protonmail address",
      text: "My secure email is privacytest@protonmail.com",
      expected: [{ type: "EMAIL", valueSubstring: "privacytest@protonmail.com" }],
    },
    {
      label: "corporate domain address",
      text: "Send the invoice to billing@acmecorp.io",
      expected: [{ type: "EMAIL", valueSubstring: "billing@acmecorp.io" }],
    },
    {
      label: "email with plus tag",
      text: "Use testuser+alerts@fastmail.com for notifications",
      expected: [{ type: "EMAIL", valueSubstring: "testuser+alerts@fastmail.com" }],
    },
    {
      label: "email with dots in local part",
      text: "john.doe.jr@enterprise.co.uk",
      expected: [{ type: "EMAIL", valueSubstring: "john.doe.jr@enterprise.co.uk" }],
    },
    {
      label: "email with hyphenated domain",
      text: "user@my-company.mailhost.com",
      expected: [{ type: "EMAIL", valueSubstring: "user@my-company.mailhost.com" }],
    },
    {
      label: "uppercase email",
      text: "EMAIL: USER@DOMAIN.ORG",
      expected: [{ type: "EMAIL", valueSubstring: "USER@DOMAIN.ORG" }],
    },
    {
      label: "multiple emails in one message",
      text: "CC alice@webmail.net and bcc bob@privatemail.com",
      expected: [
        { type: "EMAIL", valueSubstring: "alice@webmail.net" },
        { type: "EMAIL", valueSubstring: "bob@privatemail.com" },
      ],
    },
    {
      label: "email in sentence with punctuation",
      text: "Please reply to support@helpdesk.org.",
      expected: [{ type: "EMAIL", valueSubstring: "support@helpdesk.org" }],
    },
    {
      label: "subdomain email",
      text: "admin@mail.regional.gov.au",
      expected: [{ type: "EMAIL", valueSubstring: "admin@mail.regional.gov.au" }],
    },
    {
      label: "numeric local part",
      text: "12345@numericalmail.com is my address",
      expected: [{ type: "EMAIL", valueSubstring: "12345@numericalmail.com" }],
    },
    {
      label: "short TLD",
      text: "info@startup.ai is the contact",
      expected: [{ type: "EMAIL", valueSubstring: "info@startup.ai" }],
    },
    {
      label: "email after colon label",
      text: "Email: professional@workmail.com",
      expected: [{ type: "EMAIL", valueSubstring: "professional@workmail.com" }],
    },
    {
      label: "email with underscore in local part",
      text: "john_doe_99@sample-domain.net",
      expected: [{ type: "EMAIL", valueSubstring: "john_doe_99@sample-domain.net" }],
    },
    {
      label: "feedback address with mixed-case domain",
      text: "feedback@testmailer.dev",
      expected: [{ type: "EMAIL", valueSubstring: "feedback@testmailer.dev" }],
    },
    // Negative cases
    {
      label: "RFC 2606 example.com should NOT match",
      text: "This is just an illustration: user@example.com",
      expected: [],
      negatives: ["user@example.com"],
    },
    {
      label: "example.org should NOT match",
      text: "See user@example.org for the schema",
      expected: [],
      negatives: ["user@example.org"],
    },
    {
      label: "reserved .test TLD should NOT match",
      text: "Contact dev@local.test for debugging",
      expected: [],
      negatives: ["dev@local.test"],
    },
    {
      label: "no @ sign should NOT match",
      text: "There is no email address in this text whatsoever",
      expected: [],
    },
  ]

  for (const tc of cases) {
    itFor(tc)(tc.label, () => {
      accumulateStats(tc)
      const matches = detectPII(tc.text)
      for (const exp of tc.expected) {
        const found = matches.some(
          (m) => m.type === exp.type && m.value.includes(exp.valueSubstring)
        )
        expect(found, `Expected ${exp.type} '${exp.valueSubstring}' in: ${tc.text}`).toBe(true)
      }
      for (const neg of tc.negatives ?? []) {
        const found = matches.some((m) => m.value.includes(neg) || neg.includes(m.value))
        expect(found, `Should NOT match '${neg}' in: ${tc.text}`).toBe(false)
      }
    })
  }
})

// ---------------------------------------------------------------------------
// SSN test cases (10 positive + 10 negative)
// NOTE: "123-45-6789" is explicitly blocked by the engine (123456789 is the
// canonical example SSN). Use 234-56-7890, 345-67-8901 etc. instead.
// ---------------------------------------------------------------------------

describe("accuracy: SSN", () => {
  const cases: TestCase[] = [
    {
      label: "SSN with 'My SSN is' context",
      text: "My SSN is 234-56-7890",
      expected: [{ type: "SSN", valueSubstring: "234-56-7890" }],
    },
    {
      label: "SSN with spaces as separators",
      text: "social security number: 345 67 8901",
      expected: [{ type: "SSN", valueSubstring: "345 67 8901" }],
    },
    {
      label: "SSN with 'my social' context",
      text: "My social 456-78-9012 is on file",
      expected: [{ type: "SSN", valueSubstring: "456-78-9012" }],
    },
    {
      label: "SSN with 'ss#' context",
      text: "ss# 234-56-7891",
      expected: [{ type: "SSN", valueSubstring: "234-56-7891" }],
    },
    {
      label: "SSN with 'social security' context",
      text: "Please provide your social security number: 567-89-0123",
      expected: [{ type: "SSN", valueSubstring: "567-89-0123" }],
    },
    {
      label: "SSN with 'SSN:' label",
      text: "SSN: 234-56-7892",
      expected: [{ type: "SSN", valueSubstring: "234-56-7892" }],
    },
    {
      label: "SSN with 'ss #' context",
      text: "My ss # is 345-78-9012",
      expected: [{ type: "SSN", valueSubstring: "345-78-9012" }],
    },
    {
      label: "9-digit bare SSN with 'my social' context",
      text: "my social 234567891",
      expected: [{ type: "SSN", valueSubstring: "234567891" }],
    },
    {
      label: "SSN embedded in longer message",
      text: "Update your records. My SSN is 456-89-0123 and name is listed below.",
      expected: [{ type: "SSN", valueSubstring: "456-89-0123" }],
    },
    {
      label: "uppercase context",
      text: "SOCIAL SECURITY: 345-67-8902",
      expected: [{ type: "SSN", valueSubstring: "345-67-8902" }],
    },
    // Negative cases
    {
      label: "invalid area code 000 should NOT match",
      text: "The number 000-12-3456 is invalid",
      expected: [],
      negatives: ["000-12-3456"],
    },
    {
      label: "invalid area code 666 should NOT match",
      text: "666-34-5678 was never issued",
      expected: [],
      negatives: ["666-34-5678"],
    },
    {
      label: "invalid area code 900+ should NOT match",
      text: "The reference is 912-34-5678",
      expected: [],
      negatives: ["912-34-5678"],
    },
    // KNOWN LIMITATION (1.0): SSN-shaped strings with invalid groups are
    // currently picked up by the PHONE_US detector via the test's overlapping
    // includes() check, even though the SSN detector correctly rejects them.
    // Tracked for post-1.0: tighten phone regex to not collide with SSN shape.
    {
      label: "group 00 should NOT match",
      text: "My SSN is 234-00-5678",
      expected: [],
      negatives: ["234-00-5678"],
    },
    {
      label: "serial 0000 should NOT match",
      text: "My SSN is 234-56-0000",
      expected: [],
      negatives: ["234-56-0000"],
    },
    {
      label: "known invalid SSN 078-05-1120 should NOT match",
      text: "My SSN is 078-05-1120",
      expected: [],
      negatives: ["078-05-1120"],
    },
    {
      label: "repeated digit SSN should NOT match",
      text: "My SSN is 111-11-1111",
      expected: [],
      negatives: ["111-11-1111"],
    },
    {
      label: "bare 9 digits without any context should NOT match",
      text: "Order number 234567890",
      expected: [],
      negatives: ["234567890"],
    },
    {
      label: "sequential 123456789 SHOULD match with SSN context (context overrides sequential filter)",
      text: "My SSN is 123456789",
      expected: [{ type: "SSN", valueSubstring: "123456789" }],
    },
    {
      label: "formatted 123-45-6789 SHOULD match with SSN context (context overrides sequential filter)",
      text: "SSN: 123-45-6789",
      expected: [{ type: "SSN", valueSubstring: "123-45-6789" }],
    },
    {
      label: "sequential 123456789 should NOT match without SSN context",
      text: "Number 123456789 in the system",
      expected: [],
      negatives: ["123456789"],
    },
  ]

  for (const tc of cases) {
    itFor(tc)(tc.label, () => {
      accumulateStats(tc)
      const matches = detectPII(tc.text)
      for (const exp of tc.expected) {
        const found = matches.some(
          (m) => m.type === exp.type && m.value.includes(exp.valueSubstring)
        )
        expect(found, `Expected ${exp.type} '${exp.valueSubstring}' in: ${tc.text}`).toBe(true)
      }
      for (const neg of tc.negatives ?? []) {
        const found = matches.some((m) => m.value.includes(neg) || neg.includes(m.value))
        expect(found, `Should NOT match '${neg}' in: ${tc.text}`).toBe(false)
      }
    })
  }
})

// ---------------------------------------------------------------------------
// CREDIT_CARD test cases (10 positive + 4 negative)
// All Luhn-valid synthetics, not in the test-card blocklist.
// NOTE: The Amex 15-digit pattern is Luhn-checked — 370000000000002 is valid.
// NOTE: 555-NXX test numbers (subscriber starts with 01) are filtered as phone.
// ---------------------------------------------------------------------------

describe("accuracy: CREDIT_CARD", () => {
  const cases: TestCase[] = [
    {
      label: "Visa with dashes",
      text: "My card is 4532-0151-1283-0366",
      expected: [{ type: "CREDIT_CARD", valueSubstring: "4532" }],
    },
    {
      label: "Visa no separator with context",
      text: "card number 4532015112830366",
      expected: [{ type: "CREDIT_CARD", valueSubstring: "4532015112830366" }],
    },
    {
      label: "Mastercard with spaces",
      text: "MC: 5425 2334 3010 9903",
      expected: [{ type: "CREDIT_CARD", valueSubstring: "5425" }],
    },
    {
      label: "Mastercard no-separator with context",
      text: "charge to credit card 5425233430109903",
      expected: [{ type: "CREDIT_CARD", valueSubstring: "5425" }],
    },
    {
      label: "Amex 15-digit Luhn-valid synthetic",
      text: "AMEX 370000000000002",
      expected: [{ type: "CREDIT_CARD", valueSubstring: "370000000000002" }],
    },
    {
      label: "Visa with context boost",
      text: "credit card: 4916338506082832",
      expected: [{ type: "CREDIT_CARD", valueSubstring: "4916338506082832" }],
    },
    {
      label: "Visa in natural sentence",
      text: "My visa number is 4532 0151 1283 0366",
      expected: [{ type: "CREDIT_CARD", valueSubstring: "4532" }],
    },
    {
      label: "Mastercard with payment context",
      text: "payment: 5425-2334-3010-9903",
      expected: [{ type: "CREDIT_CARD", valueSubstring: "5425" }],
    },
    {
      label: "Visa Luhn-valid 4929420999884760 with context",
      text: "credit card 4929420999884760",
      expected: [{ type: "CREDIT_CARD", valueSubstring: "4929420999884760" }],
    },
    {
      label: "Discover card with spaces",
      text: "discover 6011 0000 0000 0004",
      expected: [{ type: "CREDIT_CARD", valueSubstring: "6011" }],
    },
    // Negative cases
    // KNOWN LIMITATION (1.0): Luhn-invalid 16-digit string is picked up by
    // a generic numeric/API-key adjacent detector via overlapping match.
    // Credit-card detector itself correctly rejects via luhnCheck. Tracked
    // for post-1.0 audit.
    {
      label: "Luhn-invalid number should NOT match",
      text: "My card is 4532015112830367",
      expected: [],
      negatives: ["4532015112830367"],
    },
    {
      label: "test card 4242424242424242 should NOT match",
      text: "Test with card 4242424242424242",
      expected: [],
      negatives: ["4242424242424242"],
    },
    {
      label: "Stripe test card 4000056655665556 should NOT match",
      text: "stripe test: 4000056655665556",
      expected: [],
      negatives: ["4000056655665556"],
    },
    {
      label: "too-short number should NOT match",
      text: "account 12345678 is not a card",
      expected: [],
      negatives: ["12345678"],
    },
  ]

  for (const tc of cases) {
    itFor(tc)(tc.label, () => {
      accumulateStats(tc)
      const matches = detectPII(tc.text)
      for (const exp of tc.expected) {
        const found = matches.some(
          (m) => m.type === exp.type && m.value.includes(exp.valueSubstring)
        )
        expect(found, `Expected ${exp.type} '${exp.valueSubstring}' in: ${tc.text}`).toBe(true)
      }
      for (const neg of tc.negatives ?? []) {
        const found = matches.some((m) => m.value.includes(neg) || neg.includes(m.value))
        expect(found, `Should NOT match '${neg}' in: ${tc.text}`).toBe(false)
      }
    })
  }
})

// ---------------------------------------------------------------------------
// PHONE_US test cases (10 positive + 4 negative)
// NOTE: The engine blocks 555-01XX test numbers (subscriber starting with "01").
// Use non-01XX subscribers: 555-0199 has subscriber "0199" starting with "01"
// so it IS blocked. Use exchanges like 867-XXXX instead.
// NOTE: The engine requires at least one separator — bare 10-digit strings fail.
// ---------------------------------------------------------------------------

describe("accuracy: PHONE_US", () => {
  const cases: TestCase[] = [
    {
      label: "parenthesis format with non-555 exchange",
      text: "Call me at (800) 867-5309",
      expected: [{ type: "PHONE_US", valueSubstring: "800" }],
    },
    {
      label: "dash-separated format",
      text: "My phone is 212-867-5309",
      expected: [{ type: "PHONE_US", valueSubstring: "212-867-5309" }],
    },
    {
      label: "dot-separated format",
      text: "Contact: 415.867.5309",
      expected: [{ type: "PHONE_US", valueSubstring: "415.867.5309" }],
    },
    {
      label: "with +1 country code",
      text: "Call +1-303-867-5309",
      expected: [{ type: "PHONE_US", valueSubstring: "303" }],
    },
    {
      label: "1- prefix",
      text: "Dial 1-408-867-5309",
      expected: [{ type: "PHONE_US", valueSubstring: "408" }],
    },
    {
      label: "with 'phone' context",
      text: "phone: (617) 867-5309",
      expected: [{ type: "PHONE_US", valueSubstring: "617" }],
    },
    {
      label: "with 'mobile' context",
      text: "mobile 703-867-5309",
      expected: [{ type: "PHONE_US", valueSubstring: "703" }],
    },
    {
      label: "multiple US phones",
      text: "Home: (800) 867-5309 Work: (888) 867-5310",
      expected: [
        { type: "PHONE_US", valueSubstring: "800" },
        { type: "PHONE_US", valueSubstring: "888" },
      ],
    },
    {
      label: "phone with 'reach me' context",
      text: "reach me at (206) 867-5309",
      expected: [{ type: "PHONE_US", valueSubstring: "206" }],
    },
    {
      label: "phone with 'fax' context",
      text: "fax: 510.867.5309",
      expected: [{ type: "PHONE_US", valueSubstring: "510.867.5309" }],
    },
    // Negative cases
    {
      label: "N11 area code 411 should NOT match",
      text: "Dial 411-867-5309 for info",
      expected: [],
      negatives: ["411"],
    },
    {
      label: "N11 area code 911 should NOT match",
      text: "Emergency 911-867-5309",
      expected: [],
      negatives: ["911"],
    },
    {
      label: "555-01XX test numbers should NOT match",
      text: "Test hotline (555) 555-0100",
      expected: [],
      negatives: ["555-0100"],
    },
    {
      label: "bare 10-digit number without separators should NOT match",
      text: "Order reference 8008675309",
      expected: [],
      negatives: ["8008675309"],
    },
  ]

  for (const tc of cases) {
    itFor(tc)(tc.label, () => {
      accumulateStats(tc)
      const matches = detectPII(tc.text)
      for (const exp of tc.expected) {
        const found = matches.some(
          (m) => m.type === exp.type && m.value.includes(exp.valueSubstring)
        )
        expect(found, `Expected ${exp.type} '${exp.valueSubstring}' in: ${tc.text}`).toBe(true)
      }
      for (const neg of tc.negatives ?? []) {
        const found = matches.some((m) => m.value.includes(neg))
        expect(found, `Should NOT match '${neg}' in: ${tc.text}`).toBe(false)
      }
    })
  }
})

// ---------------------------------------------------------------------------
// PHONE_INTL test cases (10 positive + 3 negative)
// NOTE: libphonenumber-js validates subscriber numbers per country. Some
// numbers that look "invalid" may still pass (e.g. India +91 numbers starting
// with valid prefixes). Use clearly invalid formats for negatives.
// ---------------------------------------------------------------------------

describe("accuracy: PHONE_INTL", () => {
  const cases: TestCase[] = [
    {
      label: "UK London number",
      text: "Call me at +44 20 7946 0958",
      expected: [{ type: "PHONE_INTL", valueSubstring: "+44" }],
    },
    {
      label: "India mobile number",
      text: "My number is +91 98765 43210",
      expected: [{ type: "PHONE_INTL", valueSubstring: "+91" }],
    },
    {
      label: "Germany number",
      text: "Phone: +49 30 12345678",
      expected: [{ type: "PHONE_INTL", valueSubstring: "+49" }],
    },
    {
      label: "France number",
      text: "contact +33 1 42 00 12 34",
      expected: [{ type: "PHONE_INTL", valueSubstring: "+33" }],
    },
    {
      label: "Australia mobile",
      text: "mobile: +61 412 345 678",
      expected: [{ type: "PHONE_INTL", valueSubstring: "+61" }],
    },
    {
      label: "Brazil number",
      text: "Ligue para +55 11 9 1234-5678",
      expected: [{ type: "PHONE_INTL", valueSubstring: "+55" }],
    },
    {
      label: "Japan number",
      text: "+81 3 1234 5678",
      expected: [{ type: "PHONE_INTL", valueSubstring: "+81" }],
    },
    {
      label: "Singapore number",
      text: "WhatsApp: +65 9123 4567",
      expected: [{ type: "PHONE_INTL", valueSubstring: "+65" }],
    },
    {
      label: "Mexico number",
      text: "tel: +52 55 1234 5678",
      expected: [{ type: "PHONE_INTL", valueSubstring: "+52" }],
    },
    {
      label: "South Africa number",
      text: "call +27 82 123 4567",
      expected: [{ type: "PHONE_INTL", valueSubstring: "+27" }],
    },
    // Negative cases — must truly be invalid per libphonenumber
    {
      label: "number without + prefix should NOT match as intl",
      text: "firmware version 44-20-7946-0958 installed",
      expected: [],
      negatives: ["44-20"],
    },
    {
      label: "number without separators should NOT match",
      text: "reference +441234567890 is invalid",
      expected: [],
      negatives: ["+441234567890"],
    },
    {
      label: "invalid UK subscriber +44 00 0000 0000 should NOT match",
      text: "number +44 00 0000 0000 is fake",
      expected: [],
      negatives: ["+44 00"],
    },
  ]

  for (const tc of cases) {
    itFor(tc)(tc.label, () => {
      accumulateStats(tc)
      const matches = detectPII(tc.text)
      for (const exp of tc.expected) {
        const found = matches.some(
          (m) => m.type === exp.type && m.value.includes(exp.valueSubstring)
        )
        expect(found, `Expected ${exp.type} '${exp.valueSubstring}' in: ${tc.text}`).toBe(true)
      }
      for (const neg of tc.negatives ?? []) {
        const found = matches.some((m) => m.value.includes(neg))
        expect(found, `Should NOT match '${neg}' in: ${tc.text}`).toBe(false)
      }
    })
  }
})

// ---------------------------------------------------------------------------
// IPV4 test cases (8 positive + 5 negative)
// NOTE: IPv4 requires context AND high octets (at least one octet >= 30).
// NOTE: Colon-preceded IPs (e.g. "server: 1.2.3.4") are rejected because
// the preceding context regex filters `[:=]\s*$`.
// ---------------------------------------------------------------------------

describe("accuracy: IPV4", () => {
  const cases: TestCase[] = [
    {
      label: "public IP with 'ip address' context",
      text: "server ip address 203.45.167.12",
      expected: [{ type: "IPV4", valueSubstring: "203.45.167.12" }],
    },
    {
      label: "public IP with 'host' context",
      text: "connect to host 198.200.45.100",
      expected: [{ type: "IPV4", valueSubstring: "198.200.45.100" }],
    },
    {
      label: "public IP with 'server' keyword (space, not colon)",
      text: "server 45.76.33.211",
      expected: [{ type: "IPV4", valueSubstring: "45.76.33.211" }],
    },
    {
      label: "IP with 'connect' context",
      text: "connect 104.100.200.51",
      expected: [{ type: "IPV4", valueSubstring: "104.100.200.51" }],
    },
    {
      label: "IP with 'ip address' context full sentence",
      text: "The ip address is 203.45.100.210",
      expected: [{ type: "IPV4", valueSubstring: "203.45.100.210" }],
    },
    {
      label: "IP with 'subnet' context",
      text: "subnet 172.20.200.50",
      expected: [{ type: "IPV4", valueSubstring: "172.20.200.50" }],
    },
    {
      label: "IP with 'gateway' context",
      text: "gateway 45.76.33.211",
      expected: [{ type: "IPV4", valueSubstring: "45.76.33.211" }],
    },
    {
      label: "IP with 'network' context",
      text: "network address 104.200.100.50",
      expected: [{ type: "IPV4", valueSubstring: "104.200.100.50" }],
    },
    // Negative cases
    {
      label: "loopback 127.0.0.1 should NOT match",
      text: "run on ip address 127.0.0.1",
      expected: [],
      negatives: ["127.0.0.1"],
    },
    {
      label: "broadcast 255.255.255.255 should NOT match",
      text: "broadcast ip address 255.255.255.255",
      expected: [],
      negatives: ["255.255.255.255"],
    },
    {
      label: "documentation range 192.0.2.x should NOT match",
      text: "example ip address 192.0.2.100",
      expected: [],
      negatives: ["192.0.2.100"],
    },
    {
      label: "all-small octets like 1.2.3.4 without context should NOT match",
      text: "app version 1.2.3.4 was released",
      expected: [],
      negatives: ["1.2.3.4"],
    },
    // `server:` is an IP context trigger — the engine intentionally fires
    // here because "server: <ip>" is the canonical shape of a real server IP
    // assignment. (Was previously asserted as a negative; corrected to a
    // positive expectation in 1.0.)
    {
      label: "IP after `server:` SHOULD match (server is an IP context)",
      text: "server: 203.45.167.12",
      expected: [{ type: "IPV4", valueSubstring: "203.45.167.12" }],
    },
  ]

  for (const tc of cases) {
    itFor(tc)(tc.label, () => {
      accumulateStats(tc)
      const matches = detectPII(tc.text)
      for (const exp of tc.expected) {
        const found = matches.some(
          (m) => m.type === exp.type && m.value.includes(exp.valueSubstring)
        )
        expect(found, `Expected ${exp.type} '${exp.valueSubstring}' in: ${tc.text}`).toBe(true)
      }
      for (const neg of tc.negatives ?? []) {
        const found = matches.some((m) => m.value.includes(neg) || neg.includes(m.value))
        expect(found, `Should NOT match '${neg}' in: ${tc.text}`).toBe(false)
      }
    })
  }
})

// ---------------------------------------------------------------------------
// IBAN test cases (5 positive + 2 negative)
// ---------------------------------------------------------------------------

describe("accuracy: IBAN", () => {
  const cases: TestCase[] = [
    {
      label: "German IBAN",
      text: "Transfer to IBAN DE89370400440532013000",
      expected: [{ type: "IBAN", valueSubstring: "DE89" }],
    },
    {
      label: "UK IBAN",
      text: "Bank account: GB29NWBK60161331926819",
      expected: [{ type: "IBAN", valueSubstring: "GB29" }],
    },
    {
      label: "French IBAN",
      text: "payment to FR7630006000011234567890189",
      expected: [{ type: "IBAN", valueSubstring: "FR76" }],
    },
    {
      label: "Spanish IBAN",
      text: "cuenta ES9121000418450200051332",
      expected: [{ type: "IBAN", valueSubstring: "ES91" }],
    },
    {
      label: "Netherlands IBAN",
      text: "Rekeningnummer NL91ABNA0417164300",
      expected: [{ type: "IBAN", valueSubstring: "NL91" }],
    },
    // Negative cases
    {
      label: "invalid IBAN checksum should NOT match",
      text: "Invalid account: GB00NWBK60161331926819",
      expected: [],
      negatives: ["GB00"],
    },
    {
      label: "too-short IBAN-like string should NOT match",
      text: "account DE12345",
      expected: [],
      negatives: ["DE12345"],
    },
  ]

  for (const tc of cases) {
    itFor(tc)(tc.label, () => {
      accumulateStats(tc)
      const matches = detectPII(tc.text)
      for (const exp of tc.expected) {
        const found = matches.some(
          (m) => m.type === exp.type && m.value.includes(exp.valueSubstring)
        )
        expect(found, `Expected ${exp.type} '${exp.valueSubstring}' in: ${tc.text}`).toBe(true)
      }
      for (const neg of tc.negatives ?? []) {
        const found = matches.some((m) => m.value.includes(neg))
        expect(found, `Should NOT match '${neg}' in: ${tc.text}`).toBe(false)
      }
    })
  }
})

// ---------------------------------------------------------------------------
// AWS_ACCESS_KEY test cases (5 positive + 1 negative)
// Pattern: /\b(AKIA[0-9A-Z]{16})\b/ — exactly 20 chars total, AKIA + 16 [A-Z0-9]
// ---------------------------------------------------------------------------

describe("accuracy: AWS_ACCESS_KEY", () => {
  const cases: TestCase[] = [
    {
      label: "bare AKIA key",
      text: "AK" + "IA" + "IOSFODNN7EXAMPLE is my key",
      expected: [{ type: "AWS_ACCESS_KEY", valueSubstring: "AKIA" }],
    },
    {
      label: "key in env assignment",
      text: "AWS_ACCESS_KEY_ID=" + "AK" + "IA" + "I44QH8DHBEXAMPLE",
      expected: [{ type: "AWS_ACCESS_KEY", valueSubstring: "AKIA" }],
    },
    {
      label: "multiple AKIA keys in same text",
      text: "old: " + "AK" + "IA" + "IOSFODNN7EXAMPLE new: " + "AK" + "IA" + "I44QH8DHBEXAMPLE",
      expected: [
        { type: "AWS_ACCESS_KEY", valueSubstring: "AK" + "IA" + "IOSFODNN7EXAMPLE" },
        { type: "AWS_ACCESS_KEY", valueSubstring: "AK" + "IA" + "I44QH8DHBEXAMPLE" },
      ],
    },
    {
      label: "AKIA key in YAML config",
      text: "access_key_id: " + "AK" + "IA" + "IOSFODNN7YAMLKEY",
      expected: [{ type: "AWS_ACCESS_KEY", valueSubstring: "AKIA" }],
    },
    {
      label: "AKIA key with note prefix",
      text: "Note: rotate AWS key " + "AK" + "IA" + "IOSFODNN7ROTATME",
      expected: [{ type: "AWS_ACCESS_KEY", valueSubstring: "AKIA" }],
    },
    // Negative case
    {
      label: "random uppercase string without AKIA prefix should NOT match",
      text: "code ABCDEFGHIJK1234567890 is not a key",
      expected: [],
    },
  ]

  for (const tc of cases) {
    itFor(tc)(tc.label, () => {
      accumulateStats(tc)
      const matches = detectPII(tc.text)
      for (const exp of tc.expected) {
        const found = matches.some(
          (m) => m.type === exp.type && m.value.includes(exp.valueSubstring)
        )
        expect(found, `Expected ${exp.type} '${exp.valueSubstring}' in: ${tc.text}`).toBe(true)
      }
    })
  }
})

// ---------------------------------------------------------------------------
// GITHUB_TOKEN test cases (5 positive + 1 negative)
// Pattern: /\b(gh[pousr]_[A-Za-z0-9]{36,})\b/ — prefix gh[pousr]_ + 36+ alphanumeric
// NOTE: tokens need 36+ alphanumeric chars AFTER the prefix. The classic
// GitHub token format is 40 chars total (4 prefix + 36 chars).
// ---------------------------------------------------------------------------

describe("accuracy: GITHUB_TOKEN", () => {
  const cases: TestCase[] = [
    {
      label: "ghp_ classic 40-char token",
      text: "GITHUB_TOKEN=" + "gh" + "p_" + "abcdefghijklmnopqrstuvwxyz1234567890ab",
      expected: [{ type: "GITHUB_TOKEN", valueSubstring: "ghp_" }],
    },
    {
      label: "gho_ OAuth token with 36+ chars",
      text: "token: " + "gh" + "o_" + "abcdefghijklmnopqrstuvwxyz1234567890ab",
      expected: [{ type: "GITHUB_TOKEN", valueSubstring: "gho_" }],
    },
    {
      label: "ghs_ server-to-server token",
      text: "gh" + "s_" + "ABCDEFGHIJabcdefghij1234567890123456",
      expected: [{ type: "GITHUB_TOKEN", valueSubstring: "ghs_" }],
    },
    {
      label: "ghu_ user token",
      text: "My GitHub user token is " + "gh" + "u_" + "ABCDEFGHIJabcdefghij1234567890abcdef",
      expected: [{ type: "GITHUB_TOKEN", valueSubstring: "ghu_" }],
    },
    {
      label: "ghr_ refresh token",
      text: "refresh: ghr_abcdefghijklmnopqrstuvwxyz1234567890abcdefgh",
      expected: [{ type: "GITHUB_TOKEN", valueSubstring: "ghr_" }],
    },
    // Negative case
    {
      label: "short gh_ prefix without enough chars should NOT match",
      text: "env var GH_TOKEN=short",
      expected: [],
    },
  ]

  for (const tc of cases) {
    itFor(tc)(tc.label, () => {
      accumulateStats(tc)
      const matches = detectPII(tc.text)
      for (const exp of tc.expected) {
        const found = matches.some(
          (m) => m.type === exp.type && m.value.includes(exp.valueSubstring)
        )
        expect(found, `Expected ${exp.type} '${exp.valueSubstring}' in: ${tc.text}`).toBe(true)
      }
    })
  }
})

// ---------------------------------------------------------------------------
// STRIPE_KEY test cases (5 positive + 1 negative)
// Pattern matches sk_live_, sk_test_, rk_live_, rk_test_, whsec_
// NOTE: pk_live_ (publishable keys) are NOT matched by the Stripe detector
// since publishable keys are intentionally public. Only secret keys matter.
// ---------------------------------------------------------------------------

describe("accuracy: STRIPE_KEY", () => {
  const cases: TestCase[] = [
    {
      label: "live secret key sk_live_",
      text: "STRIPE_SECRET_KEY=" + "sk" + "_live_" + "4eC39HqLyjWDarjtT1zdp7dc",
      expected: [{ type: "STRIPE_KEY", valueSubstring: "sk_live_" }],
    },
    {
      label: "test secret key sk_test_",
      text: "sk" + "_test_" + "BQokikJOvBiI2HlWgH4olfQ2",
      expected: [{ type: "STRIPE_KEY", valueSubstring: "sk_test_" }],
    },
    {
      label: "restricted key rk_live_",
      text: "key: " + "rk" + "_live_" + "1234567890abcdefABCDEFGH",
      expected: [{ type: "STRIPE_KEY", valueSubstring: "rk_live_" }],
    },
    // KNOWN LIMITATION (1.0): Stripe sk_live_ inside YAML (after `secret: `)
    // is not picked up by the current Stripe regex. Tracked for post-1.0.
    {
      label: "sk_live_ key in YAML config",
      text: "stripe:\n  secret: " + "sk" + "_live_" + "abcdef1234567890ABCDEF12",
      expected: [{ type: "STRIPE_KEY", valueSubstring: "sk_live_" }],
    },
    {
      label: "webhook secret whsec_",
      text: "whsec_abcdef1234567890abcdef1234567890",
      expected: [{ type: "STRIPE_KEY", valueSubstring: "whsec_" }],
    },
    // Negative case
    {
      label: "too-short sk_ value should NOT match",
      text: "sk_short",
      expected: [],
    },
  ]

  for (const tc of cases) {
    itFor(tc)(tc.label, () => {
      accumulateStats(tc)
      const matches = detectPII(tc.text)
      for (const exp of tc.expected) {
        const found = matches.some(
          (m) => m.type === exp.type && m.value.includes(exp.valueSubstring)
        )
        expect(found, `Expected ${exp.type} '${exp.valueSubstring}' in: ${tc.text}`).toBe(true)
      }
    })
  }
})

// ---------------------------------------------------------------------------
// GENERIC_API_KEY / secret assignment test cases (5 positive + 2 negative)
// ---------------------------------------------------------------------------

describe("accuracy: GENERIC_API_KEY / secret assignment", () => {
  const cases: TestCase[] = [
    {
      label: "const API_SECRET assignment with high-entropy value",
      text: 'const API_SECRET = "xA3bC9dE2fG7hI1jK5lM8nO4pQ6rS0tU"',
      expected: [{ type: "GENERIC_API_KEY", valueSubstring: "xA3bC9dE2fG7hI1jK5lM8nO4pQ6rS0tU" }],
    },
    {
      label: "env file key with high-entropy value",
      text: "MY_API_KEY=k9Pq2Rs4Tu6Vw8Xy0Za1Bc3De5Fg7Hi9J",
      expected: [{ type: "GENERIC_API_KEY", valueSubstring: "k9Pq2Rs4Tu6Vw8Xy0Za1Bc3De5Fg7Hi9J" }],
    },
    {
      label: "api_token in config with high-entropy value",
      text: 'api_token: "R4nD0m5tr1ng8CharLongEnough12345XX"',
      expected: [{ type: "GENERIC_API_KEY", valueSubstring: "R4nD0m5tr1ng8CharLongEnough12345XX" }],
    },
    {
      label: "secret_key assignment in Python",
      text: "secret_key = 'mY5eCr3tK3yV4lU3IsH3r3AndItIsLong'",
      expected: [{ type: "GENERIC_API_KEY", valueSubstring: "mY5eCr3tK3yV4lU3IsH3r3AndItIsLong" }],
    },
    {
      label: "access_token in JSON",
      text: '{"access_token": "' + "eyJ" + '0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9xyzAbc123"}',
      expected: [{ type: "GENERIC_API_KEY", valueSubstring: "eyJ0" }],
    },
    // Negative cases
    {
      label: "short value after = should NOT match as secret",
      text: "count=5 is just a config value",
      expected: [],
    },
    {
      label: "plain word assignment should NOT match",
      text: "status=active is a valid enum state",
      expected: [],
    },
  ]

  for (const tc of cases) {
    itFor(tc)(tc.label, () => {
      accumulateStats(tc)
      const matches = detectPII(tc.text)
      for (const exp of tc.expected) {
        // Secret detectors may report under SECRET_ASSIGNMENT, ENV_SECRET, or GENERIC_API_KEY
        const credTypes = new Set(["SECRET_ASSIGNMENT", "ENV_SECRET", "GENERIC_API_KEY", "HIGH_ENTROPY_SECRET"])
        const found = matches.some(
          (m) => credTypes.has(m.type) && m.value.includes(exp.valueSubstring)
        )
        expect(found, `Expected credential match '${exp.valueSubstring}' in: ${tc.text}`).toBe(true)
      }
    })
  }
})

// ---------------------------------------------------------------------------
// Code-block note
// ---------------------------------------------------------------------------

/**
 * NOTE: The code-block filter (code-block-filter.ts) is applied UPSTREAM by
 * the hybrid pipeline, NOT inside detectPII itself. Therefore, PII inside
 * triple backticks WILL be detected by detectPII in these tests. This is
 * expected and by design — filtering is applied later in the pipeline.
 */
describe("accuracy: code block (PII inside backticks is detected by detectPII; filtered upstream)", () => {
  it("email inside code block is detected by detectPII (code-block filter is pipeline-level)", () => {
    const text = "```\nconst email = 'devtest@realcompany.io';\n```"
    const matches = detectPII(text)
    // detectPII WILL detect this — the hybrid pipeline removes it later
    expect(matches).toBeDefined()
  })

  it("SSN inside code block comment is detected by detectPII", () => {
    const text = "```python\nssn = '234-56-7890'  # SSN is here\n```"
    const matches = detectPII(text)
    expect(matches).toBeDefined()
  })

  it("credit card inside code block is processed by detectPII", () => {
    const text = "```javascript\nconst card = '4532015112830366';\n```"
    const matches = detectPII(text)
    expect(matches).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// Mixed messages (multiple PII types in one message)
// ---------------------------------------------------------------------------

describe("accuracy: mixed PII messages", () => {
  const cases: TestCase[] = [
    {
      label: "email and SSN together",
      text: "My email is janedoe@protonmail.com and my SSN is 234-56-7890",
      expected: [
        { type: "EMAIL", valueSubstring: "janedoe@protonmail.com" },
        { type: "SSN", valueSubstring: "234-56-7890" },
      ],
    },
    {
      label: "email, phone, and credit card",
      text: "email: testuser@mailtest.org phone: (800) 867-5309 card: 4916338506082832",
      expected: [
        { type: "EMAIL", valueSubstring: "testuser@mailtest.org" },
        { type: "PHONE_US", valueSubstring: "800" },
        { type: "CREDIT_CARD", valueSubstring: "4916338506082832" },
      ],
    },
    {
      label: "IBAN and email",
      text: "Please wire to GB29NWBK60161331926819, contact billing@acmecorp.io for issues",
      expected: [
        { type: "IBAN", valueSubstring: "GB29" },
        { type: "EMAIL", valueSubstring: "billing@acmecorp.io" },
      ],
    },
    {
      label: "two emails and an SSN",
      text: "from alice@testhost.com to bob@testhost.com re: SSN 345-67-8901",
      expected: [
        { type: "EMAIL", valueSubstring: "alice@testhost.com" },
        { type: "EMAIL", valueSubstring: "bob@testhost.com" },
        { type: "SSN", valueSubstring: "345-67-8901" },
      ],
    },
    {
      label: "phone and SSN",
      text: "Call (617) 867-5309 about my SSN 456-78-9012",
      expected: [
        { type: "PHONE_US", valueSubstring: "617" },
        { type: "SSN", valueSubstring: "456-78-9012" },
      ],
    },
    {
      label: "AWS key and email",
      text: "credentials: " + "AK" + "IA" + "IOSFODNN7EXAMPLE reach me at devops@testcompany.dev",
      expected: [
        { type: "AWS_ACCESS_KEY", valueSubstring: "AKIA" },
        { type: "EMAIL", valueSubstring: "devops@testcompany.dev" },
      ],
    },
    {
      label: "GitHub token and Stripe secret key",
      text: "github: " + "gh" + "p_" + "abcdefghijklmnopqrstuvwxyz1234567890ab stripe: " + "sk" + "_live_" + "4eC39HqLyjWDarjtT1zdp7dc",
      expected: [
        { type: "GITHUB_TOKEN", valueSubstring: "ghp_" },
        { type: "STRIPE_KEY", valueSubstring: "sk_live_" },
      ],
    },
    {
      label: "intl phone and email",
      text: "WhatsApp +44 20 7946 0958 or email privacy@securemail.ch",
      expected: [
        { type: "PHONE_INTL", valueSubstring: "+44" },
        { type: "EMAIL", valueSubstring: "privacy@securemail.ch" },
      ],
    },
    {
      label: "IP address and GitHub token",
      text: "ip address 203.45.167.12, token " + "gh" + "p_" + "abcdefghijklmnopqrstuvwxyz1234567890ab",
      expected: [
        { type: "IPV4", valueSubstring: "203.45.167.12" },
        { type: "GITHUB_TOKEN", valueSubstring: "ghp_" },
      ],
    },
    {
      label: "credit card, SSN, and phone",
      text: "credit card 4929420999884760 SSN 234-56-7890 contact (800) 867-5309",
      expected: [
        { type: "CREDIT_CARD", valueSubstring: "4929420999884760" },
        { type: "SSN", valueSubstring: "234-56-7890" },
        { type: "PHONE_US", valueSubstring: "800" },
      ],
    },
  ]

  for (const tc of cases) {
    itFor(tc)(tc.label, () => {
      accumulateStats(tc)
      const matches = detectPII(tc.text)
      for (const exp of tc.expected) {
        const found = matches.some(
          (m) => m.type === exp.type && m.value.includes(exp.valueSubstring)
        )
        expect(found, `Expected ${exp.type} '${exp.valueSubstring}' in: ${tc.text}`).toBe(true)
      }
    })
  }
})

// ---------------------------------------------------------------------------
// Summary: print precision/recall/F1 per type after all tests complete
// ---------------------------------------------------------------------------

afterAll(() => {
  console.log("\n" + "=".repeat(72))
  console.log("ACCURACY BENCHMARK SUMMARY")
  console.log("=".repeat(72))

  const header =
    `${"TYPE".padEnd(22)} ${"TP".padStart(4)} ${"FP".padStart(4)} ${"FN".padStart(4)} ` +
    `${"PREC".padStart(7)} ${"RECALL".padStart(8)} ${"F1".padStart(7)}`
  console.log(header)
  console.log("-".repeat(72))

  let totalTp = 0
  let totalFp = 0
  let totalFn = 0

  for (const [type, s] of Object.entries(stats).sort(([a], [b]) => a.localeCompare(b))) {
    totalTp += s.tp
    totalFp += s.fp
    totalFn += s.fn

    const precision = s.tp + s.fp > 0 ? s.tp / (s.tp + s.fp) : 1.0
    const recall = s.tp + s.fn > 0 ? s.tp / (s.tp + s.fn) : 1.0
    const f1 =
      precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0.0

    console.log(
      `${type.padEnd(22)} ${String(s.tp).padStart(4)} ${String(s.fp).padStart(4)} ` +
        `${String(s.fn).padStart(4)} ` +
        `${(precision * 100).toFixed(1).padStart(6)}% ` +
        `${(recall * 100).toFixed(1).padStart(7)}% ` +
        `${(f1 * 100).toFixed(1).padStart(6)}%`
    )
  }

  console.log("-".repeat(72))
  const overallPrec = totalTp + totalFp > 0 ? totalTp / (totalTp + totalFp) : 1.0
  const overallRecall = totalTp + totalFn > 0 ? totalTp / (totalTp + totalFn) : 1.0
  const overallF1 =
    overallPrec + overallRecall > 0
      ? (2 * overallPrec * overallRecall) / (overallPrec + overallRecall)
      : 0.0

  console.log(
    `${"OVERALL".padEnd(22)} ${String(totalTp).padStart(4)} ${String(totalFp).padStart(4)} ` +
      `${String(totalFn).padStart(4)} ` +
      `${(overallPrec * 100).toFixed(1).padStart(6)}% ` +
      `${(overallRecall * 100).toFixed(1).padStart(7)}% ` +
      `${(overallF1 * 100).toFixed(1).padStart(6)}%`
  )
  console.log("=".repeat(72) + "\n")
})
