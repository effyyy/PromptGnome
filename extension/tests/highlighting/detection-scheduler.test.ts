/**
 * Tests for src/highlighting/detection-scheduler.ts
 *
 * Covers: immediate regex emission, empty results, NER debounce for Pro users,
 * debounce reset on rapid changes, no NER for free users, no callbacks after
 * destroy, allowlist filtering, NER timeout, and match merging/deduplication.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// ---------------------------------------------------------------------------
// Mock regex-engine BEFORE importing the module under test
// ---------------------------------------------------------------------------

vi.mock("~src/detection/regex-engine", () => ({
  detectPII: vi.fn((text: string) => {
    const matches: Array<{
      type: string
      value: string
      start: number
      end: number
      confidence: number
      source: "regex"
    }> = []
    const emailRegex = /[\w.-]+@[\w.-]+\.\w+/g
    let m: RegExpExecArray | null
    while ((m = emailRegex.exec(text)) !== null) {
      matches.push({
        type: "EMAIL",
        value: m[0],
        start: m.index,
        end: m.index + m[0].length,
        confidence: 0.95,
        source: "regex",
      })
    }
    return matches
  }),
}))

// ---------------------------------------------------------------------------
// Mock chrome.runtime BEFORE importing the module under test
// ---------------------------------------------------------------------------

let sendMessageImpl: (
  message: unknown,
  callback: (response: unknown) => void,
) => void = (_msg, cb) => cb({ matches: [] })

vi.stubGlobal("chrome", {
  runtime: {
    sendMessage: vi.fn(
      (message: unknown, callback: (response: unknown) => void) => {
        sendMessageImpl(message, callback)
      },
    ),
    lastError: null as null | { message: string },
  },
})

// ---------------------------------------------------------------------------
// Import module under test + helpers (after mocks are in place)
// ---------------------------------------------------------------------------

import {
  createDetectionScheduler,
  mergeMatches,
} from "../../src/highlighting/detection-scheduler"
import type { DetectionSchedulerOptions } from "../../src/highlighting/detection-scheduler"
import type { PIIMatch } from "../../src/detection/types"
import type { TextMapping, OnMatchesCallback } from "../../src/highlighting/types"
import { detectPII } from "~src/detection/regex-engine"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a minimal TextMapping for a plain string with no DOM node offsets.
 */
function makeMapping(plainText: string): TextMapping {
  return {
    plainText,
    offsets: Array.from({ length: plainText.length }, () => null),
  }
}

/**
 * Creates a basic PIIMatch for testing.
 */
function makeMatch(
  overrides: Partial<PIIMatch> & Pick<PIIMatch, "value" | "start" | "end">,
): PIIMatch {
  return {
    type: "EMAIL",
    confidence: 0.95,
    source: "regex",
    ...overrides,
  }
}

/**
 * Builds a DetectionSchedulerOptions with sensible defaults.
 */
function makeOptions(
  overrides: Partial<DetectionSchedulerOptions> & { onMatches: OnMatchesCallback },
): DetectionSchedulerOptions {
  return {
    isProUser: false,
    allowlist: null,
    ...overrides,
  }
}

/**
 * Flushes the microtask queue by awaiting multiple rounds of Promise.resolve().
 * Needed because emitFiltered is async and may chain several awaits.
 */
async function flushMicrotasks(rounds = 5): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await Promise.resolve()
  }
}

// ---------------------------------------------------------------------------
// beforeEach / afterEach
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()

  // Default: NER responds with empty matches immediately
  sendMessageImpl = (_msg, cb) => cb({ matches: [] })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(chrome.runtime as any).lastError = null
})

afterEach(() => {
  vi.useRealTimers()
})

// ---------------------------------------------------------------------------
// createDetectionScheduler — regex detection
// ---------------------------------------------------------------------------

