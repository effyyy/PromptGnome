/**
 * Tests for the contextual PII detection module.
 * Covers captureSmartBoundary (boundary logic) and detectContextualPII
 * (trigger-phrase-driven detection). Uses synthetic data only.
 */
import { describe, it, expect } from "vitest"

import { captureSmartBoundary, detectContextualPII } from "~src/detection/regex-engine-contextual"
import { detectPII } from "~src/detection/regex-engine"

// ---------------------------------------------------------------------------
// captureSmartBoundary
// ---------------------------------------------------------------------------

describe("captureSmartBoundary", () => {
  // Quoted strings
  it("should capture double-quoted value", () => {
    const text = 'password is "super secret 123" ok'
    const result = captureSmartBoundary(text, 12) // index where " starts
    expect(result).toEqual({ value: "super secret 123", end: 30 })
  })
  it("should capture single-quoted value", () => {
    const result = captureSmartBoundary("password is 'hunter2' ok", 12)
    expect(result).toEqual({ value: "hunter2", end: 21 })
  })
  it("should capture backtick-quoted value", () => {
    const result = captureSmartBoundary("password is `myP@ss!` ok", 12)
    expect(result).toEqual({ value: "myP@ss!", end: 21 })
  })
  it("should return null for empty quoted value", () => {
    const result = captureSmartBoundary('password is "" ok', 12)
    expect(result).toBeNull()
  })
  // Delimiters
  it("should stop at comma", () => {
    const result = captureSmartBoundary("val is hunter2, thanks", 7)
    expect(result!.value).toBe("hunter2")
  })
  it("should stop at period", () => {
    const result = captureSmartBoundary("val is hunter2. Thanks", 7)
    expect(result!.value).toBe("hunter2")
  })
  it("should stop at semicolon", () => {
    const result = captureSmartBoundary("val is hunter2; next", 7)
    expect(result!.value).toBe("hunter2")
  })
  it("should stop at exclamation mark", () => {
    const result = captureSmartBoundary("val is hunter2! wow", 7)
    expect(result!.value).toBe("hunter2")
  })
  it("should stop at question mark", () => {
    const result = captureSmartBoundary("val is hunter2? really", 7)
    expect(result!.value).toBe("hunter2")
  })
  it("should stop at newline", () => {
    const result = captureSmartBoundary("val is hunter2\nnext line", 7)
    expect(result!.value).toBe("hunter2")
  })
  // Stop words
  it("should stop at 'and' preceded by space", () => {
    const result = captureSmartBoundary("val is hunter2 and more", 7)
    expect(result!.value).toBe("hunter2")
  })
  it("should stop at 'but' preceded by space", () => {
    const result = captureSmartBoundary("val is hunter2 but wait", 7)
    expect(result!.value).toBe("hunter2")
  })
  it("should stop at 'so' preceded by space", () => {
    const result = captureSmartBoundary("val is mypass so yeah", 7)
    expect(result!.value).toBe("mypass")
  })
  it("should NOT stop at stop word inside a word (sandbox)", () => {
    const result = captureSmartBoundary("val is sandbox, end", 7)
    expect(result!.value).toBe("sandbox")
  })
  // Min/max length
  it("should return null for single-character value", () => {
    const result = captureSmartBoundary("val is x, end", 7)
    expect(result).toBeNull()
  })
  it("should cap at 200 characters", () => {
    const longVal = "a".repeat(300)
    const result = captureSmartBoundary("val is " + longVal, 7)
    expect(result!.value.length).toBe(200)
  })
  // Whitespace
  it("should trim leading whitespace from value", () => {
    const result = captureSmartBoundary("val is   hunter2, end", 7)
    expect(result!.value).toBe("hunter2")
  })
  it("should return null for only whitespace before delimiter", () => {
    const result = captureSmartBoundary("val is   , end", 7)
    expect(result).toBeNull()
  })
  // End of string
  it("should capture to end of string if no delimiter", () => {
    const result = captureSmartBoundary("val is hunter2", 7)
    expect(result!.value).toBe("hunter2")
  })
})

// ---------------------------------------------------------------------------
// detectContextualPII — freeform credentials
// ---------------------------------------------------------------------------

