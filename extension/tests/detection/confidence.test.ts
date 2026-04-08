/**
 * Tests for confidence scoring and thresholding.
 */
import { describe, it, expect } from "vitest"

import {
  filterByConfidence,
  sortByConfidence,
  groupByType,
  summarizeDetections
} from "../../src/detection/confidence"
import type { PIIMatch } from "../../src/detection/types"

function makeMatch(type: string, confidence: number, start = 0): PIIMatch {
  return { type, value: "test", start, end: start + 4, confidence, source: "regex" }
}

describe("filterByConfidence", () => {
  it("should filter out matches below threshold", () => {
    const matches = [makeMatch("EMAIL", 0.95), makeMatch("ZIP_CODE", 0.5)]
    const result = filterByConfidence(matches, 0.7)
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe("EMAIL")
  })

  it("should keep matches at exactly the threshold", () => {
    const matches = [makeMatch("EMAIL", 0.7)]
    expect(filterByConfidence(matches, 0.7)).toHaveLength(1)
  })

  it("should return empty for all-below-threshold", () => {
    const matches = [makeMatch("EMAIL", 0.3), makeMatch("SSN", 0.4)]
    expect(filterByConfidence(matches, 0.7)).toHaveLength(0)
  })
})

describe("sortByConfidence", () => {
  it("should sort by confidence descending", () => {
    const matches = [makeMatch("A", 0.5), makeMatch("B", 0.9), makeMatch("C", 0.7)]
    const result = sortByConfidence(matches)
    expect(result[0].type).toBe("B")
    expect(result[1].type).toBe("C")
    expect(result[2].type).toBe("A")
  })

  it("should break ties by position", () => {
    const matches = [makeMatch("A", 0.9, 10), makeMatch("B", 0.9, 5)]
    const result = sortByConfidence(matches)
    expect(result[0].start).toBe(5)
  })
})

describe("groupByType", () => {
  it("should group matches by type", () => {
    const matches = [
      makeMatch("EMAIL", 0.95),
      makeMatch("SSN", 0.9),
      makeMatch("EMAIL", 0.95)
    ]
    const grouped = groupByType(matches)
    expect(grouped["EMAIL"]).toHaveLength(2)
    expect(grouped["SSN"]).toHaveLength(1)
  })

  it("should handle empty array", () => {
    expect(Object.keys(groupByType([]))).toHaveLength(0)
  })
})

describe("summarizeDetections", () => {
  it("should produce human-readable summary", () => {
    const matches = [
      makeMatch("EMAIL", 0.95),
      makeMatch("EMAIL", 0.95),
      makeMatch("SSN", 0.9)
    ]
    const summary = summarizeDetections(matches)
    expect(summary).toContain("2 email")
    expect(summary).toContain("1 ssn")
  })

  it("should return 'no PII detected' for empty matches", () => {
    expect(summarizeDetections([])).toBe("no PII detected")
  })
})
