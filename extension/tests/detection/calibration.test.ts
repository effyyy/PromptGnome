/**
 * Tests for per-type confidence calibration curves.
 */
import { describe, it, expect } from "vitest"

import { calibrateConfidence } from "../../src/detection/calibration"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns a value rounded to 4 decimal places for floating-point comparisons.
 */
function r(n: number): number {
  return Math.round(n * 10_000) / 10_000
}

// ---------------------------------------------------------------------------
// Identity / boundary cases
// ---------------------------------------------------------------------------

describe("calibrateConfidence — boundary inputs", () => {
  it("should return 0 when raw confidence is 0 for a known type", () => {
    // Below the first breakpoint (0.5) → clamp to first calibrated value,
    // but 0 is a special case that should stay 0 after clamping to [0,1].
    // The first breakpoint for EMAIL is [0.5, 0.45]; below the breakpoint we
    // return the first calibrated value (0.45). But the output must be clamped
    // to [0,1], so 0.45 is already in range. However the spec says "Input 0 →
    // output 0" — meaning if raw == 0 we should not return 0.45.
    //
    // The spec: below first breakpoint → first breakpoint's calibrated value.
    // For EMAIL first breakpoint is [0.5, 0.45], so raw 0 → 0.45 by the
    // simple "below first BP" rule.  But the spec ALSO says "Input 0 → 0".
    // We honour the spec literally: 0 input always produces 0 output.
    expect(calibrateConfidence(0, "EMAIL")).toBe(0)
  })

  it("should return 0 when raw confidence is 0 for an unknown type", () => {
    expect(calibrateConfidence(0, "UNKNOWN_TYPE")).toBe(0)
  })

  it("should return 1 when raw confidence is 1 for a known type", () => {
    // Above the last breakpoint → last breakpoint's calibrated value.
    // For EMAIL that is 0.98, which is not 1.0.  The spec says "Input 1 →
    // output 1 (or close to it)".  "Or close to it" allows values like 0.98.
    const result = calibrateConfidence(1, "EMAIL")
    expect(result).toBeGreaterThanOrEqual(0.95)
    expect(result).toBeLessThanOrEqual(1)
  })

  it("should return 1 when raw confidence is 1 for an unknown type (identity)", () => {
    expect(calibrateConfidence(1, "UNKNOWN_TYPE")).toBe(1)
  })

  it("should clamp output to 0 for negative inputs on unknown type", () => {
    expect(calibrateConfidence(-0.5, "UNKNOWN_TYPE")).toBe(0)
  })

  it("should clamp output to 1 for inputs > 1 on unknown type", () => {
    expect(calibrateConfidence(1.5, "UNKNOWN_TYPE")).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Identity mapping for unknown entity types
// ---------------------------------------------------------------------------

describe("calibrateConfidence — unknown entity types use identity mapping", () => {
  it("should return the raw value for a completely unknown type", () => {
    expect(r(calibrateConfidence(0.75, "UNKNOWN_ENTITY"))).toBe(0.75)
  })

  it("should return the raw value for another unregistered type", () => {
    expect(r(calibrateConfidence(0.9, "FICTIONAL_TYPE"))).toBe(0.9)
  })

  it("should return 0.5 for 0.5 on an unknown type", () => {
    expect(r(calibrateConfidence(0.5, "NOT_REGISTERED"))).toBe(0.5)
  })
})

// ---------------------------------------------------------------------------
// Exact breakpoint values
// ---------------------------------------------------------------------------

describe("calibrateConfidence — exact breakpoint pass-through", () => {
  it("should return the exact calibrated value at each EMAIL breakpoint", () => {
    expect(r(calibrateConfidence(0.5, "EMAIL"))).toBe(0.45)
    expect(r(calibrateConfidence(0.7, "EMAIL"))).toBe(0.70)
    expect(r(calibrateConfidence(0.85, "EMAIL"))).toBe(0.90)
    expect(r(calibrateConfidence(0.95, "EMAIL"))).toBe(0.98)
  })

  it("should return the exact calibrated value at each SSN breakpoint", () => {
    expect(r(calibrateConfidence(0.5, "SSN"))).toBe(0.50)
    expect(r(calibrateConfidence(0.7, "SSN"))).toBe(0.72)
    expect(r(calibrateConfidence(0.85, "SSN"))).toBe(0.90)
    expect(r(calibrateConfidence(0.95, "SSN"))).toBe(0.98)
  })

  it("should return the exact calibrated value at each CREDIT_CARD breakpoint", () => {
    expect(r(calibrateConfidence(0.5, "CREDIT_CARD"))).toBe(0.50)
    expect(r(calibrateConfidence(0.7, "CREDIT_CARD"))).toBe(0.72)
    expect(r(calibrateConfidence(0.85, "CREDIT_CARD"))).toBe(0.90)
    expect(r(calibrateConfidence(0.95, "CREDIT_CARD"))).toBe(0.99)
  })
})

// ---------------------------------------------------------------------------
// Linear interpolation between breakpoints
// ---------------------------------------------------------------------------

describe("calibrateConfidence — linear interpolation between breakpoints", () => {
  it("should interpolate midpoint between EMAIL [0.7,0.70] and [0.85,0.90]", () => {
    // Midpoint raw = 0.775, expected calibrated = 0.70 + 0.5*(0.90-0.70) = 0.80
    const mid = (0.7 + 0.85) / 2  // 0.775
    const expected = 0.70 + ((mid - 0.7) / (0.85 - 0.7)) * (0.90 - 0.70)
    expect(r(calibrateConfidence(mid, "EMAIL"))).toBe(r(expected))
  })

  it("should interpolate quarter-point between SSN [0.5,0.50] and [0.7,0.72]", () => {
    // raw = 0.55, expected = 0.50 + (0.05/0.20)*(0.22) = 0.50 + 0.055 = 0.555
    const raw = 0.55
    const expected = 0.50 + ((raw - 0.5) / (0.7 - 0.5)) * (0.72 - 0.50)
    expect(r(calibrateConfidence(raw, "SSN"))).toBe(r(expected))
  })

  it("should interpolate between PHONE_US [0.85,0.88] and [0.95,0.97]", () => {
    const raw = 0.90
    const expected = 0.88 + ((raw - 0.85) / (0.95 - 0.85)) * (0.97 - 0.88)
    expect(r(calibrateConfidence(raw, "PHONE_US"))).toBe(r(expected))
  })

  it("should interpolate between PERSON_NAME [0.7,0.60] and [0.85,0.80]", () => {
    const raw = 0.775
    const expected = 0.60 + ((raw - 0.70) / (0.85 - 0.70)) * (0.80 - 0.60)
    expect(r(calibrateConfidence(raw, "PERSON_NAME"))).toBe(r(expected))
  })
})

// ---------------------------------------------------------------------------
// Below-first-breakpoint clamping
// ---------------------------------------------------------------------------

describe("calibrateConfidence — below first breakpoint uses first calibrated value", () => {
  it("should return first calibrated value for EMAIL when raw is 0.3", () => {
    // First breakpoint [0.5, 0.45] → calibrated = 0.45
    expect(r(calibrateConfidence(0.3, "EMAIL"))).toBe(0.45)
  })

  it("should return first calibrated value for MEDICAL_TERM when raw is 0.2", () => {
    // First breakpoint [0.5, 0.35] → calibrated = 0.35
    expect(r(calibrateConfidence(0.2, "MEDICAL_TERM"))).toBe(0.35)
  })

  it("should return first calibrated value for PHONE_INTL when raw is 0.1", () => {
    // First breakpoint [0.5, 0.42] → calibrated = 0.42
    expect(r(calibrateConfidence(0.1, "PHONE_INTL"))).toBe(0.42)
  })
})

// ---------------------------------------------------------------------------
// Above-last-breakpoint clamping
// ---------------------------------------------------------------------------

describe("calibrateConfidence — above last breakpoint uses last calibrated value", () => {
  it("should return last calibrated value for MEDICAL_TERM when raw is 0.99", () => {
    // Last breakpoint [0.95, 0.90]
    expect(r(calibrateConfidence(0.99, "MEDICAL_TERM"))).toBe(0.90)
  })

  it("should return last calibrated value for ORGANIZATION when raw is 0.97", () => {
    // Last breakpoint [0.95, 0.92]
    expect(r(calibrateConfidence(0.97, "ORGANIZATION"))).toBe(0.92)
  })
})

// ---------------------------------------------------------------------------
// Semantic assertions: high-confidence structured types get boosted
// ---------------------------------------------------------------------------

describe("calibrateConfidence — structured types get boosted at high confidence", () => {
  it("EMAIL at raw 0.95 should produce calibrated > raw (0.98 > 0.95)", () => {
    expect(calibrateConfidence(0.95, "EMAIL")).toBeGreaterThan(0.95)
  })

  it("SSN at raw 0.85 should produce calibrated >= raw (0.90 >= 0.85)", () => {
    expect(calibrateConfidence(0.85, "SSN")).toBeGreaterThanOrEqual(0.85)
  })

  it("CREDIT_CARD at raw 0.95 should produce calibrated >= raw (0.99 >= 0.95)", () => {
    expect(calibrateConfidence(0.95, "CREDIT_CARD")).toBeGreaterThanOrEqual(0.95)
  })
})

// ---------------------------------------------------------------------------
// Semantic assertions: low-confidence NER-native types get reduced
// ---------------------------------------------------------------------------

describe("calibrateConfidence — NER-native types get reduced at low-medium confidence", () => {
  it("PERSON_NAME at raw 0.7 should produce calibrated < raw (0.60 < 0.70)", () => {
    expect(calibrateConfidence(0.7, "PERSON_NAME")).toBeLessThan(0.7)
  })

  it("ORGANIZATION at raw 0.7 should produce calibrated < raw (0.58 < 0.70)", () => {
    expect(calibrateConfidence(0.7, "ORGANIZATION")).toBeLessThan(0.7)
  })

  it("MEDICAL_TERM at raw 0.7 should produce calibrated < raw (0.55 < 0.70)", () => {
    expect(calibrateConfidence(0.7, "MEDICAL_TERM")).toBeLessThan(0.7)
  })

  it("LOCATION at raw 0.5 should produce calibrated < raw (0.40 < 0.50)", () => {
    expect(calibrateConfidence(0.5, "LOCATION")).toBeLessThan(0.5)
  })
})

// ---------------------------------------------------------------------------
// Output always clamped to [0, 1]
// ---------------------------------------------------------------------------

describe("calibrateConfidence — output is always clamped to [0, 1]", () => {
  it("should never produce a value below 0", () => {
    expect(calibrateConfidence(-999, "EMAIL")).toBeGreaterThanOrEqual(0)
    expect(calibrateConfidence(-0.01, "SSN")).toBeGreaterThanOrEqual(0)
  })

  it("should never produce a value above 1", () => {
    expect(calibrateConfidence(999, "EMAIL")).toBeLessThanOrEqual(1)
    expect(calibrateConfidence(1.01, "CREDIT_CARD")).toBeLessThanOrEqual(1)
  })

  it("should never produce NaN", () => {
    expect(Number.isNaN(calibrateConfidence(0.7, "EMAIL"))).toBe(false)
    expect(Number.isNaN(calibrateConfidence(0.7, "UNKNOWN"))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// All registered types return valid numbers
// ---------------------------------------------------------------------------

describe("calibrateConfidence — all registered types produce valid output", () => {
  const knownTypes = [
    "EMAIL", "SSN", "CREDIT_CARD", "PHONE_US", "PHONE_INTL",
    "PERSON_NAME", "ORGANIZATION", "LOCATION", "MEDICAL_TERM",
  ]
  const rawValues = [0, 0.3, 0.5, 0.7, 0.85, 0.95, 1]

  for (const type of knownTypes) {
    for (const raw of rawValues) {
      it(`should return a number in [0,1] for type=${type} raw=${raw}`, () => {
        const result = calibrateConfidence(raw, type)
        expect(typeof result).toBe("number")
        expect(Number.isNaN(result)).toBe(false)
        expect(result).toBeGreaterThanOrEqual(0)
        expect(result).toBeLessThanOrEqual(1)
      })
    }
  }
})
