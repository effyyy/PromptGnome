/**
 * Tests for src/highlighting/highlight-renderer.ts.
 *
 * Covers: piiTypeToHighlightName mappings, createRangeFromOffsets validation,
 * HighlightRenderer highlight registration, clear-on-update, badge position
 * computation, reposition(), and destroy().
 *
 * The CSS Custom Highlight API (CSS.highlights, Highlight) is not available
 * in jsdom so it is mocked globally before each test suite.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  piiTypeToHighlightName,
  createRangeFromOffsets,
  HighlightRenderer,
} from "../../src/highlighting/highlight-renderer"
import type { PIIMatch } from "../../src/detection/types"
import type { TextMapping } from "../../src/highlighting/types"

// ---------------------------------------------------------------------------
// CSS Custom Highlight API mock
// ---------------------------------------------------------------------------

const mockHighlights = new Map<string, unknown>()

vi.stubGlobal("CSS", {
  highlights: {
    set: vi.fn((name: string, highlight: unknown) => mockHighlights.set(name, highlight)),
    delete: vi.fn((name: string) => mockHighlights.delete(name)),
    clear: vi.fn(() => mockHighlights.clear()),
  },
})

vi.stubGlobal(
  "Highlight",
  class MockHighlight {
    ranges: Range[]
    constructor(...ranges: Range[]) {
      this.ranges = ranges
    }
  },
)

// jsdom does not implement Range.prototype.getBoundingClientRect — stub it.
Range.prototype.getBoundingClientRect = vi.fn(
  () => new DOMRect(10, 20, 100, 16),
) as typeof Range.prototype.getBoundingClientRect

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds a minimal TextMapping from a plain string with a single Text node.
 */
function buildMapping(text: string): TextMapping {
  const node = document.createTextNode(text)
  document.body.appendChild(node)
  return {
    plainText: text,
    offsets: Array.from({ length: text.length }, (_, i) => ({ node, offset: i })),
  }
}

/**
 * Creates a synthetic PIIMatch for testing.
 */
function buildMatch(
  type: string,
  start: number,
  end: number,
  confidence = 0.95,
): PIIMatch {
  return {
    type,
    value: "test",
    start,
    end,
    confidence,
    source: "regex",
  }
}

// ---------------------------------------------------------------------------
// piiTypeToHighlightName
// ---------------------------------------------------------------------------

