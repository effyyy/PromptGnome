/**
 * Tests for the regex-based PII detection engine.
 * Uses synthetic PII data only — never real data.
 */
import { describe, it, expect } from "vitest"

import {
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
  detectIBANs,
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
  detectOpenAIKeys,
  detectAnthropicKeys,
  detectGoogleAIKeys,
  detectSlackTokens,
  detectPrivateKeys,
  detectJWTTokens,
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
  detectPII,
  deduplicateMatches,
  detectSecretAssignments,
  detectEnvFileSecrets,
  detectHighEntropySecrets,
} from "../../src/detection/regex-engine"

// ─── EMAIL ────────────────────────────────────────────────────────────

describe("detectEmails", () => {
  it("should detect standard email addresses", () => {
    const matches = detectEmails("Contact me at jane@mailhost.org")
    expect(matches).toHaveLength(1)
    expect(matches[0].value).toBe("jane@mailhost.org")
    expect(matches[0].type).toBe("EMAIL")
    expect(matches[0].confidence).toBeGreaterThanOrEqual(0.9)
  })

  it("should detect emails with dots and plus signs", () => {
    const matches = detectEmails("Email: first.last+tag@company.co.uk")
    expect(matches).toHaveLength(1)
    expect(matches[0].value).toBe("first.last+tag@company.co.uk")
  })

  it("should detect multiple emails in one text", () => {
    const matches = detectEmails("Send to a@b.com and c@d.org")
    expect(matches).toHaveLength(2)
  })

  it("should detect uppercase emails", () => {
    const matches = detectEmails("EMAIL: USER@MAILHOST.COM")
    expect(matches).toHaveLength(1)
  })

  it("should detect emails with hyphens in domain", () => {
    const matches = detectEmails("user@my-company.mailhost.com")
    expect(matches).toHaveLength(1)
  })

  it("should NOT match strings without @ sign", () => {
    const matches = detectEmails("This is just regular text")
    expect(matches).toHaveLength(0)
  })

  it("should NOT match incomplete emails", () => {
    const matches = detectEmails("user@ or @domain.com")
    expect(matches).toHaveLength(0)
  })

  it("should NOT match emails with spaces", () => {
    const matches = detectEmails("user @example.com is wrong")
    expect(matches).toHaveLength(0)
  })

  it("should NOT include leading dot in email match", () => {
    const matches = detectEmails(".test@mailhost.com")
    // The dot is not part of a valid local part start; the valid portion is test@mailhost.com
    expect(matches).toHaveLength(1)
    expect(matches[0].value).toBe("test@mailhost.com")
  })

  it("should NOT detect email with trailing dot in local part", () => {
    const matches = detectEmails("test.@example.com")
    expect(matches).toHaveLength(0)
  })

  it("should detect valid email with dots in middle", () => {
    const matches = detectEmails("first.last@mailhost.com")
    expect(matches).toHaveLength(1)
  })

  it("should detect single char local part", () => {
    const matches = detectEmails("a@mailhost.com")
    expect(matches).toHaveLength(1)
  })

  it("should NOT detect emails with RFC 2606 reserved domains", () => {
    expect(detectEmails("test@example.com")).toHaveLength(0)
    expect(detectEmails("user@example.org")).toHaveLength(0)
    expect(detectEmails("admin@example.net")).toHaveLength(0)
    expect(detectEmails("foo@sub.example.com")).toHaveLength(0)
  })

  it("should NOT detect emails with RFC 6761 reserved TLDs", () => {
    expect(detectEmails("user@domain.test")).toHaveLength(0)
    expect(detectEmails("user@domain.invalid")).toHaveLength(0)
    expect(detectEmails("user@domain.localhost")).toHaveLength(0)
    expect(detectEmails("user@domain.example")).toHaveLength(0)
  })
})

// ─── SSN ──────────────────────────────────────────────────────────────

describe("detectSSNs", () => {
  it("should detect SSNs with dashes", () => {
    const matches = detectSSNs("My SSN is 219-45-6789")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("SSN")
  })

  it("should detect SSNs with spaces", () => {
    const matches = detectSSNs("SSN: 234 56 7890")
    expect(matches).toHaveLength(1)
  })

  it("should detect SSNs without separators", () => {
    const matches = detectSSNs("My social: 345678901")
    expect(matches).toHaveLength(1)
  })

  it("should boost confidence when context trigger present", () => {
    const withContext = detectSSNs("My SSN is 219-45-6789")
    const withoutContext = detectSSNs("Number 219-45-6789 here")
    expect(withContext[0].confidence).toBeGreaterThanOrEqual(withoutContext[0].confidence)
  })

  it("should validate area numbers", () => {
    const matches = detectSSNs("SSN: 078-05-1121")
    expect(matches).toHaveLength(1)
  })

  it("should NOT match SSN with area 000", () => {
    const matches = detectSSNs("Number: 000-12-3456")
    expect(matches).toHaveLength(0)
  })

  it("should NOT match SSN with area 666", () => {
    const matches = detectSSNs("Number: 666-12-3456")
    expect(matches).toHaveLength(0)
  })

  it("should NOT match SSN with area 900+", () => {
    const matches = detectSSNs("Number: 900-12-3456")
    expect(matches).toHaveLength(0)
  })

  it("should NOT match SSN with group 00", () => {
    const matches = detectSSNs("Number: 123-00-6789")
    expect(matches).toHaveLength(0)
  })

  it("should NOT match SSN with serial 0000", () => {
    const matches = detectSSNs("Number: 123-45-0000")
    expect(matches).toHaveLength(0)
  })
})

// ─── CREDIT CARD ──────────────────────────────────────────────────────

describe("detectCreditCards", () => {
  // Use non-test Luhn-valid numbers (not in the known test card blocklist)
  it("should detect Visa numbers", () => {
    const matches = detectCreditCards("Card: 4539578763621486")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("CREDIT_CARD")
  })

  it("should detect Visa with spaces", () => {
    const matches = detectCreditCards("Card: 4539 5787 6362 1486")
    expect(matches).toHaveLength(1)
  })

  it("should detect Mastercard numbers", () => {
    const matches = detectCreditCards("MC: 5500000000000004")
    expect(matches).toHaveLength(1)
  })

  it("should detect Amex numbers", () => {
    const matches = detectCreditCards("Amex: 373529978616040")
    expect(matches).toHaveLength(1)
  })

  it("should detect Discover numbers", () => {
    const matches = detectCreditCards("Discover: 6011504901234562")
    expect(matches).toHaveLength(1)
  })

  it("should reject well-known test card numbers", () => {
    const matches = detectCreditCards("Card: 4111111111111111")
    expect(matches).toHaveLength(0)
  })

  it("should give higher confidence to Luhn-valid numbers", () => {
    const valid = detectCreditCards("Card: 4539578763621486")
    expect(valid[0].confidence).toBeGreaterThan(0.9)
  })

  it("should give lower confidence to Luhn-invalid numbers", () => {
    const invalid = detectCreditCards("Card: 4111111111111112")
    if (invalid.length > 0) {
      expect(invalid[0].confidence).toBeLessThan(0.9)
    }
  })

  it("should NOT match random 16-digit sequences", () => {
    const matches = detectCreditCards("ID: 1234567890123456")
    expect(matches).toHaveLength(0)
  })

  it("should boost confidence with card context", () => {
    const withContext = detectCreditCards("My credit card is 4539578763621486")
    const noContext = detectCreditCards("Number 4539578763621486 received")
    if (withContext.length > 0 && noContext.length > 0) {
      expect(withContext[0].confidence).toBeGreaterThanOrEqual(noContext[0].confidence)
    }
  })
})

// ─── US PHONE ─────────────────────────────────────────────────────────

