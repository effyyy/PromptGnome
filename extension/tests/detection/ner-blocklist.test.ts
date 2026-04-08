/**
 * Tests for the NER post-filtering blocklist.
 * Uses synthetic data only — never real names, SSNs, emails, etc.
 */
import { describe, it, expect } from "vitest"

import { shouldRejectNERResult } from "../../src/detection/ner-blocklist"

// ---------------------------------------------------------------------------
// Length rejection
// ---------------------------------------------------------------------------

describe("shouldRejectNERResult", () => {
  describe("length rejection", () => {
    it("should reject value under 3 characters as PERSON_NAME", () => {
      expect(shouldRejectNERResult("Al", "PERSON_NAME")).toBe(true)
    })

    it("should reject single character as ORGANIZATION", () => {
      expect(shouldRejectNERResult("A", "ORGANIZATION")).toBe(true)
    })

    it("should reject two-character value as LOCATION", () => {
      expect(shouldRejectNERResult("NY", "LOCATION")).toBe(true)
    })

    it("should not reject exactly 3 characters as ORGANIZATION", () => {
      expect(shouldRejectNERResult("IBM", "ORGANIZATION")).toBe(false)
    })
  })

  // ---------------------------------------------------------------------------
  // Repeated character rejection
  // ---------------------------------------------------------------------------

  describe("repeated character rejection", () => {
    it("should reject all-same uppercase chars as PERSON_NAME", () => {
      expect(shouldRejectNERResult("AAAA", "PERSON_NAME")).toBe(true)
    })

    it("should reject all-same lowercase chars as PERSON_NAME", () => {
      expect(shouldRejectNERResult("xxxx", "PERSON_NAME")).toBe(true)
    })

    it("should reject all-same chars as ORGANIZATION", () => {
      expect(shouldRejectNERResult("nnnn", "ORGANIZATION")).toBe(true)
    })

    it("should reject 'AaAa' (all same letter, case-insensitive) as LOCATION", () => {
      // 'A' and 'a' are the same character — the regex uses /i flag
      expect(shouldRejectNERResult("AaAa", "LOCATION")).toBe(true)
    })

    it("should not reject a normal word as ORGANIZATION", () => {
      expect(shouldRejectNERResult("Google", "ORGANIZATION")).toBe(false)
    })
  })

  // ---------------------------------------------------------------------------
  // Stopword rejection
  // ---------------------------------------------------------------------------

  describe("stopword rejection", () => {
    it("should reject 'the' as PERSON_NAME", () => {
      expect(shouldRejectNERResult("the", "PERSON_NAME")).toBe(true)
    })

    it("should reject 'The' (capitalized) as PERSON_NAME", () => {
      expect(shouldRejectNERResult("The", "PERSON_NAME")).toBe(true)
    })

    it("should reject 'is' as PERSON_NAME", () => {
      expect(shouldRejectNERResult("is", "PERSON_NAME")).toBe(true)
    })

    it("should reject 'have' as ORGANIZATION", () => {
      expect(shouldRejectNERResult("have", "ORGANIZATION")).toBe(true)
    })

    it("should reject 'because' as LOCATION", () => {
      expect(shouldRejectNERResult("because", "LOCATION")).toBe(true)
    })

    it("should reject 'and' as PERSON_NAME", () => {
      expect(shouldRejectNERResult("and", "PERSON_NAME")).toBe(true)
    })

    it("should reject 'with' as PERSON_NAME", () => {
      expect(shouldRejectNERResult("with", "PERSON_NAME")).toBe(true)
    })

    it("should reject 'this' as PERSON_NAME", () => {
      expect(shouldRejectNERResult("this", "PERSON_NAME")).toBe(true)
    })

    it("should reject 'also' as ORGANIZATION", () => {
      expect(shouldRejectNERResult("also", "ORGANIZATION")).toBe(true)
    })

    it("should reject 'only' as PERSON_NAME", () => {
      expect(shouldRejectNERResult("only", "PERSON_NAME")).toBe(true)
    })
  })

  // ---------------------------------------------------------------------------
  // Programming keyword rejection
  // ---------------------------------------------------------------------------

  describe("programming keyword rejection", () => {
    it("should reject 'function' as ORGANIZATION", () => {
      expect(shouldRejectNERResult("function", "ORGANIZATION")).toBe(true)
    })

    it("should reject 'return' as PERSON_NAME", () => {
      expect(shouldRejectNERResult("return", "PERSON_NAME")).toBe(true)
    })

    it("should reject 'const' as ORGANIZATION", () => {
      expect(shouldRejectNERResult("const", "ORGANIZATION")).toBe(true)
    })

    it("should reject 'let' as PERSON_NAME", () => {
      expect(shouldRejectNERResult("let", "PERSON_NAME")).toBe(true)
    })

    it("should reject 'var' as PERSON_NAME", () => {
      expect(shouldRejectNERResult("var", "PERSON_NAME")).toBe(true)
    })

    it("should reject 'class' as ORGANIZATION", () => {
      expect(shouldRejectNERResult("class", "ORGANIZATION")).toBe(true)
    })

    it("should reject 'import' as ORGANIZATION", () => {
      expect(shouldRejectNERResult("import", "ORGANIZATION")).toBe(true)
    })

    it("should reject 'export' as ORGANIZATION", () => {
      expect(shouldRejectNERResult("export", "ORGANIZATION")).toBe(true)
    })

    it("should reject 'interface' as ORGANIZATION", () => {
      expect(shouldRejectNERResult("interface", "ORGANIZATION")).toBe(true)
    })

    it("should reject 'null' as PERSON_NAME", () => {
      expect(shouldRejectNERResult("null", "PERSON_NAME")).toBe(true)
    })

    it("should reject 'undefined' as PERSON_NAME", () => {
      expect(shouldRejectNERResult("undefined", "PERSON_NAME")).toBe(true)
    })

    it("should reject 'true' as LOCATION", () => {
      expect(shouldRejectNERResult("true", "LOCATION")).toBe(true)
    })

    it("should reject 'false' as PERSON_NAME", () => {
      expect(shouldRejectNERResult("false", "PERSON_NAME")).toBe(true)
    })

    it("should reject 'async' as ORGANIZATION", () => {
      expect(shouldRejectNERResult("async", "ORGANIZATION")).toBe(true)
    })

    it("should reject 'await' as ORGANIZATION", () => {
      expect(shouldRejectNERResult("await", "ORGANIZATION")).toBe(true)
    })
  })

  // ---------------------------------------------------------------------------
  // Day and month name rejection (only as PERSON_NAME)
  // ---------------------------------------------------------------------------

  describe("day/month name rejection as PERSON_NAME", () => {
    it("should reject 'Monday' as PERSON_NAME", () => {
      expect(shouldRejectNERResult("Monday", "PERSON_NAME")).toBe(true)
    })

    it("should reject 'friday' (lowercase) as PERSON_NAME", () => {
      expect(shouldRejectNERResult("friday", "PERSON_NAME")).toBe(true)
    })

    it("should reject 'January' as PERSON_NAME", () => {
      expect(shouldRejectNERResult("January", "PERSON_NAME")).toBe(true)
    })

    it("should reject 'Dec' (month abbreviation) as PERSON_NAME", () => {
      expect(shouldRejectNERResult("Dec", "PERSON_NAME")).toBe(true)
    })

    it("should reject 'Mon' (day abbreviation) as PERSON_NAME", () => {
      expect(shouldRejectNERResult("Mon", "PERSON_NAME")).toBe(true)
    })

    it("should not reject 'Monday' as LOCATION", () => {
      expect(shouldRejectNERResult("Monday", "LOCATION")).toBe(false)
    })

    it("should not reject 'January' as ORGANIZATION", () => {
      expect(shouldRejectNERResult("January", "ORGANIZATION")).toBe(false)
    })
  })

  // ---------------------------------------------------------------------------
  // Country name rejection (only as PERSON_NAME, allowed as LOCATION)
  // ---------------------------------------------------------------------------

  describe("country name rejection", () => {
    it("should reject 'Germany' as PERSON_NAME", () => {
      expect(shouldRejectNERResult("Germany", "PERSON_NAME")).toBe(true)
    })

    it("should reject 'france' (lowercase) as PERSON_NAME", () => {
      expect(shouldRejectNERResult("france", "PERSON_NAME")).toBe(true)
    })

    it("should reject 'United States' as PERSON_NAME", () => {
      expect(shouldRejectNERResult("United States", "PERSON_NAME")).toBe(true)
    })

    it("should reject 'Japan' as PERSON_NAME", () => {
      expect(shouldRejectNERResult("Japan", "PERSON_NAME")).toBe(true)
    })

    it("should NOT reject 'Germany' as LOCATION", () => {
      expect(shouldRejectNERResult("Germany", "LOCATION")).toBe(false)
    })

    it("should NOT reject 'Japan' as ORGANIZATION", () => {
      expect(shouldRejectNERResult("Japan", "ORGANIZATION")).toBe(false)
    })

    it("should NOT reject 'France' as LOCATION", () => {
      expect(shouldRejectNERResult("France", "LOCATION")).toBe(false)
    })
  })

  // ---------------------------------------------------------------------------
  // Capitalization heuristic (PERSON_NAME only)
  // ---------------------------------------------------------------------------

  describe("capitalization heuristic for PERSON_NAME", () => {
    it("should reject all-lowercase 'someone' as PERSON_NAME", () => {
      expect(shouldRejectNERResult("someone", "PERSON_NAME")).toBe(true)
    })

    it("should reject all-lowercase 'testperson' as PERSON_NAME", () => {
      expect(shouldRejectNERResult("testperson", "PERSON_NAME")).toBe(true)
    })

    it("should not reject 'Someone' (starts with uppercase) as PERSON_NAME", () => {
      expect(shouldRejectNERResult("Someone", "PERSON_NAME")).toBe(false)
    })

    it("should not apply capitalization rule to ORGANIZATION", () => {
      expect(shouldRejectNERResult("google", "ORGANIZATION")).toBe(false)
    })

    it("should not apply capitalization rule to LOCATION", () => {
      expect(shouldRejectNERResult("somewhere", "LOCATION")).toBe(false)
    })

    it("should not apply capitalization rule to MEDICAL_TERM", () => {
      expect(shouldRejectNERResult("hypertension", "MEDICAL_TERM")).toBe(false)
    })

    it("should accept name with accented uppercase char as PERSON_NAME", () => {
      expect(shouldRejectNERResult("María", "PERSON_NAME")).toBe(false)
    })
  })

  // ---------------------------------------------------------------------------
  // Valid values that must pass through (no false rejections)
  // ---------------------------------------------------------------------------

  describe("valid PERSON_NAME values pass through", () => {
    it("should not reject 'John Smith'", () => {
      expect(shouldRejectNERResult("John Smith", "PERSON_NAME")).toBe(false)
    })

    it("should not reject 'María García'", () => {
      expect(shouldRejectNERResult("María García", "PERSON_NAME")).toBe(false)
    })

    it("should not reject 'Alice Testperson'", () => {
      expect(shouldRejectNERResult("Alice Testperson", "PERSON_NAME")).toBe(false)
    })

    it("should not reject 'Dr. Jane Doe'", () => {
      expect(shouldRejectNERResult("Dr. Jane Doe", "PERSON_NAME")).toBe(false)
    })
  })

  describe("valid ORGANIZATION values pass through", () => {
    it("should not reject 'Google'", () => {
      expect(shouldRejectNERResult("Google", "ORGANIZATION")).toBe(false)
    })

    it("should not reject 'Acme Corp'", () => {
      expect(shouldRejectNERResult("Acme Corp", "ORGANIZATION")).toBe(false)
    })

    it("should not reject 'IBM'", () => {
      expect(shouldRejectNERResult("IBM", "ORGANIZATION")).toBe(false)
    })

    it("should not reject 'OpenAI'", () => {
      expect(shouldRejectNERResult("OpenAI", "ORGANIZATION")).toBe(false)
    })
  })

  describe("valid LOCATION values pass through", () => {
    it("should not reject 'New York'", () => {
      expect(shouldRejectNERResult("New York", "LOCATION")).toBe(false)
    })

    it("should not reject 'Silicon Valley'", () => {
      expect(shouldRejectNERResult("Silicon Valley", "LOCATION")).toBe(false)
    })

    it("should not reject 'Paris'", () => {
      expect(shouldRejectNERResult("Paris", "LOCATION")).toBe(false)
    })

    it("should not reject 'Germany' as LOCATION", () => {
      expect(shouldRejectNERResult("Germany", "LOCATION")).toBe(false)
    })
  })

  describe("valid MEDICAL_TERM values pass through", () => {
    it("should not reject 'hypertension'", () => {
      expect(shouldRejectNERResult("hypertension", "MEDICAL_TERM")).toBe(false)
    })

    it("should not reject 'Type 2 Diabetes'", () => {
      expect(shouldRejectNERResult("Type 2 Diabetes", "MEDICAL_TERM")).toBe(false)
    })

    it("should not reject 'myocardial infarction'", () => {
      expect(shouldRejectNERResult("myocardial infarction", "MEDICAL_TERM")).toBe(false)
    })
  })
})
