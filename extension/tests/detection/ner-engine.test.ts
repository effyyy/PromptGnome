/**
 * Tests for the NER engine wrapper.
 * Mocks the ner-client service to test timeout handling, error handling,
 * and result conversion without making real network calls.
 * Uses synthetic PII data only — never real names, SSNs, or sensitive values.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Use vi.hoisted() to create mock functions that can be referenced inside the
// vi.mock() factory, which is hoisted above all imports by Vitest.
const { mockAnalyzeTextFn } = vi.hoisted(() => ({
  mockAnalyzeTextFn: vi.fn(),
}))

// Mock the ner-client-port module — ner-engine.ts uses activeNerClientPort.
vi.mock("~src/services/ner-client-port", () => ({
  activeNerClientPort: {
    analyzeText: mockAnalyzeTextFn,
  },
  noopNerClientPort: {
    analyzeText: async () => null,
  },
}))

// Mock the local-ner-client module
vi.mock("~src/services/local-ner-client", () => ({
  analyzeTextLocally: vi.fn(),
}))

// Mock the logger to suppress console output in tests
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

import { detectWithNER } from "../../src/detection/ner-engine"
import { analyzeTextLocally } from "~src/services/local-ner-client"
import type { PIIMatch } from "../../src/detection/types"
import type { Settings } from "../../src/shared/schemas"

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

/** Minimal Settings object with NER enabled and consent given. */
const makeSettings = (overrides: Partial<Settings> = {}): Settings => ({
  protectionEnabled: true,
  enabledTypes: {} as Settings["enabledTypes"],
  enabledProviders: {} as Settings["enabledProviders"],
  behaviorMode: "warn",
  confidenceThreshold: 0.7,
  telemetryEnabled: false,
  nerBackendEnabled: true,
  nerBackendConsent: true,
  nerEndpoint: "https://api.promptgnome.com/v1/analyze",
  ...overrides,
})