describe("detectContextualPII — freeform credentials", () => {
  it("should detect 'my password is hunter2'", () => {
    const matches = detectContextualPII("my password is hunter2")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("PASSWORD")
    expect(matches[0].value).toBe("hunter2")
    expect(matches[0].confidence).toBe(0.99)
  })
  it("should detect 'password: super_secret'", () => {
    const matches = detectContextualPII("please use password: super_secret")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("PASSWORD")
    expect(matches[0].value).toBe("super_secret")
  })
  it("should detect 'pwd is test1234'", () => {
    const matches = detectContextualPII("the pwd is test1234")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("PASSWORD")
  })
  it("should detect quoted password", () => {
    const matches = detectContextualPII('my password is "super secret 123"')
    expect(matches).toHaveLength(1)
    expect(matches[0].value).toBe("super secret 123")
  })
  it("should detect 'my pin is 4532'", () => {
    const matches = detectContextualPII("my pin is 4532")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("PIN")
    expect(matches[0].value).toBe("4532")
  })
  it("should detect 'pin code: 9876'", () => {
    const matches = detectContextualPII("pin code: 9876")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("PIN")
  })
  it("should detect 'my passphrase is correct horse battery staple'", () => {
    const matches = detectContextualPII("my passphrase is correct horse battery staple")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("PASSPHRASE")
    expect(matches[0].value).toBe("correct horse battery staple")
  })
  it("should detect 'secret: abc123xyz'", () => {
    const matches = detectContextualPII("secret: abc123xyz")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("SECRET")
  })
  it("should detect 'my username is johndoe42'", () => {
    const matches = detectContextualPII("my username is johndoe42")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("USERNAME")
    expect(matches[0].value).toBe("johndoe42")
  })
  it("should detect 'login: admin_user'", () => {
    const matches = detectContextualPII("login: admin_user")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("USERNAME")
  })
})

// ---------------------------------------------------------------------------
// detectContextualPII — freeform personal
// ---------------------------------------------------------------------------

describe("detectContextualPII — freeform personal", () => {
  it("should detect 'my address is 123 Oak Street, Springfield'", () => {
    const matches = detectContextualPII("my address is 123 Oak Street, Springfield")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("STREET_ADDRESS")
    expect(matches[0].value).toBe("123 Oak Street")
  })
  it("should detect 'i live at 456 Elm Avenue'", () => {
    const matches = detectContextualPII("i live at 456 Elm Avenue")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("STREET_ADDRESS")
  })
  it("should detect 'my date of birth is 01/15/1990'", () => {
    const matches = detectContextualPII("my date of birth is 01/15/1990")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("DATE_OF_BIRTH")
    expect(matches[0].value).toBe("01/15/1990")
  })
  it("should detect 'dob: 1990-01-15'", () => {
    const matches = detectContextualPII("dob: 1990-01-15")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("DATE_OF_BIRTH")
  })
  it("should detect 'my name is Jane Testperson'", () => {
    const matches = detectContextualPII("my name is Jane Testperson")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("PERSON_NAME")
    expect(matches[0].value).toBe("Jane Testperson")
  })
  it("should detect 'my age is 34'", () => {
    const matches = detectContextualPII("my age is 34")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("AGE")
    expect(matches[0].value).toBe("34")
  })
  it("should detect 'i am 28 years old'", () => {
    const matches = detectContextualPII("i am 28 years old")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("AGE")
    expect(matches[0].value).toBe("28")
  })
})

// ---------------------------------------------------------------------------
// detectContextualPII — freeform financial
// ---------------------------------------------------------------------------

describe("detectContextualPII — freeform financial", () => {
  it("should detect 'account number: 1234567890'", () => {
    const matches = detectContextualPII("account number: 1234567890")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("BANK_ACCOUNT")
    expect(matches[0].value).toBe("1234567890")
  })
  it("should detect 'my routing number is 021000021'", () => {
    const matches = detectContextualPII("my routing number is 021000021")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("ROUTING_NUMBER")
  })
  it("should detect 'routing: 021000021'", () => {
    const matches = detectContextualPII("routing: 021000021")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("ROUTING_NUMBER")
  })
})

// ---------------------------------------------------------------------------
// detectContextualPII — freeform identity
// ---------------------------------------------------------------------------

describe("detectContextualPII — freeform identity", () => {
  it("should detect 'passport number: AB1234567'", () => {
    const matches = detectContextualPII("passport number: AB1234567")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("PASSPORT_US")
  })
  it("should detect 'my license is D1234567'", () => {
    const matches = detectContextualPII("my license is D1234567")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("DRIVERS_LICENSE")
  })
  it("should detect driver's license with apostrophe", () => {
    const matches = detectContextualPII("driver's license: A12345678")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("DRIVERS_LICENSE")
  })
})