describe("createDetectionScheduler", () => {
  describe("regex detection", () => {
    it("should call onMatches with regex results when text contains PII", async () => {
      const onMatches = vi.fn()
      const scheduler = createDetectionScheduler(
        makeOptions({ onMatches, isProUser: false }),
      )
      const mapping = makeMapping("Contact: test@example.com")

      scheduler.handleTextChange(mapping)
      await flushMicrotasks()

      expect(onMatches).toHaveBeenCalledOnce()
      const [matches, calledMapping] = onMatches.mock.calls[0] as [PIIMatch[], TextMapping]
      expect(matches).toHaveLength(1)
      expect(matches[0].type).toBe("EMAIL")
      expect(matches[0].value).toBe("test@example.com")
      expect(calledMapping).toBe(mapping)
      scheduler.destroy()
    })

    it("should emit empty matches for text with no PII", async () => {
      const onMatches = vi.fn()
      const scheduler = createDetectionScheduler(
        makeOptions({ onMatches, isProUser: false }),
      )

      scheduler.handleTextChange(makeMapping("Hello, how are you?"))
      await flushMicrotasks()

      expect(onMatches).toHaveBeenCalledOnce()
      const [matches] = onMatches.mock.calls[0] as [PIIMatch[], TextMapping]
      expect(matches).toHaveLength(0)
      scheduler.destroy()
    })

    it("should call detectPII with the plain text", async () => {
      const onMatches = vi.fn()
      const scheduler = createDetectionScheduler(makeOptions({ onMatches }))
      const mapping = makeMapping("test@example.com")

      scheduler.handleTextChange(mapping)
      await flushMicrotasks()

      expect(detectPII).toHaveBeenCalledWith("test@example.com")
      scheduler.destroy()
    })

    it("should emit empty matches when detectPII throws (fail-open)", async () => {
      const detectPIIMock = vi.mocked(detectPII)
      detectPIIMock.mockImplementationOnce(() => {
        throw new Error("unexpected failure")
      })

      const onMatches = vi.fn()
      const scheduler = createDetectionScheduler(makeOptions({ onMatches }))

      scheduler.handleTextChange(makeMapping("some text"))
      await flushMicrotasks()

      expect(onMatches).toHaveBeenCalledOnce()
      const [matches] = onMatches.mock.calls[0] as [PIIMatch[], TextMapping]
      expect(matches).toHaveLength(0)
      scheduler.destroy()
    })
  })

  // -------------------------------------------------------------------------
  // NER debounce — Pro users
  // -------------------------------------------------------------------------

  describe("NER debounce (Pro users)", () => {
    it("should schedule NER after 500ms debounce for Pro users", async () => {
      let nerCallCount = 0
      sendMessageImpl = (_msg, cb) => {
        nerCallCount++
        cb({ matches: [] })
      }

      const onMatches = vi.fn()
      const scheduler = createDetectionScheduler(
        makeOptions({ onMatches, isProUser: true }),
      )

      scheduler.handleTextChange(makeMapping("email@example.com"))
      await flushMicrotasks()

      // NER should not have fired yet (debounce not elapsed)
      expect(nerCallCount).toBe(0)

      // Advance past debounce threshold
      await vi.advanceTimersByTimeAsync(500)
      await flushMicrotasks()

      expect(nerCallCount).toBe(1)
      scheduler.destroy()
    })

    it("should reset the NER debounce timer on rapid text changes", async () => {
      let nerCallCount = 0
      sendMessageImpl = (_msg, cb) => {
        nerCallCount++
        cb({ matches: [] })
      }

      const onMatches = vi.fn()
      const scheduler = createDetectionScheduler(
        makeOptions({ onMatches, isProUser: true }),
      )

      // Three rapid changes within the debounce window
      scheduler.handleTextChange(makeMapping("a"))
      await vi.advanceTimersByTimeAsync(100)
      scheduler.handleTextChange(makeMapping("ab"))
      await vi.advanceTimersByTimeAsync(100)
      scheduler.handleTextChange(makeMapping("abc"))
      await vi.advanceTimersByTimeAsync(100)

      // NER should not have fired yet (each change resets the timer)
      expect(nerCallCount).toBe(0)

      // Now advance past the debounce
      await vi.advanceTimersByTimeAsync(500)
      await flushMicrotasks()

      // Should have fired exactly once (for the last text)
      expect(nerCallCount).toBe(1)
      scheduler.destroy()
    })

    it("should send SCAN_REQUEST with the current text to the service worker", async () => {
      const capturedMessages: unknown[] = []
      sendMessageImpl = (msg, cb) => {
        capturedMessages.push(msg)
        cb({ matches: [] })
      }

      const onMatches = vi.fn()
      const scheduler = createDetectionScheduler(
        makeOptions({ onMatches, isProUser: true }),
      )

      scheduler.handleTextChange(makeMapping("user@test.com"))
      await vi.advanceTimersByTimeAsync(500)
      await flushMicrotasks()

      expect(capturedMessages).toHaveLength(1)
      expect(capturedMessages[0]).toMatchObject({
        type: "SCAN_REQUEST",
        text: "user@test.com",
        provider: "unknown",
      })
      scheduler.destroy()
    })

    it("should propagate the configured provider in SCAN_REQUEST", async () => {
      const capturedMessages: unknown[] = []
      sendMessageImpl = (msg, cb) => {
        capturedMessages.push(msg)
        cb({ matches: [] })
      }

      const onMatches = vi.fn()
      const scheduler = createDetectionScheduler(
        makeOptions({ onMatches, isProUser: true, provider: "CHATGPT" }),
      )

      scheduler.handleTextChange(makeMapping("user@test.com"))
      await vi.advanceTimersByTimeAsync(500)
      await flushMicrotasks()

      expect(capturedMessages).toHaveLength(1)
      expect(capturedMessages[0]).toMatchObject({
        type: "SCAN_REQUEST",
        text: "user@test.com",
        provider: "CHATGPT",
      })
      scheduler.destroy()
    })

    it("should discard NER result if text changed before NER responded", async () => {
      // Simulate slow NER: hold the callback until we manually release it
      // Typed as a mutable ref so TypeScript tracks closure-assigned value.
      const nerState: { resolve: ((response: unknown) => void) | null } = { resolve: null }
      sendMessageImpl = (_msg, cb) => {
        nerState.resolve = cb
      }

      const onMatches = vi.fn()
      const scheduler = createDetectionScheduler(
        makeOptions({ onMatches, isProUser: true }),
      )

      // First change — triggers debounce
      scheduler.handleTextChange(makeMapping("first@example.com"))
      await flushMicrotasks()

      // Fire the debounce for "first" — NER request is now pending
      await vi.advanceTimersByTimeAsync(500)

      // Second change before NER responds — increments generation
      scheduler.handleTextChange(makeMapping("second@example.com"))
      await flushMicrotasks()

      // Now resolve the NER for "first" (stale)
      if (nerState.resolve !== null) nerState.resolve({ matches: [] })
      await flushMicrotasks()

      // Verify no "both" or "ner" source matches appeared in any callback
      const nerMergedCalls = onMatches.mock.calls.filter(
        ([matches]: [PIIMatch[]]) =>
          matches.some((m: PIIMatch) => m.source === "both" || m.source === "ner"),
      )
      expect(nerMergedCalls).toHaveLength(0)
      scheduler.destroy()
    })

    it("should merge NER results with regex results and emit a second time", async () => {
      const nerMatch: PIIMatch = {
        type: "PERSON_NAME",
        value: "John Doe",
        start: 0,
        end: 8,
        confidence: 0.9,
        source: "ner",
      }
      sendMessageImpl = (_msg, cb) => {
        cb({ matches: [nerMatch] })
      }

      const onMatches = vi.fn()
      const scheduler = createDetectionScheduler(
        makeOptions({ onMatches, isProUser: true }),
      )

      // Text has no email — regex emits empty array
      scheduler.handleTextChange(makeMapping("John Doe"))
      await flushMicrotasks()

      const callsAfterRegex = onMatches.mock.calls.length
      expect(callsAfterRegex).toBeGreaterThanOrEqual(1)

      // Fire NER debounce
      await vi.advanceTimersByTimeAsync(500)
      await flushMicrotasks()

      // Should have at least one more call (the NER-merged emit)
      expect(onMatches.mock.calls.length).toBeGreaterThan(callsAfterRegex)

      // The latest call should include the NER match
      const lastCall = onMatches.mock.calls[onMatches.mock.calls.length - 1] as [PIIMatch[], TextMapping]
      expect(lastCall[0].some((m: PIIMatch) => m.type === "PERSON_NAME")).toBe(true)
      scheduler.destroy()
    })
  })

  // -------------------------------------------------------------------------
  // NER — free users
  // -------------------------------------------------------------------------

  describe("no NER for free users", () => {
    it("should not call sendMessage for free users", async () => {
      let nerCallCount = 0
      sendMessageImpl = (_msg, cb) => {
        nerCallCount++
        cb({ matches: [] })
      }

      const onMatches = vi.fn()
      const scheduler = createDetectionScheduler(
        makeOptions({ onMatches, isProUser: false }),
      )

      scheduler.handleTextChange(makeMapping("test@example.com"))

      // Advance well past the debounce window
      await vi.advanceTimersByTimeAsync(2000)
      await flushMicrotasks()

      expect(nerCallCount).toBe(0)
      scheduler.destroy()
    })

    it("should still emit regex results for free users", async () => {
      const onMatches = vi.fn()
      const scheduler = createDetectionScheduler(
        makeOptions({ onMatches, isProUser: false }),
      )

      scheduler.handleTextChange(makeMapping("test@example.com"))
      await flushMicrotasks()

      expect(onMatches).toHaveBeenCalledOnce()
      const [matches] = onMatches.mock.calls[0] as [PIIMatch[], TextMapping]
      expect(matches[0].type).toBe("EMAIL")
      scheduler.destroy()
    })
  })

  // -------------------------------------------------------------------------
  // destroy
  // -------------------------------------------------------------------------

  describe("destroy", () => {
    it("should not fire onMatches after destroy", async () => {
      const onMatches = vi.fn()
      const scheduler = createDetectionScheduler(
        makeOptions({ onMatches, isProUser: false }),
      )

      scheduler.destroy()
      scheduler.handleTextChange(makeMapping("test@example.com"))
      await flushMicrotasks()

      expect(onMatches).not.toHaveBeenCalled()
    })

    it("should cancel pending NER debounce timer on destroy", async () => {
      let nerCallCount = 0
      sendMessageImpl = (_msg, cb) => {
        nerCallCount++
        cb({ matches: [] })
      }

      const onMatches = vi.fn()
      const scheduler = createDetectionScheduler(
        makeOptions({ onMatches, isProUser: true }),
      )

      scheduler.handleTextChange(makeMapping("test@example.com"))
      await vi.advanceTimersByTimeAsync(100) // within debounce window

      scheduler.destroy()

      // Advance past the debounce — NER should NOT fire
      await vi.advanceTimersByTimeAsync(1000)
      await flushMicrotasks()
      expect(nerCallCount).toBe(0)
    })

    it("should be safe to call destroy multiple times", () => {
      const onMatches = vi.fn()
      const scheduler = createDetectionScheduler(makeOptions({ onMatches }))

      expect(() => {
        scheduler.destroy()
        scheduler.destroy()
        scheduler.destroy()
      }).not.toThrow()
    })
  })

  // -------------------------------------------------------------------------
  // NER timeout
  // -------------------------------------------------------------------------

  describe("NER timeout", () => {
    it("should abandon NER if no response within 1000ms and not hang", async () => {
      // NER never responds
      sendMessageImpl = (_msg, _cb) => {
        // deliberately never calls cb
      }

      const onMatches = vi.fn()
      const scheduler = createDetectionScheduler(
        makeOptions({ onMatches, isProUser: true }),
      )

      scheduler.handleTextChange(makeMapping("test@example.com"))
      await flushMicrotasks()

      // Regex emit should have happened
      expect(onMatches.mock.calls.length).toBeGreaterThanOrEqual(1)

      // Fire NER debounce
      await vi.advanceTimersByTimeAsync(500)
      await flushMicrotasks()

      // Advance through the NER timeout (1000ms from NER request time)
      await vi.advanceTimersByTimeAsync(1000)
      await flushMicrotasks()

      // The important invariant: no throw, no hang.
      // The test completing here is the verification.
      scheduler.destroy()
    })
  })

  // -------------------------------------------------------------------------
  // Allowlist filtering
  // -------------------------------------------------------------------------

  describe("allowlist filtering", () => {
    it("should filter out allowlisted matches before emitting", async () => {
      const mockAllowlist = {
        isDismissed: vi.fn(async (_text: string, type: string) => type === "EMAIL"),
        isDismissedByHash: vi.fn(() => false),
      }

      const onMatches = vi.fn()
      const scheduler = createDetectionScheduler(
        makeOptions({
          onMatches,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          allowlist: mockAllowlist as any,
        }),
      )

      scheduler.handleTextChange(makeMapping("send to test@example.com please"))
      await flushMicrotasks(10)

      expect(onMatches).toHaveBeenCalledOnce()
      const [matches] = onMatches.mock.calls[0] as [PIIMatch[], TextMapping]
      // EMAIL was dismissed — should be filtered out
      expect(matches.filter((m: PIIMatch) => m.type === "EMAIL")).toHaveLength(0)
      scheduler.destroy()
    })

    it("should emit unfiltered matches if allowlist.isDismissed throws (fail-open)", async () => {
      const mockAllowlist = {
        isDismissed: vi.fn(async () => {
          throw new Error("storage error")
        }),
        isDismissedByHash: vi.fn(() => false),
      }

      const onMatches = vi.fn()
      const scheduler = createDetectionScheduler(
        makeOptions({
          onMatches,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          allowlist: mockAllowlist as any,
        }),
      )

      scheduler.handleTextChange(makeMapping("test@example.com"))
      await flushMicrotasks(10)

      // Should still have emitted (fail-open)
      expect(onMatches).toHaveBeenCalled()
      scheduler.destroy()
    })
  })
})