describe("piiTypeToHighlightName", () => {
  it("should map EMAIL to pii-email", () => {
    expect(piiTypeToHighlightName("EMAIL")).toBe("pii-email")
  })

  it("should map SSN to pii-ssn", () => {
    expect(piiTypeToHighlightName("SSN")).toBe("pii-ssn")
  })

  it("should map CREDIT_CARD to pii-credit-card", () => {
    expect(piiTypeToHighlightName("CREDIT_CARD")).toBe("pii-credit-card")
  })

  it("should map PHONE_US to pii-phone", () => {
    expect(piiTypeToHighlightName("PHONE_US")).toBe("pii-phone")
  })

  it("should map PHONE_INTL to pii-phone", () => {
    expect(piiTypeToHighlightName("PHONE_INTL")).toBe("pii-phone")
  })

  it("should map IPV4 to pii-ip", () => {
    expect(piiTypeToHighlightName("IPV4")).toBe("pii-ip")
  })

  it("should map IPV6 to pii-ip", () => {
    expect(piiTypeToHighlightName("IPV6")).toBe("pii-ip")
  })

  it("should map AWS_ACCESS_KEY to pii-api-key", () => {
    expect(piiTypeToHighlightName("AWS_ACCESS_KEY")).toBe("pii-api-key")
  })

  it("should map AWS_SECRET_KEY to pii-api-key", () => {
    expect(piiTypeToHighlightName("AWS_SECRET_KEY")).toBe("pii-api-key")
  })

  it("should map GITHUB_TOKEN to pii-api-key", () => {
    expect(piiTypeToHighlightName("GITHUB_TOKEN")).toBe("pii-api-key")
  })

  it("should map STRIPE_KEY to pii-api-key", () => {
    expect(piiTypeToHighlightName("STRIPE_KEY")).toBe("pii-api-key")
  })

  it("should map GENERIC_API_KEY to pii-api-key", () => {
    expect(piiTypeToHighlightName("GENERIC_API_KEY")).toBe("pii-api-key")
  })

  it("should map OPENAI_KEY to pii-api-key", () => {
    expect(piiTypeToHighlightName("OPENAI_KEY")).toBe("pii-api-key")
  })

  it("should map ANTHROPIC_KEY to pii-api-key", () => {
    expect(piiTypeToHighlightName("ANTHROPIC_KEY")).toBe("pii-api-key")
  })

  it("should map GOOGLE_AI_KEY to pii-api-key", () => {
    expect(piiTypeToHighlightName("GOOGLE_AI_KEY")).toBe("pii-api-key")
  })

  it("should map SLACK_TOKEN to pii-api-key", () => {
    expect(piiTypeToHighlightName("SLACK_TOKEN")).toBe("pii-api-key")
  })

  it("should map PRIVATE_KEY to pii-api-key", () => {
    expect(piiTypeToHighlightName("PRIVATE_KEY")).toBe("pii-api-key")
  })

  it("should map JWT_TOKEN to pii-api-key", () => {
    expect(piiTypeToHighlightName("JWT_TOKEN")).toBe("pii-api-key")
  })

  it("should map IBAN to pii-iban", () => {
    expect(piiTypeToHighlightName("IBAN")).toBe("pii-iban")
  })

  it("should map PASSPORT_US to pii-passport", () => {
    expect(piiTypeToHighlightName("PASSPORT_US")).toBe("pii-passport")
  })

  it("should map DRIVERS_LICENSE to pii-license", () => {
    expect(piiTypeToHighlightName("DRIVERS_LICENSE")).toBe("pii-license")
  })

  it("should map ZIP_CODE to pii-zip", () => {
    expect(piiTypeToHighlightName("ZIP_CODE")).toBe("pii-zip")
  })

  it("should map DATE_OF_BIRTH to pii-dob", () => {
    expect(piiTypeToHighlightName("DATE_OF_BIRTH")).toBe("pii-dob")
  })

  it("should map STREET_ADDRESS to pii-address", () => {
    expect(piiTypeToHighlightName("STREET_ADDRESS")).toBe("pii-address")
  })

  it("should map PERSON_NAME to pii-name", () => {
    expect(piiTypeToHighlightName("PERSON_NAME")).toBe("pii-name")
  })

  it("should map ORGANIZATION to pii-organization", () => {
    expect(piiTypeToHighlightName("ORGANIZATION")).toBe("pii-organization")
  })

  it("should map LOCATION to pii-location", () => {
    expect(piiTypeToHighlightName("LOCATION")).toBe("pii-location")
  })

  it("should map MEDICAL_TERM to pii-medical", () => {
    expect(piiTypeToHighlightName("MEDICAL_TERM")).toBe("pii-medical")
  })

  it("should map unknown types to pii-generic", () => {
    expect(piiTypeToHighlightName("UNKNOWN_TYPE")).toBe("pii-generic")
    expect(piiTypeToHighlightName("")).toBe("pii-generic")
    expect(piiTypeToHighlightName("CUSTOM_ENTITY")).toBe("pii-generic")
  })
})

// ---------------------------------------------------------------------------
// createRangeFromOffsets
// ---------------------------------------------------------------------------