// ---------------------------------------------------------------------------
// detectContextualPII — structural email
// ---------------------------------------------------------------------------

describe("detectContextualPII — structural email", () => {
  it("should detect 'my email is jane@corp.co'", () => {
    const matches = detectContextualPII("my email is jane@corp.co")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("EMAIL")
    expect(matches[0].value).toBe("jane@corp.co")
    expect(matches[0].confidence).toBe(0.99)
  })
  it("should detect 'email: test.user@domain.org'", () => {
    const matches = detectContextualPII("email: test.user@domain.org")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("EMAIL")
  })
  it("should NOT detect 'my email is notanemail'", () => {
    const matches = detectContextualPII("my email is notanemail")
    expect(matches).toHaveLength(0)
  })
  it("should detect 'email me at user@site.com, thanks'", () => {
    const matches = detectContextualPII("email me at user@site.com, thanks")
    expect(matches).toHaveLength(1)
    expect(matches[0].value).toBe("user@site.com")
  })
})

// ---------------------------------------------------------------------------
// detectContextualPII — structural SSN
// ---------------------------------------------------------------------------

describe("detectContextualPII — structural SSN", () => {
  it("should detect 'my ssn is 123-45-6789'", () => {
    const matches = detectContextualPII("my ssn is 123-45-6789")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("SSN")
    expect(matches[0].value).toBe("123-45-6789")
    expect(matches[0].confidence).toBe(0.99)
  })
  it("should detect 'ssn: 123 45 6789'", () => {
    const matches = detectContextualPII("ssn: 123 45 6789")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("SSN")
  })
  it("should detect 'social security: 123456789' (no separators)", () => {
    const matches = detectContextualPII("social security: 123456789")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("SSN")
  })
  it("should NOT detect 'my ssn is abc'", () => {
    const matches = detectContextualPII("my ssn is abc")
    expect(matches).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// detectContextualPII — structural credit card
// ---------------------------------------------------------------------------

describe("detectContextualPII — structural credit card", () => {
  it("should detect 'card number: 4111 1111 1111 1111'", () => {
    const matches = detectContextualPII("card number: 4111 1111 1111 1111")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("CREDIT_CARD")
    expect(matches[0].confidence).toBe(0.99)
  })
  it("should detect 'cc: 4111-1111-1111-1111'", () => {
    const matches = detectContextualPII("cc: 4111-1111-1111-1111")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("CREDIT_CARD")
  })
})

// ---------------------------------------------------------------------------
// detectContextualPII — structural phone
// ---------------------------------------------------------------------------

describe("detectContextualPII — structural phone", () => {
  it("should detect 'my phone is (555) 123-4567'", () => {
    const matches = detectContextualPII("my phone is (555) 123-4567")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("PHONE_US")
    expect(matches[0].confidence).toBe(0.99)
  })
  it("should detect 'call me at 555-123-4567'", () => {
    const matches = detectContextualPII("call me at 555-123-4567")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("PHONE_US")
  })
  it("should detect 'tel: +1 555 123 4567'", () => {
    const matches = detectContextualPII("tel: +1 555 123 4567")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("PHONE_US")
  })
})

// ---------------------------------------------------------------------------
// detectContextualPII — structural tax ID
// ---------------------------------------------------------------------------

describe("detectContextualPII — structural tax ID", () => {
  it("should detect 'ein: 12-3456789'", () => {
    const matches = detectContextualPII("ein: 12-3456789")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("US_EIN")
    expect(matches[0].confidence).toBe(0.99)
  })
  it("should detect 'tax id is 123456789'", () => {
    const matches = detectContextualPII("tax id is 123456789")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("US_EIN")
  })
})

// ---------------------------------------------------------------------------
// detectContextualPII — edge cases
// ---------------------------------------------------------------------------

describe("detectContextualPII — edge cases", () => {
  it("should be case insensitive for trigger phrases", () => {
    const matches = detectContextualPII("My Password Is hunter2")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("PASSWORD")
  })
  it("should detect trigger at start of text", () => {
    const matches = detectContextualPII("password: secret123")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("PASSWORD")
  })
  it("should detect trigger after newline", () => {
    const matches = detectContextualPII("hello\nmy password is secret123")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("PASSWORD")
  })
  it("should NOT match trigger as substring of another word", () => {
    const matches = detectContextualPII("repassword is hunter2")
    expect(matches).toHaveLength(0)
  })
  it("should return empty for trigger with no following value", () => {
    const matches = detectContextualPII("my password is ")
    expect(matches).toHaveLength(0)
  })
  it("should return empty for trigger at end of string", () => {
    const matches = detectContextualPII("my password is")
    expect(matches).toHaveLength(0)
  })
  it("should detect multiple triggers in same text", () => {
    const text = "my password is hunter2 and my email is jane@corp.co"
    const matches = detectContextualPII(text)
    // password should stop at "and", and email should detect structurally
    const types = matches.map((m) => m.type)
    expect(types).toContain("PASSWORD")
    expect(types).toContain("EMAIL")
  })
  it("should detect same trigger appearing twice", () => {
    const text = "password: abc123, also password: xyz789"
    const matches = detectContextualPII(text)
    const pwMatches = matches.filter((m) => m.type === "PASSWORD")
    expect(pwMatches).toHaveLength(2)
  })
  it("should set source position correctly for password", () => {
    const text = "my password is hunter2"
    const matches = detectContextualPII(text)
    expect(matches[0].value).toBe("hunter2")
    // "hunter2" starts at index 15
    expect(matches[0].start).toBe(15)
    expect(matches[0].end).toBe(22)
  })
  it("should handle tab after trigger", () => {
    const matches = detectContextualPII("password:\thunter2")
    expect(matches).toHaveLength(1)
    expect(matches[0].value).toBe("hunter2")
  })
  it("should handle 'i am 28 years old' age pattern", () => {
    const matches = detectContextualPII("i am 28 years old")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("AGE")
    expect(matches[0].value).toBe("28")
  })
  it("should handle 'i am 5 year old' (singular)", () => {
    const matches = detectContextualPII("i am 5 year old")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("AGE")
    expect(matches[0].value).toBe("5")
  })
  it("should NOT match 'i am happy' as age", () => {
    const matches = detectContextualPII("i am happy")
    expect(matches.filter((m) => m.type === "AGE")).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// detectContextualPII — full pipeline integration
// ---------------------------------------------------------------------------

describe("detectContextualPII — full pipeline integration", () => {
  it("should surface contextual PASSWORD in detectPII output", () => {
    const matches = detectPII("my password is hunter2abc")
    const pwMatch = matches.find((m) => m.type === "PASSWORD")
    expect(pwMatch).toBeDefined()
    expect(pwMatch!.value).toBe("hunter2abc")
    expect(pwMatch!.confidence).toBe(0.99)
    expect(pwMatch!.source).toBe("regex")
  })

  it("should surface contextual EMAIL at 0.99 alongside structural", () => {
    // "my email is" triggers contextual at 0.99
    // structural email detector also fires at 0.95
    // dedup should keep the 0.99 one
    const matches = detectPII("my email is jane@corp.co")
    const emailMatches = matches.filter((m) => m.type === "EMAIL")
    expect(emailMatches.length).toBeGreaterThanOrEqual(1)
    // The highest confidence should be 0.99 from contextual
    expect(Math.max(...emailMatches.map((m) => m.confidence))).toBe(0.99)
  })

  it("should surface contextual SSN at high confidence over bare structural", () => {
    const matches = detectPII("my ssn is 123-45-6789")
    const ssnMatches = matches.filter((m) => m.type === "SSN")
    expect(ssnMatches.length).toBeGreaterThanOrEqual(1)
    // contextual fires at 0.99; structural with context boost may reach 1.0 — either way >= 0.99
    expect(Math.max(...ssnMatches.map((m) => m.confidence))).toBeGreaterThanOrEqual(0.99)
  })

  it("should respect enabledTypes filter", () => {
    const matches = detectPII("my password is hunter2", new Set(["EMAIL"]))
    const pwMatch = matches.find((m) => m.type === "PASSWORD")
    expect(pwMatch).toBeUndefined()
  })

  it("should detect multiple contextual types in one message", () => {
    const text = "my name is Jane Testperson, my email is jane@corp.co and my password is secret123"
    const matches = detectPII(text)
    const types = matches.map((m) => m.type)
    expect(types).toContain("PASSWORD")
    expect(types).toContain("EMAIL")
  })
})