// ---------------------------------------------------------------------------
// mergeMatches — unit tests
// ---------------------------------------------------------------------------

describe("mergeMatches", () => {
  it("should return regex matches unchanged when NER matches are empty", () => {
    const regex = [makeMatch({ value: "a@b.com", start: 0, end: 7 })]
    const result = mergeMatches(regex, [])
    expect(result).toHaveLength(1)
    expect(result[0].source).toBe("regex")
  })

  it("should return NER matches unchanged when regex matches are empty", () => {
    const ner = [makeMatch({ value: "a@b.com", start: 0, end: 7, source: "ner" })]
    const result = mergeMatches([], ner)
    expect(result).toHaveLength(1)
    expect(result[0].source).toBe("ner")
  })

  it("should keep both non-overlapping matches from different sources", () => {
    const regex = [makeMatch({ value: "a@b.com", start: 0, end: 7, source: "regex" })]
    const ner = [makeMatch({ type: "PERSON_NAME", value: "Jane", start: 20, end: 24, source: "ner" })]
    const result = mergeMatches(regex, ner)
    expect(result).toHaveLength(2)
  })

  it("should mark source as 'both' when regex and NER detect the exact same span", () => {
    const match = { value: "a@b.com", start: 0, end: 7 }
    const regex = [makeMatch({ ...match, confidence: 0.95, source: "regex" })]
    const ner = [makeMatch({ ...match, confidence: 0.80, source: "ner" })]
    const result = mergeMatches(regex, ner)
    expect(result).toHaveLength(1)
    expect(result[0].source).toBe("both")
  })

  it("should keep the higher-confidence regex match when spans overlap", () => {
    const regex = [makeMatch({ value: "a@b.com", start: 0, end: 7, confidence: 0.95, source: "regex" })]
    const ner = [makeMatch({ value: "a@b.co", start: 0, end: 6, confidence: 0.70, source: "ner" })]
    const result = mergeMatches(regex, ner)
    expect(result).toHaveLength(1)
    expect(result[0].confidence).toBe(0.95)
    expect(result[0].source).toBe("regex")
  })

  it("should prefer NER match when NER has higher confidence on overlapping span", () => {
    const regex = [makeMatch({ value: "a@b.co", start: 0, end: 6, confidence: 0.70, source: "regex" })]
    const ner = [makeMatch({ value: "a@b.com", start: 0, end: 7, confidence: 0.95, source: "ner" })]
    const result = mergeMatches(regex, ner)
    expect(result).toHaveLength(1)
    expect(result[0].confidence).toBe(0.95)
    expect(result[0].source).toBe("ner")
  })

  it("should handle multiple non-overlapping matches from both sources", () => {
    const regex = [
      makeMatch({ value: "a@b.com", start: 0, end: 7, source: "regex" }),
      makeMatch({ value: "c@d.com", start: 20, end: 27, source: "regex" }),
    ]
    const ner = [
      makeMatch({ type: "PERSON_NAME", value: "Jane", start: 10, end: 14, source: "ner" }),
    ]
    const result = mergeMatches(regex, ner)
    expect(result).toHaveLength(3)
    // Results should be sorted by start position
    expect(result[0].start).toBeLessThan(result[1].start)
    expect(result[1].start).toBeLessThan(result[2].start)
  })

  it("should handle empty arrays from both sources", () => {
    expect(mergeMatches([], [])).toHaveLength(0)
  })

  it("should handle two adjacent (non-overlapping) matches correctly", () => {
    const regex = [makeMatch({ value: "foo", start: 0, end: 3, source: "regex" })]
    const ner = [makeMatch({ value: "bar", start: 3, end: 6, source: "ner" })]
    const result = mergeMatches(regex, ner)
    expect(result).toHaveLength(2)
  })
})