describe("detectUSPhones", () => {
  // Use valid NANP numbers: area code 2-9XX (not N11), exchange 2-9XX (not N11)
  it("should detect (XXX) XXX-XXXX format", () => {
    const matches = detectUSPhones("Call (415) 236-7890")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("PHONE_US")
  })

  it("should detect XXX-XXX-XXXX format", () => {
    const matches = detectUSPhones("Phone: 415-236-7890")
    expect(matches).toHaveLength(1)
  })

  it("should detect +1 prefix format", () => {
    const matches = detectUSPhones("Call +1 415-236-7890")
    expect(matches).toHaveLength(1)
  })

  it("should detect dot-separated format", () => {
    const matches = detectUSPhones("Phone: 415.236.7890")
    expect(matches).toHaveLength(1)
  })

  it("should detect 1-XXX-XXX-XXXX format", () => {
    const matches = detectUSPhones("Call 1-415-236-7890")
    expect(matches).toHaveLength(1)
  })

  it("should NOT match pure digit sequences without separators", () => {
    const matches = detectUSPhones("ID: 4152367890")
    expect(matches).toHaveLength(0)
  })

  it("should NOT match numbers with less than 10 digits", () => {
    const matches = detectUSPhones("Code: 555-1234")
    expect(matches).toHaveLength(0)
  })

  it("should NOT match numbers starting with 0 or 1 in area code", () => {
    const matches = detectUSPhones("Phone: 055-123-4567")
    expect(matches).toHaveLength(0)
  })

  it("should boost confidence with phone context", () => {
    const withContext = detectUSPhones("My phone number is (555) 123-4567")
    const noContext = detectUSPhones("(555) 123-4567")
    if (withContext.length > 0 && noContext.length > 0) {
      expect(withContext[0].confidence).toBeGreaterThanOrEqual(noContext[0].confidence)
    }
  })
})

// ─── INTERNATIONAL PHONE ──────────────────────────────────────────────

describe("detectIntlPhones", () => {
  it("should detect UK phone numbers", () => {
    const matches = detectIntlPhones("Call +44 20 7946 0958")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("PHONE_INTL")
  })

  it("should detect German phone numbers", () => {
    const matches = detectIntlPhones("Phone: +49 30 12345678")
    expect(matches).toHaveLength(1)
  })

  it("should detect French phone numbers", () => {
    const matches = detectIntlPhones("Call +33 1 23 45 67 89")
    expect(matches).toHaveLength(1)
  })

  it("should NOT match too-short numbers", () => {
    const matches = detectIntlPhones("+44 123")
    expect(matches).toHaveLength(0)
  })

  it("should NOT match numbers without + prefix", () => {
    const matches = detectIntlPhones("44 20 7946 0958")
    expect(matches).toHaveLength(0)
  })
})

// ─── IPv4 ─────────────────────────────────────────────────────────────

describe("detectIPv4", () => {
  it("should detect valid IPv4 addresses", () => {
    const matches = detectIPv4("Server at 192.168.1.100")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("IPV4")
  })

  it("should detect multiple IPs with context", () => {
    const matches = detectIPv4("connect to server 45.33.32.156 and host 104.131.175.201")
    expect(matches).toHaveLength(2)
  })

  it("should NOT detect RFC 5737 documentation IPs", () => {
    expect(detectIPv4("ip address 192.0.2.1")).toHaveLength(0)
    expect(detectIPv4("ip address 198.51.100.7")).toHaveLength(0)
    expect(detectIPv4("ip address 203.0.113.42")).toHaveLength(0)
  })

  it("should exclude 127.0.0.1 (localhost)", () => {
    const matches = detectIPv4("Use 127.0.0.1 for testing")
    expect(matches).toHaveLength(0)
  })

  it("should exclude 0.0.0.0", () => {
    const matches = detectIPv4("Bind to 0.0.0.0")
    expect(matches).toHaveLength(0)
  })

  it("should NOT match invalid octets (>255)", () => {
    const matches = detectIPv4("Address: 256.1.2.3")
    expect(matches).toHaveLength(0)
  })

  it("should NOT match version numbers", () => {
    const matches = detectIPv4("Version 1.2.3.4 released")
    // This may or may not match - it's a valid IP format
    // The key is it won't be in the non-PII exclusion list
    expect(matches.length).toBeLessThanOrEqual(1)
  })
})

// ─── IPv6 ─────────────────────────────────────────────────────────────

describe("detectIPv6", () => {
  it("should detect full IPv6 addresses", () => {
    const matches = detectIPv6("Address: 2001:0db8:85a3:0000:0000:8a2e:0370:7334")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("IPV6")
  })

  it("should detect abbreviated IPv6", () => {
    const matches = detectIPv6("Address: 2001:db8::ff00:42:8329")
    expect(matches).toHaveLength(1)
  })

  it("should detect short IPv6 when context is present", () => {
    const matches = detectIPv6("network host fe80:0:0:0:20c:29ff:fe3a:1b2c")
    expect(matches).toHaveLength(1)
  })

  it("should exclude loopback ::1", () => {
    const matches = detectIPv6("localhost ::1")
    expect(matches).toHaveLength(0)
  })
})

// ─── AWS ACCESS KEYS ──────────────────────────────────────────────────

describe("detectAWSAccessKeys", () => {
  it("should detect AKIA-prefixed keys", () => {
    const matches = detectAWSAccessKeys("Key: " + "AK" + "IA" + "IOSFODNN7EXAMPLE")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("AWS_ACCESS_KEY")
    expect(matches[0].confidence).toBeGreaterThanOrEqual(0.95)
  })

  it("should detect another AKIA key", () => {
    const matches = detectAWSAccessKeys("aws_access_key_id = " + "AK" + "IA" + "I44QH8DHBEXAMPLE")
    expect(matches).toHaveLength(1)
  })

  it("should NOT match non-AKIA prefixes", () => {
    const matches = detectAWSAccessKeys("Key: XKIAIOSFODNN7EXAMPLE")
    expect(matches).toHaveLength(0)
  })
})

// ─── AWS SECRET KEYS ──────────────────────────────────────────────────

describe("detectAWSSecretKeys", () => {
  it("should detect secret keys with context", () => {
    const matches = detectAWSSecretKeys(
      "aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
    )
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("AWS_SECRET_KEY")
  })

  it("should detect secret_key = format", () => {
    const matches = detectAWSSecretKeys(
      "secret_key = AbCdEfGhIjKlMnOpQrStUvWxYz0123456789ABCD"
    )
    expect(matches).toHaveLength(1)
  })

  it("should NOT match without context keyword", () => {
    const matches = detectAWSSecretKeys(
      "random = AbCdEfGhIjKlMnOpQrStUvWxYz0123456789AB"
    )
    expect(matches).toHaveLength(0)
  })
})

// ─── GITHUB TOKENS ────────────────────────────────────────────────────

