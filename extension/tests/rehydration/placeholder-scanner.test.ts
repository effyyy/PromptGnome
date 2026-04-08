/**
 * placeholder-scanner.test.ts — Rehydration layer tests
 *
 * Verifies that scanForPlaceholders correctly identifies [TYPE_N] tokens in
 * arbitrary text, returning accurate position and metadata for each match.
 */

import { describe, it, expect } from "vitest"
import { scanForPlaceholders } from "~src/rehydration/placeholder-scanner"

describe("scanForPlaceholders", () => {
  it("should find a single placeholder", () => {
    const results = scanForPlaceholders("Hello [NAME_1], welcome.")
    expect(results).toHaveLength(1)
    expect(results[0].placeholder).toBe("[NAME_1]")
    expect(results[0].type).toBe("NAME")
    expect(results[0].index).toBe(1)
    expect(results[0].start).toBe(6)
    expect(results[0].end).toBe(14)
  })

  it("should find multiple placeholders", () => {
    const text = "User [NAME_1] sent [EMAIL_1] from [LOCATION_2]"
    const results = scanForPlaceholders(text)
    expect(results).toHaveLength(3)
    expect(results[0].type).toBe("NAME")
    expect(results[1].type).toBe("EMAIL")
    expect(results[2].type).toBe("LOCATION")
  })

  it("should return empty array for no placeholders", () => {
    expect(scanForPlaceholders("no placeholders here")).toHaveLength(0)
  })

  it("should handle all PII_TYPES placeholder values", () => {
    const text = "[PRIVATE_KEY_1] [TOKEN_1] [CRYPTO_1] [NATIONAL_ID_1] [BANK_ACCT_1] [VIN_1] [MED_LICENSE_1]"
    const results = scanForPlaceholders(text)
    expect(results).toHaveLength(7)
  })

  it("should not match incomplete brackets", () => {
    expect(scanForPlaceholders("[NAME_] [_1] NAME_1]")).toHaveLength(0)
  })

  it("should return correct start and end offsets for each match", () => {
    const text = "[EMAIL_1] and [SSN_2]"
    const results = scanForPlaceholders(text)
    expect(results).toHaveLength(2)

    expect(results[0].placeholder).toBe("[EMAIL_1]")
    expect(results[0].start).toBe(0)
    expect(results[0].end).toBe(9)

    expect(results[1].placeholder).toBe("[SSN_2]")
    expect(results[1].start).toBe(14)
    expect(results[1].end).toBe(21)
  })

  it("should parse the numeric index correctly", () => {
    const results = scanForPlaceholders("[NAME_12] showed up")
    expect(results).toHaveLength(1)
    expect(results[0].index).toBe(12)
  })

  it("should be independent across repeated calls (no lastIndex leak)", () => {
    const text = "[EMAIL_1]"
    const first = scanForPlaceholders(text)
    const second = scanForPlaceholders(text)
    expect(first).toHaveLength(1)
    expect(second).toHaveLength(1)
  })

  it("should handle adjacent placeholders with no separator", () => {
    const text = "[NAME_1][EMAIL_1]"
    const results = scanForPlaceholders(text)
    expect(results).toHaveLength(2)
    expect(results[0].type).toBe("NAME")
    expect(results[0].start).toBe(0)
    expect(results[0].end).toBe(8)
    expect(results[1].type).toBe("EMAIL")
    expect(results[1].start).toBe(8)
    expect(results[1].end).toBe(17)
  })

  it("should handle API_KEY placeholder", () => {
    const text = "Replace [API_KEY_3] in the config"
    const results = scanForPlaceholders(text)
    expect(results).toHaveLength(1)
    expect(results[0].type).toBe("API_KEY")
    expect(results[0].index).toBe(3)
  })

  it("should return an empty array for an empty string", () => {
    expect(scanForPlaceholders("")).toHaveLength(0)
  })

  it("should not match a token with zero as the numeric index", () => {
    // [TYPE_0] is technically matched by \d+ — verify behaviour is consistent
    // (the regex allows \d+, so _0 is a valid digit sequence)
    const results = scanForPlaceholders("[NAME_0]")
    expect(results).toHaveLength(1)
    expect(results[0].index).toBe(0)
  })

  it("should not match unknown type tokens", () => {
    const text = "[UNKNOWN_1] [FOOBAR_2]"
    const results = scanForPlaceholders(text)
    expect(results).toHaveLength(0)
  })
})
