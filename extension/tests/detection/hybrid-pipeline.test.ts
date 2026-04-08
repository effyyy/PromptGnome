/**
 * Tests for the hybrid detection pipeline.
 * Mocks both the regex engine and NER engine to exercise the merge, deduplication,
 * confidence threshold, code-block filter, and timing logic in isolation.
 * Uses synthetic PII data only — never real names, SSNs, or sensitive values.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock dependencies before importing the module under test
vi.mock("../../src/detection/regex-engine", () => ({
  detectPII: vi.fn(),
}))

vi.mock("../../src/detection/ner-engine", () => ({
  detectWithNER: vi.fn(),
}))

vi.mock("~src/utils/logger", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    group: vi.fn(),
    groupEnd: vi.fn(),
  }),
}))

import { detectPII, type DetectionOptions } from "../../src/detection/hybrid-pipeline"
import { detectPII as detectWithRegex } from "../../src/detection/regex-engine"
import { detectWithNER } from "../../src/detection/ner-engine"
import type { PIIMatch } from "../../src/detection/types"
import type { Settings } from "../../src/shared/schemas"

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const makeSettings = (overrides: Partial<Settings> = {}): Settings => ({
  protectionEnabled: true,
  enabledTypes: {} as Settings["enabledTypes"],
  enabledProviders: {} as Settings["enabledProviders"],
  behaviorMode: "warn",
  confidenceThreshold: 0.7,
  telemetryEnabled: false,
  nerBackendEnabled: true,
  nerBackendConsent: true,
  nerEndpoint: "https://ner.test.invalid/v1/analyze",
  ...overrides,
})

const makeMatch = (overrides: Partial<PIIMatch> = {}): PIIMatch => ({
  type: "EMAIL",
  value: "test@example.com",
  start: 0,
  end: 16,
  confidence: 0.95,
  source: "regex",
  ...overrides,
})

const freeOptions: DetectionOptions = { useNER: false }
const proOptions = (settings: Settings): DetectionOptions => ({
  useNER: true,
  settings,
  nerTimeoutMs: 800,
  confidenceThreshold: 0.7,
})

const mockRegex = detectWithRegex as ReturnType<typeof vi.fn>
const mockNER = detectWithNER as ReturnType<typeof vi.fn>

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("detectPII (hybrid pipeline)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Free tier (regex only) ───────────────────────────────────────────────

  describe("free tier — regex only", () => {
    it("should return regex matches when useNER is false", async () => {
      const match = makeMatch()
      mockRegex.mockReturnValue([match])

      const result = await detectPII("test@example.com", freeOptions)

      expect(result.matches).toHaveLength(1)
      expect(result.matches[0].type).toBe("EMAIL")
    })

    it("should NOT call the NER engine when useNER is false", async () => {
      mockRegex.mockReturnValue([])

      await detectPII("Some text", freeOptions)

      expect(mockNER).not.toHaveBeenCalled()
    })

    it("should set nerTimeMs to null for free-tier calls", async () => {
      mockRegex.mockReturnValue([])

      const result = await detectPII("Some text", freeOptions)

      expect(result.nerTimeMs).toBeNull()
    })

    it("should return empty matches when regex finds nothing", async () => {
      mockRegex.mockReturnValue([])

      const result = await detectPII("No PII here", freeOptions)

      expect(result.matches).toHaveLength(0)
    })

    it("should include textLength in the result", async () => {
      mockRegex.mockReturnValue([])
      const text = "Hello world"

      const result = await detectPII(text, freeOptions)

      expect(result.textLength).toBe(text.length)
    })

    it("should include regexTimeMs as a non-negative number", async () => {
      mockRegex.mockReturnValue([])

      const result = await detectPII("Some text", freeOptions)

      expect(result.regexTimeMs).toBeGreaterThanOrEqual(0)
    })

    it("should include processingTimeMs as a non-negative number", async () => {
      mockRegex.mockReturnValue([])

      const result = await detectPII("Some text", freeOptions)

      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0)
    })
  })

  // ── Pro tier (regex + NER) ───────────────────────────────────────────────

  describe("pro tier — regex + NER", () => {
    it("should call both regex and NER engines when useNER is true", async () => {
      mockRegex.mockReturnValue([])
      mockNER.mockResolvedValue([])
      const settings = makeSettings()

      await detectPII("Jane Testperson lives in Springfield", proOptions(settings))

      expect(mockRegex).toHaveBeenCalledOnce()
      expect(mockNER).toHaveBeenCalledOnce()
    })

    it("should pass settings to the NER engine", async () => {
      mockRegex.mockReturnValue([])
      mockNER.mockResolvedValue([])
      const settings = makeSettings()

      await detectPII("Some text", proOptions(settings))

      expect(mockNER).toHaveBeenCalledWith(
        "Some text",
        settings,
        "balanced",
        expect.any(Number),
      )
    })

    it("should include NER-only matches in the result", async () => {
      mockRegex.mockReturnValue([])
      const nerMatch = makeMatch({ type: "PERSON_NAME", value: "Jane Testperson", source: "ner", confidence: 0.94 })
      mockNER.mockResolvedValue([nerMatch])

      const result = await detectPII("Jane Testperson", proOptions(makeSettings()))

      expect(result.matches).toHaveLength(1)
      expect(result.matches[0].type).toBe("PERSON_NAME")
      expect(result.matches[0].source).toBe("ner")
    })

    it("should include nerTimeMs as a non-negative number when NER runs", async () => {
      mockRegex.mockReturnValue([])
      mockNER.mockResolvedValue([])

      const result = await detectPII("Some text", proOptions(makeSettings()))

      expect(result.nerTimeMs).not.toBeNull()
      expect(result.nerTimeMs).toBeGreaterThanOrEqual(0)
    })

    it("should include regex-only matches even when NER finds nothing new", async () => {
      const regexMatch = makeMatch()
      mockRegex.mockReturnValue([regexMatch])
      mockNER.mockResolvedValue([])

      const result = await detectPII("test@example.com", proOptions(makeSettings()))

      expect(result.matches).toHaveLength(1)
      expect(result.matches[0].source).toBe("regex")
    })
  })

  // ── Deduplication of overlapping spans ───────────────────────────────────

  describe("deduplication of overlapping spans", () => {
    it("should merge overlapping regex and NER matches into source 'both'", async () => {
      const regexMatch = makeMatch({
        type: "EMAIL",
        value: "test@example.com",
        start: 0,
        end: 16,
        confidence: 0.95,
        source: "regex",
      })
      const nerMatch = makeMatch({
        type: "EMAIL",
        value: "test@example.com",
        start: 0,
        end: 16,
        confidence: 0.90,
        source: "ner",
      })
      mockRegex.mockReturnValue([regexMatch])
      mockNER.mockResolvedValue([nerMatch])

      const result = await detectPII("test@example.com", proOptions(makeSettings()))

      expect(result.matches).toHaveLength(1)
      expect(result.matches[0].source).toBe("both")
    })

    it("should use max(regex, NER) confidence for merged 'both' matches", async () => {
      const regexMatch = makeMatch({ start: 0, end: 16, confidence: 0.95, source: "regex" })
      const nerMatch = makeMatch({ start: 0, end: 16, confidence: 0.99, source: "ner" })
      mockRegex.mockReturnValue([regexMatch])
      mockNER.mockResolvedValue([nerMatch])

      const result = await detectPII("test@example.com", proOptions(makeSettings()))

      expect(result.matches[0].confidence).toBe(0.99)
    })

    it("should prefer regex confidence when it is higher than NER", async () => {
      const regexMatch = makeMatch({ start: 0, end: 16, confidence: 0.98, source: "regex" })
      const nerMatch = makeMatch({ start: 0, end: 16, confidence: 0.75, source: "ner" })
      mockRegex.mockReturnValue([regexMatch])
      mockNER.mockResolvedValue([nerMatch])

      const result = await detectPII("test@example.com", proOptions(makeSettings()))

      expect(result.matches[0].confidence).toBe(0.98)
    })

    it("should not deduplicate non-overlapping matches", async () => {
      const regexMatch = makeMatch({ type: "EMAIL", start: 0, end: 16, source: "regex" })
      const nerMatch = makeMatch({ type: "PERSON_NAME", start: 20, end: 35, source: "ner" })
      mockRegex.mockReturnValue([regexMatch])
      mockNER.mockResolvedValue([nerMatch])

      const result = await detectPII(
        "test@example.com has Jane Testperson",
        proOptions(makeSettings()),
      )

      expect(result.matches).toHaveLength(2)
    })

    it("should handle overlapping regex-only matches by keeping higher confidence", async () => {
      const high = makeMatch({ type: "EMAIL", start: 0, end: 20, confidence: 0.95, source: "regex" })
      const low = makeMatch({ type: "EMAIL", start: 5, end: 20, confidence: 0.80, source: "regex" })
      mockRegex.mockReturnValue([high, low])
      mockNER.mockResolvedValue([])

      const result = await detectPII("test@example.com extra", proOptions(makeSettings()))

      expect(result.matches).toHaveLength(1)
      expect(result.matches[0].confidence).toBe(0.95)
    })
  })

  // ── Confidence threshold filtering ───────────────────────────────────────

  describe("confidence threshold filtering", () => {
    it("should exclude matches below the confidence threshold", async () => {
      const lowConfidence = makeMatch({ confidence: 0.50 })
      mockRegex.mockReturnValue([lowConfidence])

      const result = await detectPII("test@example.com", {
        useNER: false,
        confidenceThreshold: 0.7,
      })

      expect(result.matches).toHaveLength(0)
    })

    it("should include matches at exactly the confidence threshold", async () => {
      const match = makeMatch({ confidence: 0.7 })
      mockRegex.mockReturnValue([match])

      const result = await detectPII("test@example.com", {
        useNER: false,
        confidenceThreshold: 0.7,
      })

      expect(result.matches).toHaveLength(1)
    })

    it("should include matches above the confidence threshold", async () => {
      const match = makeMatch({ confidence: 0.95 })
      mockRegex.mockReturnValue([match])

      const result = await detectPII("test@example.com", {
        useNER: false,
        confidenceThreshold: 0.7,
      })

      expect(result.matches).toHaveLength(1)
    })

    it("should use the default 0.7 threshold when none is provided", async () => {
      const belowDefault = makeMatch({ confidence: 0.65 })
      const aboveDefault = makeMatch({ type: "SSN", value: "123-45-6789", start: 20, end: 31, confidence: 0.75, source: "regex" })
      mockRegex.mockReturnValue([belowDefault, aboveDefault])

      const result = await detectPII("test@example.com 123-45-6789", freeOptions)

      expect(result.matches).toHaveLength(1)
      expect(result.matches[0].type).toBe("SSN")
    })

    it("should keep all matches when threshold is 0", async () => {
      const veryLow = makeMatch({ confidence: 0.1 })
      mockRegex.mockReturnValue([veryLow])

      const result = await detectPII("test@example.com", {
        useNER: false,
        confidenceThreshold: 0,
      })

      expect(result.matches).toHaveLength(1)
    })
  })

  // ── Code-block filter ─────────────────────────────────────────────────────

  describe("code-block filter", () => {
    it("should filter out matches inside fenced code blocks", async () => {
      // The regex engine mock returns a match whose span falls inside a code fence.
      // The real filterCodeBlocks function runs on the real text, so we need
      // the match positions to correspond to the text.
      const codeText = "```\ntest@example.com\n```"
      // Email starts at index 4 (after "```\n"), ends at 4+16=20
      const matchInsideCode = makeMatch({ start: 4, end: 20, confidence: 0.95 })
      mockRegex.mockReturnValue([matchInsideCode])

      const result = await detectPII(codeText, freeOptions)

      expect(result.matches).toHaveLength(0)
    })

    it("should keep matches outside code blocks", async () => {
      const text = "Email: test@example.com. Code: ```api_key=abc123```"
      // Match the email which is outside the code block (start=7, end=23)
      const emailMatch = makeMatch({ start: 7, end: 23, confidence: 0.95 })
      mockRegex.mockReturnValue([emailMatch])

      const result = await detectPII(text, freeOptions)

      expect(result.matches).toHaveLength(1)
    })
  })

  // ── Fail-open error handling ──────────────────────────────────────────────

  describe("fail-open error handling", () => {
    it("should return empty matches instead of throwing when regex engine throws", async () => {
      mockRegex.mockImplementation(() => { throw new Error("Regex exploded") })

      await expect(detectPII("Some text", freeOptions)).resolves.not.toThrow()
    })

    it("should return an empty DetectionResult when regex engine throws", async () => {
      mockRegex.mockImplementation(() => { throw new Error("Regex exploded") })

      const result = await detectPII("Some text", freeOptions)

      expect(result.matches).toHaveLength(0)
      expect(result.textLength).toBe(9)
    })

    it("should fall back to regex-only results when NER engine throws", async () => {
      const regexMatch = makeMatch()
      mockRegex.mockReturnValue([regexMatch])
      mockNER.mockRejectedValue(new Error("NER exploded"))

      const result = await detectPII("test@example.com", proOptions(makeSettings()))

      expect(result.matches).toHaveLength(1)
      expect(result.matches[0].source).toBe("regex")
    })

    it("should never throw regardless of input", async () => {
      mockRegex.mockImplementation(() => { throw new RangeError("Stack overflow") })
      mockNER.mockRejectedValue(new TypeError("Network error"))

      let threw = false
      try {
        await detectPII("Any text at all", proOptions(makeSettings()))
      } catch {
        threw = true
      }

      expect(threw).toBe(false)
    })
  })

  // ── Timing metadata ───────────────────────────────────────────────────────

  describe("timing metadata", () => {
    it("should report processingTimeMs as a non-negative integer", async () => {
      mockRegex.mockReturnValue([])

      const result = await detectPII("Some text", freeOptions)

      expect(Number.isInteger(result.processingTimeMs)).toBe(true)
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0)
    })

    it("should report regexTimeMs as a non-negative integer", async () => {
      mockRegex.mockReturnValue([])

      const result = await detectPII("Some text", freeOptions)

      expect(Number.isInteger(result.regexTimeMs)).toBe(true)
      expect(result.regexTimeMs).toBeGreaterThanOrEqual(0)
    })

    it("should report nerTimeMs as null in free-tier mode", async () => {
      mockRegex.mockReturnValue([])

      const result = await detectPII("Some text", { useNER: false })

      expect(result.nerTimeMs).toBeNull()
    })

    it("should report nerTimeMs as a non-negative integer in pro-tier mode", async () => {
      mockRegex.mockReturnValue([])
      mockNER.mockResolvedValue([])

      const result = await detectPII("Some text", proOptions(makeSettings()))

      expect(result.nerTimeMs).not.toBeNull()
      expect(Number.isInteger(result.nerTimeMs)).toBe(true)
      expect(result.nerTimeMs).toBeGreaterThanOrEqual(0)
    })

    it("should report processingTimeMs >= regexTimeMs", async () => {
      mockRegex.mockReturnValue([])

      const result = await detectPII("Some text", freeOptions)

      expect(result.processingTimeMs).toBeGreaterThanOrEqual(result.regexTimeMs)
    })

    it("should report textLength matching the input text length", async () => {
      mockRegex.mockReturnValue([])
      const text = "This is a test sentence."

      const result = await detectPII(text, freeOptions)

      expect(result.textLength).toBe(text.length)
    })
  })

  // ── Edge cases ────────────────────────────────────────────────────────────

  describe("edge cases", () => {
    it("should handle empty input text without throwing", async () => {
      mockRegex.mockReturnValue([])

      const result = await detectPII("", freeOptions)

      expect(result.matches).toHaveLength(0)
      expect(result.textLength).toBe(0)
    })

    it("should handle very long text without throwing", async () => {
      mockRegex.mockReturnValue([])
      const longText = "a".repeat(50_000)

      await expect(detectPII(longText, freeOptions)).resolves.not.toThrow()
    })

    it("should use pro-tier NER even when NER returns empty results", async () => {
      mockRegex.mockReturnValue([makeMatch()])
      mockNER.mockResolvedValue([])

      const result = await detectPII("test@example.com", proOptions(makeSettings()))

      expect(result.matches).toHaveLength(1)
      expect(mockNER).toHaveBeenCalledOnce()
    })

    it("should not call NER when useNER is true but settings is undefined", async () => {
      mockRegex.mockReturnValue([])

      // settings is undefined — NER should not be called
      const result = await detectPII("Some text", { useNER: true })

      expect(mockNER).not.toHaveBeenCalled()
      expect(result.nerTimeMs).toBeNull()
    })
  })
})