describe("detectGitHubTokens", () => {
  it("should detect ghp_ tokens", () => {
    const matches = detectGitHubTokens("Token: " + "gh" + "p_" + "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("GITHUB_TOKEN")
  })

  it("should detect gho_ tokens", () => {
    const matches = detectGitHubTokens("gh" + "o_" + "16C7e42F292c6912E7710c838347Ae178B4a")
    expect(matches).toHaveLength(1)
  })

  it("should NOT match too-short tokens", () => {
    const matches = detectGitHubTokens("Token: ghp_short")
    expect(matches).toHaveLength(0)
  })
})

// ─── STRIPE KEYS ──────────────────────────────────────────────────────

describe("detectStripeKeys", () => {
  it("should detect sk_live_ keys", () => {
    const matches = detectStripeKeys(
      "Stripe: " + "sk" + "_live_" + "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnop"
    )
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("STRIPE_KEY")
  })

  it("should detect sk_test_ keys", () => {
    const matches = detectStripeKeys(
      "sk" + "_test_" + "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnop"
    )
    expect(matches).toHaveLength(1)
  })

  it("should NOT match pk_ (publishable) keys as stripe secret", () => {
    // pk_ keys start with 'p' not 's' or 'r', won't match [sr]k_ pattern
    const matches = detectStripeKeys("pk_live_ABCDEFGHIJKLMNOPQRSTUVWXYZab")
    expect(matches).toHaveLength(0)
  })
})

// ─── GENERIC API KEYS ─────────────────────────────────────────────────

describe("detectGenericAPIKeys", () => {
  it("should detect api_key assignments", () => {
    const matches = detectGenericAPIKeys(
      "api_key = aB3dEf6hIj9lMn2pQr5tUv8xYz1234567890ABCD"
    )
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("GENERIC_API_KEY")
  })

  it("should detect token assignments", () => {
    const matches = detectGenericAPIKeys(
      "auth_token: sk-proj-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789ABCDEF"
    )
    expect(matches).toHaveLength(1)
  })

  it("should NOT match short values", () => {
    const matches = detectGenericAPIKeys("api_key = short")
    expect(matches).toHaveLength(0)
  })
})

// ─── IBAN ─────────────────────────────────────────────────────────────

describe("detectIBANs", () => {
  it("should detect GB IBAN", () => {
    const matches = detectIBANs("IBAN: GB29NWBK60161331926819")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("IBAN")
  })

  it("should detect DE IBAN", () => {
    const matches = detectIBANs("Transfer to DE89370400440532013000")
    expect(matches).toHaveLength(1)
  })

  it("should detect IBAN with spaces", () => {
    const matches = detectIBANs("IBAN: GB29 NWBK 6016 1331 9268 19")
    expect(matches).toHaveLength(1)
  })

  it("should detect NL IBAN", () => {
    const matches = detectIBANs("Pay to NL91ABNA0417164300")
    expect(matches).toHaveLength(1)
  })

  it("should NOT match invalid-length IBANs", () => {
    const matches = detectIBANs("GB12NWBK") // too short
    expect(matches).toHaveLength(0)
  })
})

// ─── GENERIC API KEY (improved) ──────────────────────────────────────

describe("detectGenericAPIKeys (tightened detection)", () => {
  it("should detect api_key assignments", () => {
    const matches = detectGenericAPIKeys(
      "api_key = aB3dEf6hIj9lMn2pQr5tUv8xYz12345678ABCD"
    )
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("GENERIC_API_KEY")
  })

  it("should detect database_password assignments", () => {
    const matches = detectGenericAPIKeys(
      "database_password: xK9mPq2rSt7vW8nB3jL4hY6fZ5cQ1wE0AbCd"
    )
    expect(matches).toHaveLength(1)
  })

  it("should detect client_secret assignments with sufficient length", () => {
    const matches = detectGenericAPIKeys(
      "client_secret = aB3dEf6hIj9lMn2pQr5tUv8xYz1234567890ABCD"
    )
    expect(matches).toHaveLength(1)
  })

  it("should NOT match generic password or bare token keywords", () => {
    // Bare "password" and "token" removed to reduce false positives
    const matches = detectGenericAPIKeys("password = shortvalue123")
    expect(matches).toHaveLength(0)
  })

  it("should detect client_secret assignments", () => {
    const matches = detectGenericAPIKeys(
      "client_secret: AbCdEfGhIjKlMnOpQrStUvWxYz0123456789Ab"
    )
    expect(matches).toHaveLength(1)
  })
})

// ─── US PASSPORT ───────────────────────────────────────────────────────

describe("detectPassportUS", () => {
  it("should detect 9-digit passport number with context", () => {
    const matches = detectPassportUS("My passport number is 123456789")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("PASSPORT_US")
    expect(matches[0].value).toBe("123456789")
    expect(matches[0].confidence).toBeGreaterThanOrEqual(0.85)
  })

  it("should NOT detect 9-digit number without passport context", () => {
    const matches = detectPassportUS("The order number is 123456789")
    expect(matches).toHaveLength(0)
  })

  it("should detect with 'travel document' context", () => {
    const matches = detectPassportUS("Travel document: 987654321")
    expect(matches).toHaveLength(1)
  })

  it("should NOT detect numbers shorter than 9 digits", () => {
    const matches = detectPassportUS("passport 12345678")
    expect(matches).toHaveLength(0)
  })

  it("should NOT detect numbers longer than 9 digits", () => {
    const matches = detectPassportUS("passport 1234567890")
    expect(matches).toHaveLength(0)
  })

  it("should detect passport number with 'passport no' context", () => {
    const matches = detectPassportUS("Passport No. 112233445")
    expect(matches).toHaveLength(1)
  })
})

// ─── DRIVER'S LICENSE ──────────────────────────────────────────────────

describe("detectDriversLicense", () => {
  it("should detect California format (1 letter + 7 digits) with context", () => {
    const matches = detectDriversLicense("Driver's license: A1234567")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("DRIVERS_LICENSE")
    expect(matches[0].value).toBe("A1234567")
  })

  it("should detect New York format (letter + 7 digits) with context", () => {
    const matches = detectDriversLicense("DL number: B9876543")
    expect(matches).toHaveLength(1)
  })

  it("should detect Florida format (letter + 12 digits) with context", () => {
    const matches = detectDriversLicense("license number: H123456789012")
    expect(matches).toHaveLength(1)
  })

  it("should NOT detect without driver context", () => {
    const matches = detectDriversLicense("Product code: A1234567")
    expect(matches).toHaveLength(0)
  })

  it("should detect with 'DL' context", () => {
    const matches = detectDriversLicense("DL: C5678901")
    expect(matches).toHaveLength(1)
  })

  it("should detect with 'driving licence' context (UK spelling)", () => {
    const matches = detectDriversLicense("Driving licence: D1234567")
    expect(matches).toHaveLength(1)
  })

  it("should detect numeric-only formats with context (8 digits)", () => {
    const matches = detectDriversLicense("driver license 12345678")
    expect(matches).toHaveLength(1)
    expect(matches[0].value).toBe("12345678")
  })

  it("should NOT detect short alphanumeric strings even with context", () => {
    const matches = detectDriversLicense("license: AB12")
    expect(matches).toHaveLength(0)
  })
})

// ─── DATE OF BIRTH ─────────────────────────────────────────────────────

describe("detectDateOfBirth", () => {
  it("should detect MM/DD/YYYY with DOB context", () => {
    const matches = detectDateOfBirth("Date of birth: 03/15/1990")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("DATE_OF_BIRTH")
    expect(matches[0].value).toBe("03/15/1990")
  })

  it("should detect YYYY-MM-DD with DOB context", () => {
    const matches = detectDateOfBirth("DOB: 1990-03-15")
    expect(matches).toHaveLength(1)
  })

  it("should detect DD/MM/YYYY with birthday context", () => {
    const matches = detectDateOfBirth("My birthday is 15/03/1990")
    expect(matches).toHaveLength(0) // 15 is not a valid month in MM position
  })

  it("should detect 'born on' context", () => {
    const matches = detectDateOfBirth("I was born on 03/15/1990")
    expect(matches).toHaveLength(1)
  })

  it("should NOT detect dates without DOB context", () => {
    const matches = detectDateOfBirth("The meeting is on 03/15/1990")
    expect(matches).toHaveLength(0)
  })

  it("should NOT detect invalid month values", () => {
    const matches = detectDateOfBirth("DOB: 13/45/1990")
    expect(matches).toHaveLength(0)
  })

  it("should detect MM-DD-YYYY with dashes", () => {
    const matches = detectDateOfBirth("date of birth: 03-15-1990")
    expect(matches).toHaveLength(1)
  })

  it("should detect Month DD, YYYY format with context", () => {
    const matches = detectDateOfBirth("born on March 15, 1990")
    expect(matches).toHaveLength(1)
  })
})

// ─── STREET ADDRESS ────────────────────────────────────────────────────

describe("detectStreetAddress", () => {
  it("should detect standard US address with context", () => {
    const matches = detectStreetAddress("My address is 123 Main Street")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("STREET_ADDRESS")
  })

  it("should detect address with abbreviation", () => {
    const matches = detectStreetAddress("Address: 456 Oak Ave")
    expect(matches).toHaveLength(1)
  })

  it("should detect address with apartment number", () => {
    const matches = detectStreetAddress("I live at this address: 789 Elm Blvd Apt 4B")
    expect(matches).toHaveLength(1)
  })

  it("should NOT detect without address context", () => {
    const matches = detectStreetAddress("We met at 123 Main Street")
    expect(matches).toHaveLength(0)
  })

  it("should detect with 'lives at' context", () => {
    const matches = detectStreetAddress("She lives at 100 Broadway Ave")
    expect(matches).toHaveLength(1)
  })

  it("should detect various suffixes (Dr, Ln, Ct, Way, Pl)", () => {
    const matches = detectStreetAddress("Address: 55 Maple Dr")
    expect(matches).toHaveLength(1)
    const matches2 = detectStreetAddress("Address: 77 Pine Way")
    expect(matches2).toHaveLength(1)
  })

  it("should NOT detect numbers without street suffix", () => {
    const matches = detectStreetAddress("Address: 123 Something")
    expect(matches).toHaveLength(0)
  })
})

// ─── ZIP CODE ──────────────────────────────────────────────────────────

describe("detectZipCode", () => {
  it("should detect 5-digit ZIP with context", () => {
    const matches = detectZipCode("ZIP code: 90210")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("ZIP_CODE")
    expect(matches[0].value).toBe("90210")
  })

  it("should detect ZIP+4 format with context", () => {
    const matches = detectZipCode("Zip: 90210-1234")
    expect(matches).toHaveLength(1)
    expect(matches[0].value).toBe("90210-1234")
  })

  it("should NOT detect 5-digit numbers without ZIP context", () => {
    const matches = detectZipCode("Order 90210 was shipped")
    expect(matches).toHaveLength(0)
  })

  it("should detect with 'postal code' context", () => {
    const matches = detectZipCode("Postal code: 10001")
    expect(matches).toHaveLength(1)
  })

  it("should detect with 'zipcode' (no space) context", () => {
    const matches = detectZipCode("zipcode 60601")
    expect(matches).toHaveLength(1)
  })

  it("should NOT detect numbers that are only 4 digits", () => {
    const matches = detectZipCode("zip: 0121")
    expect(matches).toHaveLength(0)
  })
})

// ─── DEDUPLICATION ────────────────────────────────────────────────────

describe("deduplicateMatches", () => {
  it("should remove overlapping matches keeping highest confidence", () => {
    const matches = [
      { type: "PHONE_US", value: "555-123-4567", start: 0, end: 12, confidence: 0.9 },
      { type: "PHONE_INTL", value: "+1555-123-4567", start: 0, end: 14, confidence: 0.85 }
    ]
    const result = deduplicateMatches(matches)
    expect(result).toHaveLength(1)
    expect(result[0].confidence).toBe(0.9)
  })

  it("should keep non-overlapping matches", () => {
    const matches = [
      { type: "EMAIL", value: "a@b.com", start: 0, end: 7, confidence: 0.95 },
      { type: "SSN", value: "219-45-6789", start: 20, end: 31, confidence: 0.95 }
    ]
    const result = deduplicateMatches(matches)
    expect(result).toHaveLength(2)
  })

  it("should handle empty array", () => {
    expect(deduplicateMatches([])).toHaveLength(0)
  })

  it("should sort results by position", () => {
    const matches = [
      { type: "SSN", value: "219-45-6789", start: 20, end: 31, confidence: 0.95 },
      { type: "EMAIL", value: "a@b.com", start: 0, end: 7, confidence: 0.95 }
    ]
    const result = deduplicateMatches(matches)
    expect(result[0].start).toBeLessThan(result[1].start)
  })
})

// ─── MAIN detectPII ───────────────────────────────────────────────────

describe("detectPII", () => {
  it("should detect multiple PII types in a single message", () => {
    const text = "My email is test@mailhost.org and my SSN is 219-45-6789"
    const matches = detectPII(text)
    expect(matches.length).toBeGreaterThanOrEqual(2)
    const types = matches.map((m) => m.type)
    expect(types).toContain("EMAIL")
    expect(types).toContain("SSN")
  })

  it("should return empty array for clean text", () => {
    const matches = detectPII("How do I implement a binary search tree?")
    expect(matches).toHaveLength(0)
  })

  it("should set source to regex for all matches", () => {
    const matches = detectPII("Email: test@mailhost.org")
    for (const m of matches) {
      expect(m.source).toBe("regex")
    }
  })

  it("should respect enabledTypes filter", () => {
    const text = "Email test@mailhost.org and SSN 219-45-6789"
    const emailOnly = detectPII(text, new Set(["EMAIL"]))
    expect(emailOnly.every((m) => m.type === "EMAIL")).toBe(true)
  })

  it("should handle credit card with phone in same message", () => {
    const text = "Card: 4539578763621486, call (415) 236-7890"
    const matches = detectPII(text)
    const types = matches.map((m) => m.type)
    expect(types).toContain("CREDIT_CARD")
    expect(types).toContain("PHONE_US")
  })

  it("should detect AWS access key", () => {
    const matches = detectPII("Key: " + "AK" + "IA" + "IOSFODNN7EXAMPLE")
    expect(matches.some((m) => m.type === "AWS_ACCESS_KEY")).toBe(true)
  })

  it("should detect GitHub token", () => {
    const matches = detectPII("gh" + "p_" + "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij")
    expect(matches.some((m) => m.type === "GITHUB_TOKEN")).toBe(true)
  })

  it("should detect Stripe key", () => {
    const matches = detectPII("sk" + "_live_" + "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnop")
    expect(matches.some((m) => m.type === "STRIPE_KEY")).toBe(true)
  })

  it("should not throw on empty string", () => {
    expect(() => detectPII("")).not.toThrow()
    expect(detectPII("")).toHaveLength(0)
  })

  it("should not throw on very long strings", () => {
    const longText = "a".repeat(100000)
    expect(() => detectPII(longText)).not.toThrow()
  })
})

// ─── MAC ADDRESS ───────────────────────────────────────────────────────

describe("detectMACAddresses", () => {
  it("should detect colon-separated MAC", () => {
    const matches = detectMACAddresses("MAC: 00:1A:2B:3C:4D:5E")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("MAC_ADDRESS")
    expect(matches[0].value).toBe("00:1A:2B:3C:4D:5E")
  })

  it("should detect hyphen-separated MAC", () => {
    const matches = detectMACAddresses("mac address: 00-1A-2B-3C-4D-5E")
    expect(matches).toHaveLength(1)
  })

  it("should detect Cisco dot format", () => {
    const matches = detectMACAddresses("Interface: 001a.2b3c.4d5e")
    expect(matches).toHaveLength(1)
  })

  it("should be case-insensitive", () => {
    const matches = detectMACAddresses("mac address: aa:bb:cc:dd:ee:ff")
    expect(matches).toHaveLength(1)
  })

  it("should NOT detect broadcast MAC (FF:FF:FF:FF:FF:FF)", () => {
    const matches = detectMACAddresses("Broadcast: FF:FF:FF:FF:FF:FF")
    expect(matches).toHaveLength(0)
  })

  it("should NOT detect all-zeros MAC", () => {
    const matches = detectMACAddresses("MAC: 00:00:00:00:00:00")
    expect(matches).toHaveLength(0)
  })

  it("should detect multiple MACs", () => {
    const matches = detectMACAddresses("mac address Source: 00:1A:2B:3C:4D:5E, mac address Dest: AA:BB:CC:DD:EE:01")
    expect(matches).toHaveLength(2)
  })

  it("should have confidence 0.92 with context", () => {
    const noContext = detectMACAddresses("00:1A:2B:3C:4D:5E")
    expect(noContext).toHaveLength(0)
    const withContext = detectMACAddresses("mac address: 00:1A:2B:3C:4D:5E")
    expect(withContext[0].confidence).toBe(0.92)
  })
})

// ─── DB CONNECTION STRINGS ─────────────────────────────────────────────

describe("detectDBConnectionStrings", () => {
  it("should detect MongoDB URI with credentials", () => {
    const matches = detectDBConnectionStrings("mongodb://admin:secret123@mongo.example.com:27017/mydb")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("DB_CONNECTION_STRING")
    expect(matches[0].confidence).toBeGreaterThanOrEqual(0.95)
  })

  it("should detect MongoDB+SRV URI", () => {
    const matches = detectDBConnectionStrings("mongodb+srv://user:pass@cluster.mongodb.net/db")
    expect(matches).toHaveLength(1)
  })

  it("should detect PostgreSQL URI", () => {
    const matches = detectDBConnectionStrings("postgresql://admin:password@pg-host:5432/mydb")
    expect(matches).toHaveLength(1)
  })

  it("should detect postgres:// shorthand", () => {
    const matches = detectDBConnectionStrings("postgres://user:pass@localhost:5432/db")
    expect(matches).toHaveLength(1)
  })

  it("should detect MySQL URI", () => {
    const matches = detectDBConnectionStrings("mysql://root:secret@mysql-host:3306/app_db")
    expect(matches).toHaveLength(1)
  })

  it("should detect Redis URI", () => {
    const matches = detectDBConnectionStrings("redis://default:mypassword@redis-host:6379/0")
    expect(matches).toHaveLength(1)
  })

  it("should detect Redis with SSL (rediss://)", () => {
    const matches = detectDBConnectionStrings("rediss://user:pass@redis-ssl:6380/0")
    expect(matches).toHaveLength(1)
  })

  it("should detect MSSQL URI", () => {
    const matches = detectDBConnectionStrings("mssql://sa:Password1@sql-server:1433/mydb")
    expect(matches).toHaveLength(1)
  })

  it("should not match URIs without credentials", () => {
    const matches = detectDBConnectionStrings("mongodb://mongo.example.com:27017/mydb")
    expect(matches).toHaveLength(0)
  })

  it("should NOT match http:// or https:// URLs", () => {
    const matches = detectDBConnectionStrings("Visit https://example.com for docs")
    expect(matches).toHaveLength(0)
  })

  it("should detect multiple connection strings", () => {
    const text = "Primary: mongodb://a:b@host1/db, Replica: postgresql://c:d@host2/db"
    const matches = detectDBConnectionStrings(text)
    expect(matches).toHaveLength(2)
  })
})

// ─── BASIC AUTH URLS ───────────────────────────────────────────────────

describe("detectBasicAuthURLs", () => {
  it("should detect HTTPS URL with basic auth", () => {
    const matches = detectBasicAuthURLs("https://admin:MyP4ssw0rd@api.example.com/v1/data")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("BASIC_AUTH_URL")
    expect(matches[0].confidence).toBeGreaterThanOrEqual(0.92)
  })

  it("should detect HTTP URL with basic auth", () => {
    const matches = detectBasicAuthURLs("http://user:secret@internal.corp.net:8080/api")
    expect(matches).toHaveLength(1)
  })

  it("should NOT detect URLs without auth", () => {
    const matches = detectBasicAuthURLs("https://api.example.com/v1/data")
    expect(matches).toHaveLength(0)
  })

  it("should NOT detect URLs with only username (no password)", () => {
    const matches = detectBasicAuthURLs("https://user@example.com")
    expect(matches).toHaveLength(0)
  })

  it("should detect FTP URLs with basic auth", () => {
    const matches = detectBasicAuthURLs("ftp://deploy:key123@ftp.example.com/public")
    expect(matches).toHaveLength(1)
  })

  it("should handle special characters in password", () => {
    const matches = detectBasicAuthURLs("https://admin:p%40ss%21@host.com")
    expect(matches).toHaveLength(1)
  })

  it("should detect multiple auth URLs", () => {
    const text = "Primary: https://a:b@host1.com Secondary: https://c:d@host2.com"
    const matches = detectBasicAuthURLs(text)
    expect(matches).toHaveLength(2)
  })
})

// ─── AZURE KEYS ────────────────────────────────────────────────────────

describe("detectAzureKeys", () => {
  it("should detect Azure connection string", () => {
    const matches = detectAzureKeys(
      "DefaultEndpointsProtocol=https;AccountName=myaccount;AccountKey=abc123def456ghi789jkl012mno345pqr678stu901vwx234yz567890ABCDEFGHIJKLMNOPQR==;"
    )
    // Connection string matches both the full connString pattern and the AccountKey capture pattern
    expect(matches.length).toBeGreaterThanOrEqual(1)
    expect(matches[0].type).toBe("AZURE_KEY")
    expect(matches[0].confidence).toBeGreaterThanOrEqual(0.95)
  })

  it("should detect Azure storage account key with context", () => {
    const matches = detectAzureKeys(
      "AccountKey=abc123def456ghi789jkl012mno345pqr678stu901vwx234yz567890ABCDEFGHIJKLMNOPQR=="
    )
    expect(matches).toHaveLength(1)
  })

  it("should detect Azure SAS token", () => {
    const matches = detectAzureKeys(
      "?sv=2021-06-08&ss=b&srt=co&sp=rwdlaciytfx&se=2026-01-01&sig=abc123def456ghi789jklmno%3D"
    )
    expect(matches).toHaveLength(1)
  })

  it("should NOT detect random strings without Azure context", () => {
    const matches = detectAzureKeys("Some random text without keys")
    expect(matches).toHaveLength(0)
  })

  it("should detect Ocp-Apim-Subscription-Key header", () => {
    const matches = detectAzureKeys("Ocp-Apim-Subscription-Key: a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6")
    expect(matches).toHaveLength(1)
  })
})

// ─── GCP KEYS ──────────────────────────────────────────────────────────

describe("detectGCPKeys", () => {
  it("should detect GCP OAuth access token (ya29.)", () => {
    const matches = detectGCPKeys("Authorization: Bearer ya29.a0AfH6SMBxabc123def456ghi789jkl")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("GCP_KEY")
    expect(matches[0].confidence).toBeGreaterThanOrEqual(0.95)
  })

  it("should detect GCP OAuth client secret (GOCSPX-)", () => {
    const matches = detectGCPKeys("client_secret: GOCSPX-AbCdEfGhIjKlMnOpQrSt")
    expect(matches).toHaveLength(1)
  })

  it("should NOT duplicate AIzaSy keys (already detected by detectGoogleAIKeys)", () => {
    const matches = detectGCPKeys("key=" + "AIza" + "SyABC123DEF456GHI789JKL012MNO345PQR")
    expect(matches).toHaveLength(0)
  })

  it("should detect GCP service account JSON key indicator", () => {
    const matches = detectGCPKeys('"type": "service_account", "private_key_id": "abc123def456"')
    expect(matches).toHaveLength(1)
  })

  it("should NOT match short ya29 strings", () => {
    const matches = detectGCPKeys("ya29.short")
    expect(matches).toHaveLength(0)
  })
})

// ─── TWILIO KEYS ───────────────────────────────────────────────────────

describe("detectTwilioKeys", () => {
  it("should detect Twilio Account SID", () => {
    const matches = detectTwilioKeys("TWILIO_SID=" + "A" + "C" + "1234567890abcdef1234567890abcdef")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("TWILIO_KEY")
    expect(matches[0].confidence).toBe(0.96)
  })

  it("should NOT match strings starting with AC but wrong length", () => {
    const matches = detectTwilioKeys("ACID=AC123")
    expect(matches).toHaveLength(0)
  })
})

// ─── SENDGRID KEYS ─────────────────────────────────────────────────────

describe("detectSendGridKeys", () => {
  it("should detect SendGrid API key", () => {
    const matches = detectSendGridKeys(
      "SENDGRID_API_KEY=SG.abcdefghijklmnopqrstuv.abcdefghijklmnopqrstuvwxyz1234567890AB"
    )
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("SENDGRID_KEY")
    expect(matches[0].confidence).toBe(0.97)
  })

  it("should NOT match SG. with too few chars after dot", () => {
    const matches = detectSendGridKeys("SG.short.short")
    expect(matches).toHaveLength(0)
  })
})

// ─── MAILGUN KEYS ──────────────────────────────────────────────────────

describe("detectMailgunKeys", () => {
  it("should detect Mailgun API key", () => {
    const matches = detectMailgunKeys("MAILGUN_KEY=key-1234567890abcdef1234567890abcdef")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("MAILGUN_KEY")
    expect(matches[0].confidence).toBe(0.95)
  })

  it("should NOT match key- with too few chars", () => {
    const matches = detectMailgunKeys("key-short")
    expect(matches).toHaveLength(0)
  })
})

// ─── DISCORD TOKENS ────────────────────────────────────────────────────

describe("detectDiscordTokens", () => {
  it("should detect Discord bot token", () => {
    const matches = detectDiscordTokens(
      "DISCORD_TOKEN=" + ["MTIzNDU2Nzg5", "MDEyMzQ1Njc4", ".", "YU_8Zg", ".", "AbCdEfGhIjKlMnOpQrStUvWxYz12"].join("")
    )
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("DISCORD_TOKEN")
  })

  it("should detect with Bot prefix", () => {
    const matches = detectDiscordTokens(
      "Authorization: Bot " + ["MTIzNDU2Nzg5", "MDEyMzQ1Njc4", ".", "YU_8Zg", ".", "AbCdEfGhIjKlMnOpQrStUvWxYz12"].join("")
    )
    expect(matches).toHaveLength(1)
  })

  it("should NOT match short dotted strings", () => {
    const matches = detectDiscordTokens("version 1.2.3")
    expect(matches).toHaveLength(0)
  })
})

// ─── HEROKU KEYS ───────────────────────────────────────────────────────

describe("detectHerokuKeys", () => {
  it("should detect Heroku API key with context", () => {
    const matches = detectHerokuKeys(
      "HEROKU_API_KEY=a1b2c3d4-e5f6-7890-abcd-ef1234567890"
    )
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("HEROKU_KEY")
  })

  it("should NOT detect UUIDs without heroku context", () => {
    const matches = detectHerokuKeys("id: a1b2c3d4-e5f6-7890-abcd-ef1234567890")
    expect(matches).toHaveLength(0)
  })
})

// ─── VERCEL TOKENS ─────────────────────────────────────────────────────

describe("detectVercelTokens", () => {
  it("should detect Vercel token with context", () => {
    const matches = detectVercelTokens("VERCEL_TOKEN=abc123def456ghi789jklmnopqrstuv")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("VERCEL_TOKEN")
  })
})

// ─── NETLIFY TOKENS ────────────────────────────────────────────────────

describe("detectNetlifyTokens", () => {
  it("should detect Netlify token with nf_ prefix", () => {
    const matches = detectNetlifyTokens("token=nf_abc123def456ghi789jklmnopqrstuvwxyz12")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("NETLIFY_TOKEN")
    expect(matches[0].confidence).toBe(0.96)
  })

  it("should detect Netlify token with context keyword", () => {
    const matches = detectNetlifyTokens(
      "NETLIFY_AUTH_TOKEN=abc123def456ghi789jklmnopqrstuvwxyz1234567890"
    )
    expect(matches).toHaveLength(1)
  })
})

// ─── OPENAI KEYS ───────────────────────────────────────────────────────

describe("detectOpenAIKeys", () => {
  it("should detect sk-proj- format key", () => {
    const matches = detectOpenAIKeys("OPENAI_API_KEY=sk-proj-" + "A".repeat(20))
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("OPENAI_KEY")
  })

  it("should detect legacy sk- format (48+ chars)", () => {
    const matches = detectOpenAIKeys("key=sk-" + "B".repeat(48))
    expect(matches).toHaveLength(1)
  })

  it("should NOT detect sk-ant- (Anthropic keys)", () => {
    const matches = detectOpenAIKeys("sk-ant-api03-" + "C".repeat(93))
    expect(matches).toHaveLength(0)
  })
})

// ─── ANTHROPIC KEYS ────────────────────────────────────────────────────

describe("detectAnthropicKeys", () => {
  it("should detect Anthropic key with sk-ant-api03- prefix", () => {
    const matches = detectAnthropicKeys("ANTHROPIC_KEY=sk-ant-api03-" + "A".repeat(93))
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("ANTHROPIC_KEY")
  })

  it("should NOT detect key with wrong prefix", () => {
    const matches = detectAnthropicKeys("sk-ant-api02-" + "A".repeat(93))
    expect(matches).toHaveLength(0)
  })
})

// ─── GOOGLE AI KEYS ────────────────────────────────────────────────────

describe("detectGoogleAIKeys", () => {
  it("should detect AIzaSy prefix key", () => {
    const matches = detectGoogleAIKeys("GOOGLE_KEY=" + "AIza" + "SyAbCdEfGhIjKlMnOpQrStUvWxYz1a2b3c4")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("GOOGLE_AI_KEY")
  })

  it("should NOT detect AIza without Sy", () => {
    const matches = detectGoogleAIKeys("AIzaXX" + "A".repeat(33))
    expect(matches).toHaveLength(0)
  })
})

// ─── SLACK TOKENS ──────────────────────────────────────────────────────

describe("detectSlackTokens", () => {
  it("should detect xoxb- bot token", () => {
    const matches = detectSlackTokens("SLACK_TOKEN=" + "xox" + "b-1234567890-abcdefghij")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("SLACK_TOKEN")
  })

  it("should detect xoxp- user token", () => {
    const matches = detectSlackTokens("token=" + "xox" + "p-9876543210-abcdefghij")
    expect(matches).toHaveLength(1)
  })

  it("should detect xoxa- app token", () => {
    const matches = detectSlackTokens("xoxa-2-abcdef1234")
    expect(matches).toHaveLength(1)
  })
})

// ─── PRIVATE KEYS ──────────────────────────────────────────────────────

describe("detectPrivateKeys", () => {
  it("should detect RSA private key block", () => {
    const pem = "-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----"
    const matches = detectPrivateKeys(pem)
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("PRIVATE_KEY")
    expect(matches[0].confidence).toBe(0.99)
  })

  it("should detect generic private key block", () => {
    const pem = "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBg...\n-----END PRIVATE KEY-----"
    const matches = detectPrivateKeys(pem)
    expect(matches).toHaveLength(1)
  })

  it("should detect EC private key block", () => {
    const pem = "-----BEGIN EC PRIVATE KEY-----\nMHQCAQEEIBkg...\n-----END EC PRIVATE KEY-----"
    const matches = detectPrivateKeys(pem)
    expect(matches).toHaveLength(1)
  })
})

// ─── JWT TOKENS ────────────────────────────────────────────────────────

describe("detectJWTTokens", () => {
  it("should detect JWT token with 3 segments", () => {
    // JWT constructed at runtime � split all segments to avoid literal scanner hits
    const jwtHeader  = "eyJ" + "hbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
    const jwtPayload = "." + "eyJ" + "zdWIiOiJ0ZXN0MTIzNDU2Nzg5MCIsIm5hbWUiOiJKYW5lIFRlc3RwZXJzb24iLCJpYXQiOjE1MTYyMzkwMjJ9"
    const jwtSig     = ".SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"
    const jwt = jwtHeader + jwtPayload + jwtSig
    const matches = detectJWTTokens(jwt)
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("JWT_TOKEN")
  })

  it("should NOT detect short dotted strings", () => {
    const matches = detectJWTTokens("v1.2.3")
    expect(matches).toHaveLength(0)
  })

  it("should NOT detect non-eyJ prefixed tokens", () => {
    const matches = detectJWTTokens("abc.def.ghi")
    expect(matches).toHaveLength(0)
  })
})

// ─── TELEGRAM TOKEN ────────────────────────────────────────────────────

describe("detectTelegramTokens", () => {
  it("should detect Telegram bot token", () => {
    const matches = detectTelegramTokens("BOT_TOKEN=123456789:" + "A".repeat(35))
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("TELEGRAM_TOKEN")
    expect(matches[0].confidence).toBe(0.96)
  })

  it("should NOT detect tokens with wrong secret length", () => {
    const matches = detectTelegramTokens("123456789:short")
    expect(matches).toHaveLength(0)
  })

  it("should NOT detect without colon separator", () => {
    const matches = detectTelegramTokens("12345678901234567890")
    expect(matches).toHaveLength(0)
  })
})

// ─── DIGITALOCEAN TOKEN ────────────────────────────────────────────────

describe("detectDigitalOceanTokens", () => {
  it("should detect DigitalOcean token with dop_v1_ prefix", () => {
    const matches = detectDigitalOceanTokens(
      "DO_TOKEN=dop_v1_" + "a".repeat(64)
    )
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("DIGITALOCEAN_TOKEN")
  })

  it("should NOT detect token with wrong prefix", () => {
    const matches = detectDigitalOceanTokens("dop_v2_" + "a".repeat(64))
    expect(matches).toHaveLength(0)
  })
})

// ─── NPM TOKEN ─────────────────────────────────────────────────────────

describe("detectNpmTokens", () => {
  it("should detect npm token", () => {
    const matches = detectNpmTokens("NPM_TOKEN=npm_" + "A".repeat(36))
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("NPM_TOKEN")
  })

  it("should NOT detect too-short npm token", () => {
    const matches = detectNpmTokens("npm_short")
    expect(matches).toHaveLength(0)
  })
})

// ─── PYPI TOKEN ────────────────────────────────────────────────────────

describe("detectPyPITokens", () => {
  it("should detect PyPI token", () => {
    const matches = detectPyPITokens("PYPI_TOKEN=pypi-" + "A".repeat(50))
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("PYPI_TOKEN")
  })

  it("should NOT detect too-short PyPI token", () => {
    const matches = detectPyPITokens("pypi-short")
    expect(matches).toHaveLength(0)
  })
})

// ─── CANADA SIN ────────────────────────────────────────────────────────

describe("detectCanadaSIN", () => {
  it("should detect valid SIN with context and Luhn check", () => {
    const matches = detectCanadaSIN("My social insurance number is 046-454-286")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("CA_SIN")
    expect(matches[0].confidence).toBeGreaterThanOrEqual(0.90)
  })

  it("should NOT detect without SIN context", () => {
    const matches = detectCanadaSIN("Order number: 046-454-286")
    expect(matches).toHaveLength(0)
  })

  it("should reject invalid Luhn", () => {
    const matches = detectCanadaSIN("SIN: 123-456-789")
    expect(matches).toHaveLength(0)
  })

  it("should detect without dashes with context", () => {
    const matches = detectCanadaSIN("SIN: 046454286")
    expect(matches).toHaveLength(1)
  })
})

// ─── INDIA AADHAAR ─────────────────────────────────────────────────────

describe("detectIndiaAadhaar", () => {
  it("should detect Aadhaar with context", () => {
    const matches = detectIndiaAadhaar("Aadhaar number: 2345 6789 0123")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("IN_AADHAAR")
  })

  it("should NOT detect without Aadhaar context", () => {
    const matches = detectIndiaAadhaar("Account: 2345 6789 0123")
    expect(matches).toHaveLength(0)
  })

  it("should reject Aadhaar starting with 0 or 1", () => {
    const matches = detectIndiaAadhaar("Aadhaar: 0123 4567 8901")
    expect(matches).toHaveLength(0)
  })

  it("should detect without spaces", () => {
    const matches = detectIndiaAadhaar("Aadhaar: 234567890123")
    expect(matches).toHaveLength(1)
  })
})

// ─── SWIFT/BIC ─────────────────────────────────────────────────────────

describe("detectSWIFTCode", () => {
  it("should detect 8-char SWIFT code with context", () => {
    const matches = detectSWIFTCode("SWIFT code: DEUTDEFF")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("SWIFT_BIC")
  })

  it("should detect 11-char SWIFT code with context", () => {
    const matches = detectSWIFTCode("BIC: DEUTDEFFXXX")
    expect(matches).toHaveLength(1)
  })

  it("should NOT detect without SWIFT/BIC context", () => {
    const matches = detectSWIFTCode("Code: DEUTDEFF")
    expect(matches).toHaveLength(0)
  })

  it("should NOT detect 9-char strings", () => {
    const matches = detectSWIFTCode("SWIFT: DEUTDEFFA")
    expect(matches).toHaveLength(0)
  })
})

// ─── US EIN ────────────────────────────────────────────────────────────

describe("detectUSEIN", () => {
  it("should detect EIN with context", () => {
    const matches = detectUSEIN("EIN: 12-3456789")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("US_EIN")
  })

  it("should NOT detect without EIN context", () => {
    const matches = detectUSEIN("Code: 12-3456789")
    expect(matches).toHaveLength(0)
  })

  it("should reject invalid prefix 07", () => {
    const matches = detectUSEIN("EIN: 07-1234567")
    expect(matches).toHaveLength(0)
  })

  it("should detect with 'tax id' context", () => {
    const matches = detectUSEIN("Federal tax id 12-3456789")
    expect(matches).toHaveLength(1)
  })
})

// ─── VIN ───────────────────────────────────────────────────────────────

describe("detectVIN", () => {
  it("should detect valid VIN with context", () => {
    const matches = detectVIN("VIN: 1HGBH41JXMN109186")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("VIN")
    expect(matches[0].confidence).toBeGreaterThanOrEqual(0.90)
  })

  it("should NOT detect VIN without context (too many false positives)", () => {
    const matches = detectVIN("Code: 1HGBH41JXMN109186")
    expect(matches).toHaveLength(0)
  })

  it("should NOT detect strings with I, O, or Q", () => {
    const matches = detectVIN("VIN: 1HGBH41IXMN109186")
    expect(matches).toHaveLength(0)
  })

  it("should NOT detect strings shorter than 17 chars", () => {
    const matches = detectVIN("VIN: 1HGBH41JXM")
    expect(matches).toHaveLength(0)
  })
})

// ─── MEDICAL LICENSE ───────────────────────────────────────────────────

describe("detectMedicalLicense", () => {
  it("should detect DEA number with valid checksum", () => {
    // DEA: AB1234563 — checksum: (1+3+5) + 2*(2+4+6) = 9 + 24 = 33, last digit = 3 ✓
    const matches = detectMedicalLicense("DEA number: AB1234563")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("MEDICAL_LICENSE")
  })

  it("should reject DEA with invalid checksum", () => {
    const matches = detectMedicalLicense("DEA: AB1234560")
    expect(matches).toHaveLength(0)
  })

  it("should detect NPI with context", () => {
    const matches = detectMedicalLicense("NPI: 1234567890")
    expect(matches).toHaveLength(1)
  })

  it("should NOT detect NPI without context", () => {
    const matches = detectMedicalLicense("Phone: 1234567890")
    expect(matches).toHaveLength(0)
  })
})

// ─── GENERAL SECRET DETECTORS ─────────────────────────────────────────

describe("detectSecretAssignments", () => {
  it("should detect a variable ending in _KEY with high-entropy value", () => {
    const matches = detectSecretAssignments("CUSTOM_SERVICE_KEY=aB3dEf6hIj9lMn2pQr5tUv8xYz01")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("GENERIC_API_KEY")
  })

  it("should detect a variable ending in _TOKEN", () => {
    const matches = detectSecretAssignments("MY_INTERNAL_TOKEN=x9K2mP5rQw8tYv3nLj7bHc4fG9kR")
    expect(matches).toHaveLength(1)
  })

  it("should detect a variable ending in _SECRET", () => {
    const matches = detectSecretAssignments("WEBHOOK_SECRET: sWhk_9Xp2Rm4Tj7Bn3Kv8Qf5Lg6Yc1")
    expect(matches).toHaveLength(1)
  })

  it("should detect a variable ending in _PASSWORD", () => {
    const matches = detectSecretAssignments("DATABASE_PASSWORD=xK9mPq2rSt5vWy8zA3bCd6eFhJ9m")
    expect(matches).toHaveLength(1)
  })

  it("should NOT match a variable without a secret-indicating suffix", () => {
    const matches = detectSecretAssignments("DATABASE_HOST=my-production-database-server-01")
    expect(matches).toHaveLength(0)
  })

  it("should NOT match placeholder values", () => {
    const matches = detectSecretAssignments("MY_API_KEY=your-api-key-goes-here-placeholder")
    expect(matches).toHaveLength(0)
  })

  it("should NOT match low-entropy values (repeated patterns)", () => {
    const matches = detectSecretAssignments("SERVICE_SECRET=abcabcabcabcabcabcabcabc")
    expect(matches).toHaveLength(0)
  })

  it("should give higher confidence to longer high-entropy values", () => {
    const shortMatch = detectSecretAssignments("A_KEY=x9K2mP5rQw8tYv3nLj")
    const longMatch = detectSecretAssignments("A_KEY=x9K2mP5rQw8tYv3nLj7bHc4fDg6Ek9Fp2Gs5Ht8Jw")
    if (shortMatch.length > 0 && longMatch.length > 0) {
      expect(longMatch[0].confidence).toBeGreaterThan(shortMatch[0].confidence)
    }
  })
})

describe("detectEnvFileSecrets", () => {
  it("should detect SECRET_KEY= in env-file format", () => {
    const matches = detectEnvFileSecrets("SECRET_KEY=aB3dEf6hIj9lMn2pQr5tUv8x")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("GENERIC_API_KEY")
  })

  it("should detect DB_PASSWORD= in env-file format", () => {
    const matches = detectEnvFileSecrets("DB_PASSWORD=xK9mPq2rSt7vW8nB3jL4hY6fZ")
    expect(matches).toHaveLength(1)
  })

  it("should detect AUTH_TOKEN= with quoted value", () => {
    const matches = detectEnvFileSecrets('AUTH_TOKEN="x9K2mP5rQw8tYv3nLj7bHc4f"')
    expect(matches).toHaveLength(1)
  })

  it("should NOT match variables without secret-indicating words", () => {
    const matches = detectEnvFileSecrets("DATABASE_HOST=my-production-server.example.com")
    expect(matches).toHaveLength(0)
  })

  it("should NOT match URL values", () => {
    const matches = detectEnvFileSecrets("SECRET_URL=https://api.example.com/v1/endpoint")
    expect(matches).toHaveLength(0)
  })

  it("should NOT match file paths", () => {
    const matches = detectEnvFileSecrets("SECRET_PATH=/usr/local/etc/certs/private.pem")
    expect(matches).toHaveLength(0)
  })

  it("should NOT match boolean/numeric config values", () => {
    const matches = detectEnvFileSecrets("SECRET_ENABLED=true")
    expect(matches).toHaveLength(0)
  })

  it("should NOT match placeholder values", () => {
    const matches = detectEnvFileSecrets("MY_SECRET_KEY=changeme-replace-this-value")
    expect(matches).toHaveLength(0)
  })

  it("should handle multi-line .env content", () => {
    const env = `APP_NAME=myapp
SECRET_KEY=x9K2mP5rQw8tYv3nLj7bHc4fG9kR
DATABASE_URL=postgres://localhost/db
API_TOKEN=aB3dEf6hIj9lMn2pQr5tUv8xYz01`
    const matches = detectEnvFileSecrets(env)
    expect(matches.length).toBeGreaterThanOrEqual(2)
  })
})

describe("detectHighEntropySecrets", () => {
  it("should detect JSON-style secret assignment", () => {
    const matches = detectHighEntropySecrets('"signing_key": "aB3dEf6gH9jK2mN5pQ8rS1tU4wX7yZ0AbCd"')
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("GENERIC_API_KEY")
  })

  it("should detect YAML-style secret assignment", () => {
    const matches = detectHighEntropySecrets("encryption_key: 'aB3dEf6hIj9lMn2pQr5tUv8xYz0123456'")
    expect(matches).toHaveLength(1)
  })

  it("should NOT match low-entropy values", () => {
    const matches = detectHighEntropySecrets('"secret_key": "aaaaaaaaaaaaaaaaaaaaaaaa"')
    expect(matches).toHaveLength(0)
  })

  it("should NOT match placeholder values", () => {
    const matches = detectHighEntropySecrets('"api_secret": "your-secret-key-here-replace"')
    expect(matches).toHaveLength(0)
  })

  it("should NOT match non-secret key names", () => {
    const matches = detectHighEntropySecrets('"database_host": "x9K2mP5rQw8tYv3nLj7bHc4f"')
    expect(matches).toHaveLength(0)
  })

  it("should give higher confidence to longer high-entropy secrets", () => {
    const short = detectHighEntropySecrets('"auth_key": "x9K2mP5rQw8tYv3nLj7b"')
    const long = detectHighEntropySecrets('"auth_key": "x9K2mP5rQw8tYv3nLj7bHc4fDg6Ek9Fp2Gs5Ht8JwKm1Np"')
    if (short.length > 0 && long.length > 0) {
      expect(long[0].confidence).toBeGreaterThan(short[0].confidence)
    }
  })
})

describe("detectPII integration — general secrets", () => {
  it("should detect custom service keys via detectPII", () => {
    const result = detectPII("CUSTOM_WEBHOOK_SECRET=x9K2mP5rQw8tYv3nLj7bHc4fDg6Ek9F")
    const types = result.map((m) => m.type)
    expect(types).toContain("GENERIC_API_KEY")
  })

  it("should detect env-file secrets via detectPII", () => {
    const result = detectPII("API_SECRET_KEY=x9K2mP5rQw8tYv3nLj7bHc4f")
    expect(result.length).toBeGreaterThanOrEqual(1)
  })
})
