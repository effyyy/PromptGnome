/**
 * Tests for the cross-detector voting module.
 * Covers agreement boosting, structured-type penalties, NER-native pass-through,
 * regex-only pass-through, and edge cases (empty inputs, capped confidence).
 */
import { describe, it, expect } from "vitest"

import {
  applyVoting,
  AGREEMENT_BOOST,
  STRUCTURAL_PENALTY,
  STRUCTURED_TYPES,
} from "../../src/detection/cross-detector-voting"
import type { PIIMatch } from "../../src/detection/types"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRegex(
  type: string,
  start: number,
  end: number,
  confidence = 0.95,
  value = "test"
): PIIMatch {
  return { type, value, start, end, confidence, source: "regex" }
}

function makeNer(
  type: string,
  start: number,
  end: number,
  confidence = 0.85,
  value = "test"
): PIIMatch {
  return { type, value, start, end, confidence, source: "ner" }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe("module constants", () => {
  it("should export AGREEMENT_BOOST as 0.05", () => {
    expect(AGREEMENT_BOOST).toBe(0.05)
  })

  it("should export STRUCTURAL_PENALTY as 0.10", () => {
    expect(STRUCTURAL_PENALTY).toBe(0.10)
  })

  it("should export STRUCTURED_TYPES as a Set containing EMAIL", () => {
    expect(STRUCTURED_TYPES.has("EMAIL")).toBe(true)
  })

  it("should include all 18 structured types", () => {
    const expected = [
      "EMAIL", "SSN", "CREDIT_CARD", "PHONE_US", "PHONE_INTL",
      "IPV4", "IPV6", "IBAN", "AWS_ACCESS_KEY", "AWS_SECRET_KEY",
      "GITHUB_TOKEN", "STRIPE_KEY", "GENERIC_API_KEY", "PASSPORT_US",
      "DRIVERS_LICENSE", "ZIP_CODE", "DATE_OF_BIRTH", "STREET_ADDRESS",
    ]
    for (const t of expected) {
      expect(STRUCTURED_TYPES.has(t)).toBe(true)
    }
    expect(STRUCTURED_TYPES.size).toBe(18)
  })

  it("should NOT include NER-native types in STRUCTURED_TYPES", () => {
    for (const t of ["PERSON_NAME", "ORGANIZATION", "LOCATION", "MEDICAL_TERM"]) {
      expect(STRUCTURED_TYPES.has(t)).toBe(false)
    }
  })
})

// ---------------------------------------------------------------------------
// Rule 5: Empty NER array → pass-through
// ---------------------------------------------------------------------------

describe("applyVoting — empty NER array (pass-through mode)", () => {
  it("should return regex matches unchanged when NER array is empty", () => {
    const regex = [makeRegex("EMAIL", 0, 20)]
    const result = applyVoting(regex, [])
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual(regex[0])
  })

  it("should return empty array when both inputs are empty", () => {
    expect(applyVoting([], [])).toHaveLength(0)
  })

  it("should return empty array when only regex is empty and NER is also empty", () => {
    expect(applyVoting([], [])).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Rule 1: Both agree → boosted confidence, source "both"
// ---------------------------------------------------------------------------

describe("applyVoting — both agree (same span + same type)", () => {
  it("should set source to 'both' when regex and NER agree on same span", () => {
    const regex = [makeRegex("EMAIL", 0, 20, 0.95)]
    const ner = [makeNer("EMAIL", 0, 20, 0.88)]
    const result = applyVoting(regex, ner)
    expect(result).toHaveLength(1)
    expect(result[0].source).toBe("both")
  })

  it("should set confidence to max(regex, ner) + AGREEMENT_BOOST", () => {
    const regex = [makeRegex("EMAIL", 0, 20, 0.95)]
    const ner = [makeNer("EMAIL", 0, 20, 0.88)]
    const result = applyVoting(regex, ner)
    // max(0.95, 0.88) = 0.95; 0.95 + 0.05 = 1.0
    expect(result[0].confidence).toBeCloseTo(1.0)
  })

  it("should cap boosted confidence at 1.0", () => {
    const regex = [makeRegex("SSN", 5, 16, 0.98)]
    const ner = [makeNer("SSN", 5, 16, 0.99)]
    const result = applyVoting(regex, ner)
    expect(result[0].confidence).toBe(1.0)
  })

  it("should use regex value when merging (first source wins for value)", () => {
    const regex = [makeRegex("EMAIL", 0, 20, 0.95, "jane@example.com")]
    const ner = [makeNer("EMAIL", 0, 20, 0.88, "jane@example.com")]
    const result = applyVoting(regex, ner)
    expect(result[0].value).toBe("jane@example.com")
  })

  it("should preserve start/end from the agreed match", () => {
    const regex = [makeRegex("CREDIT_CARD", 10, 26, 0.95)]
    const ner = [makeNer("CREDIT_CARD", 10, 26, 0.80)]
    const result = applyVoting(regex, ner)
    expect(result[0].start).toBe(10)
    expect(result[0].end).toBe(26)
  })

  it("should NOT merge matches with same type but different span", () => {
    const regex = [makeRegex("EMAIL", 0, 20, 0.95)]
    const ner = [makeNer("EMAIL", 1, 20, 0.88)] // different start
    const result = applyVoting(regex, ner)
    // Should produce 2 separate matches: one regex-only, one ner-only (penalized)
    expect(result).toHaveLength(2)
  })

  it("should NOT merge matches with same span but different type", () => {
    const regex = [makeRegex("EMAIL", 0, 20, 0.95)]
    const ner = [makeNer("ORGANIZATION", 0, 20, 0.88)]
    const result = applyVoting(regex, ner)
    expect(result).toHaveLength(2)
  })

  it("should boost using NER confidence when NER is higher", () => {
    const regex = [makeRegex("PHONE_US", 0, 14, 0.80)]
    const ner = [makeNer("PHONE_US", 0, 14, 0.92)]
    const result = applyVoting(regex, ner)
    // max(0.80, 0.92) = 0.92; 0.92 + 0.05 = 0.97
    expect(result[0].confidence).toBeCloseTo(0.97)
  })
})

// ---------------------------------------------------------------------------
// Rule 2: NER-only on structured type → penalized
// ---------------------------------------------------------------------------

describe("applyVoting — NER-only on structured type (penalty)", () => {
  it("should reduce confidence by STRUCTURAL_PENALTY for NER-only EMAIL", () => {
    const ner = [makeNer("EMAIL", 0, 20, 0.85)]
    const result = applyVoting([], ner)
    expect(result[0].confidence).toBeCloseTo(0.75)
  })

  it("should keep source as 'ner' for penalized structured match", () => {
    const ner = [makeNer("SSN", 0, 11, 0.90)]
    const result = applyVoting([], ner)
    expect(result[0].source).toBe("ner")
  })

  it("should clamp penalized confidence at 0.0 minimum", () => {
    const ner = [makeNer("CREDIT_CARD", 0, 16, 0.05)]
    const result = applyVoting([], ner)
    expect(result[0].confidence).toBeGreaterThanOrEqual(0.0)
  })

  it("should penalize all 18 structured types when NER-only", () => {
    const structuredTypes = [
      "EMAIL", "SSN", "CREDIT_CARD", "PHONE_US", "PHONE_INTL",
      "IPV4", "IPV6", "IBAN", "AWS_ACCESS_KEY", "AWS_SECRET_KEY",
      "GITHUB_TOKEN", "STRIPE_KEY", "GENERIC_API_KEY", "PASSPORT_US",
      "DRIVERS_LICENSE", "ZIP_CODE", "DATE_OF_BIRTH", "STREET_ADDRESS",
    ]
    for (const type of structuredTypes) {
      const ner = [makeNer(type, 0, 5, 0.80)]
      const result = applyVoting([], ner)
      expect(result[0].confidence).toBeCloseTo(0.70, 5)
    }
  })
})

// ---------------------------------------------------------------------------
// Rule 3: NER-only on NER-native type → face value
// ---------------------------------------------------------------------------

describe("applyVoting — NER-only on NER-native type (face value)", () => {
  it("should keep PERSON_NAME confidence at face value", () => {
    const ner = [makeNer("PERSON_NAME", 0, 10, 0.88)]
    const result = applyVoting([], ner)
    expect(result[0].confidence).toBeCloseTo(0.88)
  })

  it("should keep ORGANIZATION confidence at face value", () => {
    const ner = [makeNer("ORGANIZATION", 0, 15, 0.72)]
    const result = applyVoting([], ner)
    expect(result[0].confidence).toBeCloseTo(0.72)
  })

  it("should keep LOCATION confidence at face value", () => {
    const ner = [makeNer("LOCATION", 0, 8, 0.91)]
    const result = applyVoting([], ner)
    expect(result[0].confidence).toBeCloseTo(0.91)
  })

  it("should keep MEDICAL_TERM confidence at face value", () => {
    const ner = [makeNer("MEDICAL_TERM", 0, 12, 0.65)]
    const result = applyVoting([], ner)
    expect(result[0].confidence).toBeCloseTo(0.65)
  })

  it("should preserve source as 'ner' for NER-native matches", () => {
    const ner = [makeNer("PERSON_NAME", 5, 15, 0.80)]
    const result = applyVoting([], ner)
    expect(result[0].source).toBe("ner")
  })
})

// ---------------------------------------------------------------------------
// Rule 4: Regex-only → unchanged
// ---------------------------------------------------------------------------

describe("applyVoting — regex-only → unchanged", () => {
  it("should return regex match unchanged when NER has no matches", () => {
    const regex = [makeRegex("EMAIL", 0, 20, 0.95)]
    const ner = [makeNer("PERSON_NAME", 30, 40, 0.88)] // different span and type
    const result = applyVoting(regex, ner)
    const emailMatch = result.find((m) => m.type === "EMAIL")
    expect(emailMatch).toBeDefined()
    expect(emailMatch?.confidence).toBeCloseTo(0.95)
    expect(emailMatch?.source).toBe("regex")
  })

  it("should keep source as 'regex' for regex-only matches", () => {
    const regex = [makeRegex("SSN", 0, 11, 0.97)]
    const ner = [makeNer("PERSON_NAME", 20, 30, 0.82)]
    const result = applyVoting(regex, ner)
    const ssnMatch = result.find((m) => m.type === "SSN")
    expect(ssnMatch?.source).toBe("regex")
  })
})

// ---------------------------------------------------------------------------
// Mixed scenarios
// ---------------------------------------------------------------------------

describe("applyVoting — mixed multi-match scenarios", () => {
  it("should handle agreement, regex-only, and NER-native in one pass", () => {
    const regexMatches: PIIMatch[] = [
      makeRegex("EMAIL", 0, 20, 0.95),       // agreed with NER
      makeRegex("SSN", 30, 41, 0.97),        // regex-only
    ]
    const nerMatches: PIIMatch[] = [
      makeNer("EMAIL", 0, 20, 0.88),          // agrees with regex
      makeNer("PERSON_NAME", 50, 60, 0.82),  // NER-native
    ]
    const result = applyVoting(regexMatches, nerMatches)

    expect(result).toHaveLength(3)

    const emailMatch = result.find((m) => m.type === "EMAIL")
    expect(emailMatch?.source).toBe("both")
    expect(emailMatch?.confidence).toBeCloseTo(1.0)

    const ssnMatch = result.find((m) => m.type === "SSN")
    expect(ssnMatch?.source).toBe("regex")
    expect(ssnMatch?.confidence).toBeCloseTo(0.97)

    const nameMatch = result.find((m) => m.type === "PERSON_NAME")
    expect(nameMatch?.source).toBe("ner")
    expect(nameMatch?.confidence).toBeCloseTo(0.82)
  })

  it("should handle NER-only structured + NER-native in one pass", () => {
    const nerMatches: PIIMatch[] = [
      makeNer("CREDIT_CARD", 0, 16, 0.90),   // structured, NER-only → penalized
      makeNer("LOCATION", 20, 30, 0.75),      // NER-native → face value
    ]
    const result = applyVoting([], nerMatches)

    expect(result).toHaveLength(2)

    const ccMatch = result.find((m) => m.type === "CREDIT_CARD")
    expect(ccMatch?.confidence).toBeCloseTo(0.80)

    const locMatch = result.find((m) => m.type === "LOCATION")
    expect(locMatch?.confidence).toBeCloseTo(0.75)
  })

  it("should handle multiple agreements in one call", () => {
    const regexMatches: PIIMatch[] = [
      makeRegex("EMAIL", 0, 20, 0.95),
      makeRegex("PHONE_US", 25, 38, 0.93),
    ]
    const nerMatches: PIIMatch[] = [
      makeNer("EMAIL", 0, 20, 0.87),
      makeNer("PHONE_US", 25, 38, 0.80),
    ]
    const result = applyVoting(regexMatches, nerMatches)

    expect(result).toHaveLength(2)
    for (const m of result) {
      expect(m.source).toBe("both")
    }
  })

  it("should not duplicate matches when a NER match is consumed by agreement", () => {
    const regexMatches = [makeRegex("EMAIL", 0, 20, 0.95)]
    const nerMatches = [makeNer("EMAIL", 0, 20, 0.90)]
    const result = applyVoting(regexMatches, nerMatches)
    // Should produce exactly 1 merged match, not 2
    expect(result.filter((m) => m.type === "EMAIL")).toHaveLength(1)
  })

  it("should preserve all fields (type, value, start, end) after voting", () => {
    const regexMatches = [makeRegex("IBAN", 5, 27, 0.95, "GB29NWBK60161331926819")]
    const nerMatches = [makeNer("IBAN", 5, 27, 0.88, "GB29NWBK60161331926819")]
    const result = applyVoting(regexMatches, nerMatches)

    expect(result[0].type).toBe("IBAN")
    expect(result[0].value).toBe("GB29NWBK60161331926819")
    expect(result[0].start).toBe(5)
    expect(result[0].end).toBe(27)
  })
})

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("applyVoting — edge cases", () => {
  it("should return empty array when both inputs are empty", () => {
    expect(applyVoting([], [])).toEqual([])
  })

  it("should return regex matches unchanged when NER is empty", () => {
    const regex = [
      makeRegex("EMAIL", 0, 20),
      makeRegex("SSN", 25, 36),
    ]
    const result = applyVoting(regex, [])
    expect(result).toHaveLength(2)
    expect(result).toEqual(regex)
  })

  it("should not mutate the input arrays", () => {
    const regex = [makeRegex("EMAIL", 0, 20, 0.95)]
    const ner = [makeNer("EMAIL", 0, 20, 0.88)]
    const regexCopy = { ...regex[0] }
    const nerCopy = { ...ner[0] }
    applyVoting(regex, ner)
    expect(regex[0]).toEqual(regexCopy)
    expect(ner[0]).toEqual(nerCopy)
  })

  it("should handle a single NER match with no regex matches (non-empty NER)", () => {
    const ner = [makeNer("PERSON_NAME", 0, 10, 0.80)]
    const result = applyVoting([], ner)
    expect(result).toHaveLength(1)
    expect(result[0].source).toBe("ner")
  })

  it("should handle confidence exactly at 0.10 being penalized to 0.0", () => {
    const ner = [makeNer("EMAIL", 0, 20, 0.10)]
    const result = applyVoting([], ner)
    expect(result[0].confidence).toBeCloseTo(0.0)
  })

  it("should handle multiple NER matches of the same type at different positions", () => {
    const ner = [
      makeNer("PERSON_NAME", 0, 10, 0.85),
      makeNer("PERSON_NAME", 20, 30, 0.75),
    ]
    const result = applyVoting([], ner)
    expect(result).toHaveLength(2)
    expect(result[0].confidence).toBeCloseTo(0.85)
    expect(result[1].confidence).toBeCloseTo(0.75)
  })
})