describe("createRangeFromOffsets", () => {
  afterEach(() => {
    document.body.innerHTML = ""
  })

  it("should return a Range for valid start and end indices", () => {
    const mapping = buildMapping("hello world")
    const range = createRangeFromOffsets(mapping, 0, 5)
    expect(range).not.toBeNull()
    expect(range).toBeInstanceOf(Range)
  })

  it("should create a range that covers the correct text", () => {
    const mapping = buildMapping("hello world")
    const range = createRangeFromOffsets(mapping, 6, 11)
    expect(range).not.toBeNull()
    if (range !== null) {
      expect(range.toString()).toBe("world")
    }
  })

  it("should return null when start is negative", () => {
    const mapping = buildMapping("hello")
    expect(createRangeFromOffsets(mapping, -1, 3)).toBeNull()
  })

  it("should return null when end exceeds offsets length", () => {
    const mapping = buildMapping("hello")
    expect(createRangeFromOffsets(mapping, 0, 10)).toBeNull()
  })

  it("should return null when start equals end", () => {
    const mapping = buildMapping("hello")
    expect(createRangeFromOffsets(mapping, 2, 2)).toBeNull()
  })

  it("should return null when start is greater than end", () => {
    const mapping = buildMapping("hello")
    expect(createRangeFromOffsets(mapping, 4, 2)).toBeNull()
  })

  it("should return null when start offset is null", () => {
    const node = document.createTextNode("hello")
    document.body.appendChild(node)
    const mapping: TextMapping = {
      plainText: "\nhello",
      offsets: [
        null, // synthetic newline
        { node, offset: 0 },
        { node, offset: 1 },
        { node, offset: 2 },
        { node, offset: 3 },
        { node, offset: 4 },
      ],
    }
    // start=0 has null offset
    expect(createRangeFromOffsets(mapping, 0, 3)).toBeNull()
  })

  it("should return null when end offset is null", () => {
    const node = document.createTextNode("hello")
    document.body.appendChild(node)
    const mapping: TextMapping = {
      plainText: "hello\n",
      offsets: [
        { node, offset: 0 },
        { node, offset: 1 },
        { node, offset: 2 },
        { node, offset: 3 },
        { node, offset: 4 },
        null, // synthetic newline at index 5
      ],
    }
    // end=6 means end-1=5 which is null
    expect(createRangeFromOffsets(mapping, 0, 6)).toBeNull()
  })

  it("should handle single-character ranges", () => {
    const mapping = buildMapping("abc")
    const range = createRangeFromOffsets(mapping, 1, 2)
    expect(range).not.toBeNull()
    if (range !== null) {
      expect(range.toString()).toBe("b")
    }
  })

  it("should handle range spanning the entire string", () => {
    const text = "test@example.com"
    const mapping = buildMapping(text)
    const range = createRangeFromOffsets(mapping, 0, text.length)
    expect(range).not.toBeNull()
    if (range !== null) {
      expect(range.toString()).toBe(text)
    }
  })

  it("should return null for empty mapping with any indices", () => {
    const mapping: TextMapping = { plainText: "", offsets: [] }
    expect(createRangeFromOffsets(mapping, 0, 1)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// HighlightRenderer
// ---------------------------------------------------------------------------

describe("HighlightRenderer", () => {
  let container: HTMLDivElement
  let renderer: HighlightRenderer

  beforeEach(() => {
    container = document.createElement("div")
    document.body.appendChild(container)
    renderer = new HighlightRenderer(container)
    mockHighlights.clear()
    vi.clearAllMocks()
  })

  afterEach(() => {
    renderer.destroy()
    document.body.innerHTML = ""
  })

  // -------------------------------------------------------------------------
  // update()
  // -------------------------------------------------------------------------

  describe("update()", () => {
    it("should register CSS highlights for matches", () => {
      const mapping = buildMapping("Contact test@example.com today")
      const matches: readonly PIIMatch[] = [buildMatch("EMAIL", 8, 24)]

      renderer.update(matches, mapping)

      expect(CSS.highlights.set).toHaveBeenCalledWith(
        "pii-email",
        expect.any(Object),
      )
    })

    it("should return an empty array when matches is empty", () => {
      const mapping = buildMapping("No PII here")
      const result = renderer.update([], mapping)
      expect(result).toEqual([])
    })

    it("should return BadgePosition[] with correct matchIndex and type", () => {
      const mapping = buildMapping("Contact test@example.com today")
      const matches: readonly PIIMatch[] = [buildMatch("EMAIL", 8, 24, 0.97)]

      const badges = renderer.update(matches, mapping)

      expect(badges).toHaveLength(1)
      expect(badges[0].matchIndex).toBe(0)
      expect(badges[0].type).toBe("EMAIL")
      expect(badges[0].confidence).toBe(0.97)
    })

    it("should group multiple matches of the same highlight name into one Highlight", () => {
      const mapping = buildMapping("Call 555-1234 or 555-5678 please")
      const matches: readonly PIIMatch[] = [
        buildMatch("PHONE_US", 5, 13),
        buildMatch("PHONE_US", 17, 25),
      ]

      renderer.update(matches, mapping)

      // Both PHONE_US matches map to "pii-phone" — should be one CSS.highlights.set call.
      const setCalls = (CSS.highlights.set as ReturnType<typeof vi.fn>).mock.calls
      const phoneCalls = setCalls.filter((c) => c[0] === "pii-phone")
      expect(phoneCalls).toHaveLength(1)
    })

    it("should create separate Highlight objects for different PII types", () => {
      const text = "test@example.com and 123-45-6789"
      const mapping = buildMapping(text)
      const matches: readonly PIIMatch[] = [
        buildMatch("EMAIL", 0, 16),
        buildMatch("SSN", 21, 32),
      ]

      renderer.update(matches, mapping)

      const setCalls = (CSS.highlights.set as ReturnType<typeof vi.fn>).mock.calls
      const names = setCalls.map((c) => c[0])
      expect(names).toContain("pii-email")
      expect(names).toContain("pii-ssn")
    })

    it("should clear previous highlights before registering new ones", () => {
      const mapping1 = buildMapping("test@example.com")
      const matches1: readonly PIIMatch[] = [buildMatch("EMAIL", 0, 16)]
      renderer.update(matches1, mapping1)

      // Verify first registration happened.
      expect(CSS.highlights.set).toHaveBeenCalledWith("pii-email", expect.any(Object))

      vi.clearAllMocks()
      mockHighlights.clear()

      // Second update should delete old highlights first.
      const mapping2 = buildMapping("123-45-6789")
      const matches2: readonly PIIMatch[] = [buildMatch("SSN", 0, 11)]
      renderer.update(matches2, mapping2)

      expect(CSS.highlights.delete).toHaveBeenCalledWith("pii-email")
      expect(CSS.highlights.set).toHaveBeenCalledWith("pii-ssn", expect.any(Object))
    })

    it("should return multiple badge positions for multiple matches", () => {
      const text = "test@example.com and 555-1234"
      const mapping = buildMapping(text)
      const matches: readonly PIIMatch[] = [
        buildMatch("EMAIL", 0, 16),
        buildMatch("PHONE_US", 21, 29),
      ]

      const badges = renderer.update(matches, mapping)

      expect(badges).toHaveLength(2)
      expect(badges[0].type).toBe("EMAIL")
      expect(badges[1].type).toBe("PHONE_US")
    })

    it("should skip matches that produce null ranges", () => {
      const mapping = buildMapping("hello")
      // out-of-range match
      const matches: readonly PIIMatch[] = [buildMatch("EMAIL", 100, 200)]

      const badges = renderer.update(matches, mapping)
      expect(badges).toHaveLength(0)
    })
  })

  // -------------------------------------------------------------------------
  // reposition()
  // -------------------------------------------------------------------------

  describe("reposition()", () => {
    it("should return badge positions for the supplied matches and mapping", () => {
      const mapping = buildMapping("test@example.com")
      const matches: readonly PIIMatch[] = [buildMatch("EMAIL", 0, 16)]

      const badges = renderer.reposition(matches, mapping)

      expect(badges).toHaveLength(1)
      expect(badges[0].matchIndex).toBe(0)
      expect(badges[0].type).toBe("EMAIL")
    })

    it("should return empty array when matches is empty", () => {
      const mapping = buildMapping("hello")
      expect(renderer.reposition([], mapping)).toEqual([])
    })

    it("should return empty array when mapping has no offsets", () => {
      const matches: readonly PIIMatch[] = [buildMatch("EMAIL", 0, 5)]
      const emptyMapping: TextMapping = { plainText: "", offsets: [] }
      expect(renderer.reposition(matches, emptyMapping)).toEqual([])
    })

    it("should not call CSS.highlights.set (no re-registration)", () => {
      const mapping = buildMapping("test@example.com")
      const matches: readonly PIIMatch[] = [buildMatch("EMAIL", 0, 16)]

      vi.clearAllMocks()
      renderer.reposition(matches, mapping)

      expect(CSS.highlights.set).not.toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  // destroy()
  // -------------------------------------------------------------------------

  describe("destroy()", () => {
    it("should clear all registered highlights", () => {
      const mapping = buildMapping("test@example.com")
      const matches: readonly PIIMatch[] = [buildMatch("EMAIL", 0, 16)]
      renderer.update(matches, mapping)

      vi.clearAllMocks()
      renderer.destroy()

      expect(CSS.highlights.delete).toHaveBeenCalledWith("pii-email")
    })

    it("should be safe to call destroy with no prior update", () => {
      expect(() => renderer.destroy()).not.toThrow()
    })

    it("should be safe to call destroy multiple times", () => {
      const mapping = buildMapping("test@example.com")
      const matches: readonly PIIMatch[] = [buildMatch("EMAIL", 0, 16)]
      renderer.update(matches, mapping)

      expect(() => {
        renderer.destroy()
        renderer.destroy()
      }).not.toThrow()
    })

    it("should leave no active highlights after destroy", () => {
      const mapping = buildMapping("test@example.com and 123-45-6789")
      const matches: readonly PIIMatch[] = [
        buildMatch("EMAIL", 0, 16),
        buildMatch("SSN", 21, 32),
      ]
      renderer.update(matches, mapping)
      renderer.destroy()

      // After destroy, a subsequent update on fresh data should work cleanly
      // without any leftover delete calls from prior active set.
      vi.clearAllMocks()
      renderer.destroy() // second destroy should call delete 0 times (nothing left)
      expect(CSS.highlights.delete).not.toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  // Badge position fields
  // -------------------------------------------------------------------------

  describe("BadgePosition fields", () => {
    it("should include rect from getBoundingClientRect", () => {
      const mapping = buildMapping("test@example.com")
      const matches: readonly PIIMatch[] = [buildMatch("EMAIL", 0, 16, 0.9)]

      const badges = renderer.update(matches, mapping)

      expect(badges[0].rect).toBeDefined()
      expect(badges[0].rect).toBeInstanceOf(DOMRect)
    })

    it("should pass through confidence from the match", () => {
      const mapping = buildMapping("test@example.com")
      const matches: readonly PIIMatch[] = [buildMatch("EMAIL", 0, 16, 0.88)]

      const badges = renderer.update(matches, mapping)

      expect(badges[0].confidence).toBe(0.88)
    })
  })
})