/** A synthetic NER match for a person name. */
const makeNERMatch = (overrides: Partial<PIIMatch> = {}): PIIMatch => ({
  type: "PERSON_NAME",
  value: "Jane Testperson",
  start: 11,
  end: 26,
  confidence: 0.94,
  source: "ner",
  ...overrides,
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockAnalyzeText = mockAnalyzeTextFn
const mockAnalyzeTextLocally = analyzeTextLocally as ReturnType<typeof vi.fn>

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("detectWithNER", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // By default, local NER is unavailable — tests focus on backend path
    mockAnalyzeTextLocally.mockResolvedValue(null)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ── Successful detection ─────────────────────────────────────────────────

  describe("successful detection", () => {
    it("should return PIIMatch array when NER client succeeds", async () => {
      const match = makeNERMatch()
      mockAnalyzeText.mockResolvedValue([match])

      const result = await detectWithNER(
        "My name is Jane Testperson",
        makeSettings(),
      )

      expect(result).toHaveLength(1)
      expect(result[0].type).toBe("PERSON_NAME")
      expect(result[0].source).toBe("ner")
      expect(result[0].confidence).toBe(0.94)
    })

    it("should return empty array when NER client finds no entities", async () => {
      mockAnalyzeText.mockResolvedValue([])

      const result = await detectWithNER(
        "There is no PII here",
        makeSettings(),
      )

      expect(result).toHaveLength(0)
    })

    it("should return multiple matches when NER finds several entities", async () => {
      const matches: PIIMatch[] = [
        makeNERMatch({ type: "PERSON_NAME", value: "Jane Testperson", start: 11, end: 26 }),
        makeNERMatch({ type: "ORGANIZATION", value: "Acme Corp", start: 30, end: 39, confidence: 0.88 }),
      ]
      mockAnalyzeText.mockResolvedValue(matches)

      const result = await detectWithNER(
        "My name is Jane Testperson at Acme Corp",
        makeSettings(),
      )

      expect(result).toHaveLength(2)
    })

    it("should enforce source: 'ner' on all returned matches", async () => {
      // ner-client should already set source: "ner", but the engine re-enforces it
      const matchWithWrongSource = makeNERMatch({ source: "regex" as "ner" })
      mockAnalyzeText.mockResolvedValue([matchWithWrongSource])

      const result = await detectWithNER(
        "My name is Jane Testperson",
        makeSettings(),
      )

      expect(result[0].source).toBe("ner")
    })

    it("should pass the settings object through to analyzeText", async () => {
      mockAnalyzeText.mockResolvedValue([])
      const settings = makeSettings({ nerEndpoint: "https://custom.example.com/v1/analyze" })

      await detectWithNER("Some text", settings)

      expect(mockAnalyzeText).toHaveBeenCalledWith("Some text", settings)
    })

    it("should preserve confidence values exactly from NER client", async () => {
      const match = makeNERMatch({ confidence: 0.77 })
      mockAnalyzeText.mockResolvedValue([match])

      const result = await detectWithNER("My name is Jane Testperson", makeSettings())

      expect(result[0].confidence).toBe(0.77)
    })

    it("should preserve start/end offsets from NER client", async () => {
      const match = makeNERMatch({ start: 5, end: 20 })
      mockAnalyzeText.mockResolvedValue([match])

      const result = await detectWithNER("My name is Jane Testperson", makeSettings())

      expect(result[0].start).toBe(5)
      expect(result[0].end).toBe(20)
    })
  })

  // ── Null / gate responses ─────────────────────────────────────────────────

  describe("when NER client returns null (consent gate / rate limit)", () => {
    it("should return empty array when analyzeText returns null", async () => {
      mockAnalyzeText.mockResolvedValue(null)

      const result = await detectWithNER("My name is Jane Testperson", makeSettings())

      expect(result).toHaveLength(0)
    })

    it("should not throw when analyzeText returns null", async () => {
      mockAnalyzeText.mockResolvedValue(null)

      await expect(
        detectWithNER("Some text", makeSettings()),
      ).resolves.not.toThrow()
    })
  })

  // ── Timeout handling ──────────────────────────────────────────────────────

  describe("timeout handling", () => {
    it("should return empty array when NER exceeds the timeout", async () => {
      // Simulate a very slow backend response
      mockAnalyzeText.mockImplementation(
        () => new Promise<PIIMatch[]>((resolve) => setTimeout(() => resolve([makeNERMatch()]), 5000)),
      )

      const result = await detectWithNER(
        "My name is Jane Testperson",
        makeSettings(),
        "balanced",
        50, // 50ms timeout — much shorter than the 5s mock delay
      )

      expect(result).toHaveLength(0)
    })

    it("should complete quickly when timeout fires before backend responds", async () => {
      mockAnalyzeText.mockImplementation(
        () => new Promise<PIIMatch[]>((resolve) => setTimeout(() => resolve([]), 2000)),
      )

      const start = Date.now()
      await detectWithNER("Some text", makeSettings(), "balanced", 30)
      const elapsed = Date.now() - start

      // Should resolve well under the mock delay (2s)
      expect(elapsed).toBeLessThan(500)
    })

    it("should use the default 800ms timeout when none is provided", async () => {
      // The timeout parameter defaults to 800ms; the mock returns quickly so
      // the default path is exercised without actually waiting 800ms
      mockAnalyzeText.mockResolvedValue([makeNERMatch()])

      const result = await detectWithNER("My name is Jane Testperson", makeSettings())

      expect(result).toHaveLength(1)
    })
  })

  // ── Error handling (fail-open) ────────────────────────────────────────────

  describe("error handling (fail-open)", () => {
    it("should return empty array when analyzeText rejects", async () => {
      mockAnalyzeText.mockRejectedValue(new Error("Network error"))

      const result = await detectWithNER("My name is Jane Testperson", makeSettings())

      expect(result).toHaveLength(0)
    })

    it("should not throw when analyzeText rejects", async () => {
      mockAnalyzeText.mockRejectedValue(new TypeError("Unexpected token"))

      await expect(
        detectWithNER("Some text", makeSettings()),
      ).resolves.not.toThrow()
    })

    it("should return empty array when analyzeText throws synchronously", async () => {
      mockAnalyzeText.mockImplementation(() => {
        throw new Error("Sync error")
      })

      const result = await detectWithNER("Some text", makeSettings())

      expect(result).toHaveLength(0)
    })

    it("should return empty array for empty input text", async () => {
      mockAnalyzeText.mockResolvedValue([])

      const result = await detectWithNER("", makeSettings())

      expect(result).toHaveLength(0)
    })

    it("should never propagate exceptions to the caller", async () => {
      mockAnalyzeText.mockRejectedValue(new RangeError("Out of bounds"))

      let threw = false
      try {
        await detectWithNER("Any text", makeSettings())
      } catch {
        threw = true
      }

      expect(threw).toBe(false)
    })
  })

  // ── Consent / settings gating ─────────────────────────────────────────────

  describe("settings propagation", () => {
    it("should not call backend when nerBackendEnabled=false", async () => {
      mockAnalyzeText.mockResolvedValue(null)
      const settings = makeSettings({ nerBackendEnabled: false })

      const result = await detectWithNER("My name is Jane Testperson", settings)

      // Engine gates backend access — backend should NOT be called
      expect(mockAnalyzeText).not.toHaveBeenCalled()
      expect(result).toHaveLength(0)
    })

    it("should return empty array when analyzeText returns null due to consent gate", async () => {
      mockAnalyzeText.mockResolvedValue(null)
      const settings = makeSettings({ nerBackendConsent: false })

      const result = await detectWithNER("Some text", settings)

      expect(result).toHaveLength(0)
    })
  })

  // ── Local-first NER strategy ────────────────────────────────────────────

  describe("local-first NER strategy", () => {
    it("should use local NER results when available", async () => {
      const localMatch = makeNERMatch({ value: "Jane Testperson", confidence: 0.92 })
      mockAnalyzeTextLocally.mockResolvedValue([localMatch])

      const result = await detectWithNER("My name is Jane Testperson", makeSettings())

      expect(result).toHaveLength(1)
      expect(result[0].source).toBe("ner")
      expect(result[0].confidence).toBe(0.92)
      // Backend should NOT be called when local succeeds
      expect(mockAnalyzeText).not.toHaveBeenCalled()
    })

    it("should fall back to backend when local NER returns null", async () => {
      mockAnalyzeTextLocally.mockResolvedValue(null)
      mockAnalyzeText.mockResolvedValue([makeNERMatch()])

      const result = await detectWithNER("My name is Jane Testperson", makeSettings())

      expect(result).toHaveLength(1)
      expect(mockAnalyzeText).toHaveBeenCalled()
    })

    it("should fall back to backend when local NER throws", async () => {
      mockAnalyzeTextLocally.mockRejectedValue(new Error("Local NER crashed"))
      mockAnalyzeText.mockResolvedValue([makeNERMatch()])

      const result = await detectWithNER("My name is Jane Testperson", makeSettings())

      expect(result).toHaveLength(1)
      expect(mockAnalyzeText).toHaveBeenCalled()
    })

    it("should trust local NER empty result and not fall back to backend (privacy)", async () => {
      mockAnalyzeTextLocally.mockResolvedValue([])
      mockAnalyzeText.mockResolvedValue([makeNERMatch()])

      const result = await detectWithNER("My name is Jane Testperson", makeSettings())

      // Local NER ran successfully (empty = no PII found). Trust it.
      // Backend should NOT be called — preserves privacy.
      expect(result).toHaveLength(0)
      expect(mockAnalyzeText).not.toHaveBeenCalled()
    })

    it("should return empty array when both local and backend fail", async () => {
      mockAnalyzeTextLocally.mockResolvedValue(null)
      mockAnalyzeText.mockResolvedValue(null)

      const result = await detectWithNER("My name is Jane Testperson", makeSettings())

      expect(result).toHaveLength(0)
    })
  })
})
