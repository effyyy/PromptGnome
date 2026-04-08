/**
 * Vitest tests for message-extractor utility functions.
 * Covers ChatGPT, Claude, and Gemini response accumulation from SSE events.
 * Tests normal streaming, edge cases, malformed data, and sentinel handling.
 */
import { describe, it, expect } from "vitest"
import {
  accumulateChatGPTResponse,
  accumulateClaudeResponse,
  accumulateGeminiResponse,
} from "~/src/utils/message-extractor"
import type { SSEEvent } from "~/src/utils/sse-parser"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Constructs an SSEEvent with only a data field (no event type). */
function dataEvent(data: string): SSEEvent {
  return { data }
}

/** Constructs an SSEEvent with both an event type and a data payload. */
function typedEvent(event: string, data: string): SSEEvent {
  return { event, data }
}

/** Serialises an object to a JSON string for use as event.data. */
function json(value: unknown): string {
  return JSON.stringify(value)
}

// ---------------------------------------------------------------------------
// accumulateChatGPTResponse
// ---------------------------------------------------------------------------

describe("accumulateChatGPTResponse", () => {
  describe("normal streaming delta format", () => {
    it("should return an empty string for an empty event array", () => {
      expect(accumulateChatGPTResponse([])).toBe("")
    })

    it("should extract content from a single delta event", () => {
      const events: SSEEvent[] = [
        dataEvent(json({ choices: [{ delta: { content: "Hello" } }] })),
      ]
      expect(accumulateChatGPTResponse(events)).toBe("Hello")
    })

    it("should concatenate content across multiple delta events", () => {
      const events: SSEEvent[] = [
        dataEvent(json({ choices: [{ delta: { content: "Hello" } }] })),
        dataEvent(json({ choices: [{ delta: { content: ", " } }] })),
        dataEvent(json({ choices: [{ delta: { content: "world!" } }] })),
      ]
      expect(accumulateChatGPTResponse(events)).toBe("Hello, world!")
    })

    it("should preserve whitespace and newlines in delta content", () => {
      const events: SSEEvent[] = [
        dataEvent(json({ choices: [{ delta: { content: "Line one\n" } }] })),
        dataEvent(json({ choices: [{ delta: { content: "Line two\n" } }] })),
      ]
      expect(accumulateChatGPTResponse(events)).toBe("Line one\nLine two\n")
    })

    it("should handle empty string content in a delta", () => {
      const events: SSEEvent[] = [
        dataEvent(json({ choices: [{ delta: { content: "Before" } }] })),
        dataEvent(json({ choices: [{ delta: { content: "" } }] })),
        dataEvent(json({ choices: [{ delta: { content: "After" } }] })),
      ]
      expect(accumulateChatGPTResponse(events)).toBe("BeforeAfter")
    })
  })

  describe("[DONE] sentinel handling", () => {
    it("should skip the [DONE] sentinel event", () => {
      const events: SSEEvent[] = [dataEvent("[DONE]")]
      expect(accumulateChatGPTResponse(events)).toBe("")
    })

    it("should accumulate content before [DONE] and ignore the sentinel", () => {
      const events: SSEEvent[] = [
        dataEvent(json({ choices: [{ delta: { content: "Answer" } }] })),
        dataEvent("[DONE]"),
      ]
      expect(accumulateChatGPTResponse(events)).toBe("Answer")
    })

    it("should handle [DONE] appearing between content events", () => {
      const events: SSEEvent[] = [
        dataEvent(json({ choices: [{ delta: { content: "Part1" } }] })),
        dataEvent("[DONE]"),
        dataEvent(json({ choices: [{ delta: { content: "Part2" } }] })),
      ]
      // [DONE] is skipped; both content events are concatenated
      expect(accumulateChatGPTResponse(events)).toBe("Part1Part2")
    })
  })

  describe("legacy parts format", () => {
    it("should extract text from the legacy message.content.parts[0] format", () => {
      const events: SSEEvent[] = [
        dataEvent(
          json({
            message: { content: { parts: ["Full response text"] } },
          })
        ),
      ]
      expect(accumulateChatGPTResponse(events)).toBe("Full response text")
    })

    it("should prefer choices.delta.content over the legacy format when both are present", () => {
      const events: SSEEvent[] = [
        dataEvent(
          json({
            choices: [{ delta: { content: "delta-wins" } }],
            message: { content: { parts: ["legacy-loses"] } },
          })
        ),
      ]
      // choices delta is tried first
      expect(accumulateChatGPTResponse(events)).toBe("delta-wins")
    })

    it("should fall back to legacy parts format when delta content is absent", () => {
      const events: SSEEvent[] = [
        dataEvent(
          json({
            choices: [{ delta: {} }],
            message: { content: { parts: ["fallback text"] } },
          })
        ),
      ]
      expect(accumulateChatGPTResponse(events)).toBe("fallback text")
    })

    it("should return empty string when parts array is empty", () => {
      const events: SSEEvent[] = [
        dataEvent(json({ message: { content: { parts: [] } } })),
      ]
      expect(accumulateChatGPTResponse(events)).toBe("")
    })

    it("should skip a parts entry that is not a string", () => {
      const events: SSEEvent[] = [
        dataEvent(
          json({ message: { content: { parts: [{ type: "image" }] } } })
        ),
      ]
      expect(accumulateChatGPTResponse(events)).toBe("")
    })
  })

  describe("malformed and missing data", () => {
    it("should skip non-JSON data lines", () => {
      const events: SSEEvent[] = [
        dataEvent("not valid JSON"),
        dataEvent(json({ choices: [{ delta: { content: "valid" } }] })),
      ]
      expect(accumulateChatGPTResponse(events)).toBe("valid")
    })

    it("should skip a JSON array at the top level", () => {
      const events: SSEEvent[] = [
        dataEvent("[1,2,3]"),
        dataEvent(json({ choices: [{ delta: { content: "ok" } }] })),
      ]
      expect(accumulateChatGPTResponse(events)).toBe("ok")
    })

    it("should skip an event whose choices array is empty", () => {
      const events: SSEEvent[] = [
        dataEvent(json({ choices: [] })),
        dataEvent(json({ choices: [{ delta: { content: "still here" } }] })),
      ]
      expect(accumulateChatGPTResponse(events)).toBe("still here")
    })

    it("should skip an event with no choices key", () => {
      const events: SSEEvent[] = [
        dataEvent(json({ id: "chatcmpl-123", object: "chat.completion.chunk" })),
        dataEvent(json({ choices: [{ delta: { content: "token" } }] })),
      ]
      expect(accumulateChatGPTResponse(events)).toBe("token")
    })

    it("should skip an event where delta.content is a number", () => {
      const events: SSEEvent[] = [
        dataEvent(json({ choices: [{ delta: { content: 42 } }] })),
      ]
      expect(accumulateChatGPTResponse(events)).toBe("")
    })

    it("should skip an event where delta is null", () => {
      const events: SSEEvent[] = [
        dataEvent(json({ choices: [{ delta: null }] })),
      ]
      expect(accumulateChatGPTResponse(events)).toBe("")
    })

    it("should handle an event with an empty data string", () => {
      const events: SSEEvent[] = [
        dataEvent(""),
        dataEvent(json({ choices: [{ delta: { content: "good" } }] })),
      ]
      expect(accumulateChatGPTResponse(events)).toBe("good")
    })

    it("should return empty string when all events are non-JSON", () => {
      const events: SSEEvent[] = [
        dataEvent("plain text"),
        dataEvent("more plain text"),
      ]
      expect(accumulateChatGPTResponse(events)).toBe("")
    })
  })

  describe("typed event field is ignored", () => {
    it("should process events regardless of the event type field", () => {
      // accumulateChatGPTResponse does not filter on event.event
      const events: SSEEvent[] = [
        typedEvent(
          "some_event",
          json({ choices: [{ delta: { content: "included" } }] })
        ),
      ]
      expect(accumulateChatGPTResponse(events)).toBe("included")
    })
  })
})

// ---------------------------------------------------------------------------
// accumulateClaudeResponse
// ---------------------------------------------------------------------------

describe("accumulateClaudeResponse", () => {
  describe("normal streaming events", () => {
    it("should return an empty string for an empty event array", () => {
      expect(accumulateClaudeResponse([])).toBe("")
    })

    it("should extract text from a single content_block_delta event", () => {
      const events: SSEEvent[] = [
        typedEvent(
          "content_block_delta",
          json({ type: "content_block_delta", delta: { type: "text_delta", text: "Hello" } })
        ),
      ]
      expect(accumulateClaudeResponse(events)).toBe("Hello")
    })

    it("should concatenate text across multiple content_block_delta events", () => {
      const events: SSEEvent[] = [
        typedEvent(
          "content_block_delta",
          json({ delta: { type: "text_delta", text: "Foo" } })
        ),
        typedEvent(
          "content_block_delta",
          json({ delta: { type: "text_delta", text: " bar" } })
        ),
        typedEvent(
          "content_block_delta",
          json({ delta: { type: "text_delta", text: " baz" } })
        ),
      ]
      expect(accumulateClaudeResponse(events)).toBe("Foo bar baz")
    })

    it("should preserve whitespace and newlines in text deltas", () => {
      const events: SSEEvent[] = [
        typedEvent(
          "content_block_delta",
          json({ delta: { type: "text_delta", text: "Line 1\n" } })
        ),
        typedEvent(
          "content_block_delta",
          json({ delta: { type: "text_delta", text: "Line 2\n" } })
        ),
      ]
      expect(accumulateClaudeResponse(events)).toBe("Line 1\nLine 2\n")
    })

    it("should handle an empty text string in a delta", () => {
      const events: SSEEvent[] = [
        typedEvent(
          "content_block_delta",
          json({ delta: { type: "text_delta", text: "start" } })
        ),
        typedEvent(
          "content_block_delta",
          json({ delta: { type: "text_delta", text: "" } })
        ),
        typedEvent(
          "content_block_delta",
          json({ delta: { type: "text_delta", text: "end" } })
        ),
      ]
      expect(accumulateClaudeResponse(events)).toBe("startend")
    })
  })

  describe("non-text event types are filtered out", () => {
    it("should skip message_start events", () => {
      const events: SSEEvent[] = [
        typedEvent(
          "message_start",
          json({ type: "message_start", message: { id: "msg_01" } })
        ),
        typedEvent(
          "content_block_delta",
          json({ delta: { type: "text_delta", text: "content" } })
        ),
      ]
      expect(accumulateClaudeResponse(events)).toBe("content")
    })

    it("should skip content_block_start events", () => {
      const events: SSEEvent[] = [
        typedEvent(
          "content_block_start",
          json({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } })
        ),
        typedEvent(
          "content_block_delta",
          json({ delta: { type: "text_delta", text: "token" } })
        ),
      ]
      expect(accumulateClaudeResponse(events)).toBe("token")
    })

    it("should skip content_block_stop events", () => {
      const events: SSEEvent[] = [
        typedEvent(
          "content_block_delta",
          json({ delta: { type: "text_delta", text: "before" } })
        ),
        typedEvent("content_block_stop", json({ type: "content_block_stop", index: 0 })),
      ]
      expect(accumulateClaudeResponse(events)).toBe("before")
    })

    it("should skip message_delta events", () => {
      const events: SSEEvent[] = [
        typedEvent(
          "content_block_delta",
          json({ delta: { type: "text_delta", text: "text" } })
        ),
        typedEvent(
          "message_delta",
          json({ type: "message_delta", delta: { stop_reason: "end_turn" } })
        ),
      ]
      expect(accumulateClaudeResponse(events)).toBe("text")
    })

    it("should skip message_stop events", () => {
      const events: SSEEvent[] = [
        typedEvent(
          "content_block_delta",
          json({ delta: { type: "text_delta", text: "words" } })
        ),
        typedEvent("message_stop", json({ type: "message_stop" })),
      ]
      expect(accumulateClaudeResponse(events)).toBe("words")
    })

    it("should skip events with no event type field", () => {
      const events: SSEEvent[] = [
        dataEvent(json({ delta: { type: "text_delta", text: "ignored" } })),
        typedEvent(
          "content_block_delta",
          json({ delta: { type: "text_delta", text: "captured" } })
        ),
      ]
      expect(accumulateClaudeResponse(events)).toBe("captured")
    })

    it("should return empty string when all events are non-delta", () => {
      const events: SSEEvent[] = [
        typedEvent("message_start", json({ type: "message_start" })),
        typedEvent("message_stop", json({ type: "message_stop" })),
      ]
      expect(accumulateClaudeResponse(events)).toBe("")
    })
  })

  describe("delta type filtering", () => {
    it("should skip content_block_delta events with a non-text_delta delta type", () => {
      const events: SSEEvent[] = [
        typedEvent(
          "content_block_delta",
          json({ delta: { type: "input_json_delta", partial_json: '{"key":' } })
        ),
        typedEvent(
          "content_block_delta",
          json({ delta: { type: "text_delta", text: "only me" } })
        ),
      ]
      expect(accumulateClaudeResponse(events)).toBe("only me")
    })

    it("should skip a content_block_delta where delta.text is not a string", () => {
      const events: SSEEvent[] = [
        typedEvent(
          "content_block_delta",
          json({ delta: { type: "text_delta", text: 123 } })
        ),
      ]
      expect(accumulateClaudeResponse(events)).toBe("")
    })

    it("should skip a content_block_delta where delta is null", () => {
      const events: SSEEvent[] = [
        typedEvent("content_block_delta", json({ delta: null })),
      ]
      expect(accumulateClaudeResponse(events)).toBe("")
    })

    it("should skip a content_block_delta with no delta key", () => {
      const events: SSEEvent[] = [
        typedEvent("content_block_delta", json({ type: "content_block_delta" })),
      ]
      expect(accumulateClaudeResponse(events)).toBe("")
    })
  })

  describe("malformed data", () => {
    it("should skip non-JSON data in a content_block_delta event", () => {
      const events: SSEEvent[] = [
        typedEvent("content_block_delta", "not-json"),
        typedEvent(
          "content_block_delta",
          json({ delta: { type: "text_delta", text: "valid" } })
        ),
      ]
      expect(accumulateClaudeResponse(events)).toBe("valid")
    })

    it("should skip a content_block_delta event with empty data", () => {
      const events: SSEEvent[] = [
        typedEvent("content_block_delta", ""),
        typedEvent(
          "content_block_delta",
          json({ delta: { type: "text_delta", text: "good" } })
        ),
      ]
      expect(accumulateClaudeResponse(events)).toBe("good")
    })
  })
})

// ---------------------------------------------------------------------------
// accumulateGeminiResponse
// ---------------------------------------------------------------------------

describe("accumulateGeminiResponse", () => {
  /** Builds a standard Gemini payload with a single text part. */
  function geminiPayload(text: string): string {
    return json({
      candidates: [{ content: { parts: [{ text }] } }],
    })
  }

  describe("normal streaming events", () => {
    it("should return an empty string for an empty event array", () => {
      expect(accumulateGeminiResponse([])).toBe("")
    })

    it("should extract text from a single Gemini event", () => {
      const events: SSEEvent[] = [dataEvent(geminiPayload("Hello Gemini"))]
      expect(accumulateGeminiResponse(events)).toBe("Hello Gemini")
    })

    it("should concatenate text across multiple events", () => {
      const events: SSEEvent[] = [
        dataEvent(geminiPayload("Part A ")),
        dataEvent(geminiPayload("Part B ")),
        dataEvent(geminiPayload("Part C")),
      ]
      expect(accumulateGeminiResponse(events)).toBe("Part A Part B Part C")
    })

    it("should concatenate text across multiple parts within a single event", () => {
      const events: SSEEvent[] = [
        dataEvent(
          json({
            candidates: [
              {
                content: {
                  parts: [{ text: "Part1 " }, { text: "Part2 " }, { text: "Part3" }],
                },
              },
            ],
          })
        ),
      ]
      expect(accumulateGeminiResponse(events)).toBe("Part1 Part2 Part3")
    })

    it("should preserve whitespace and newlines", () => {
      const events: SSEEvent[] = [
        dataEvent(geminiPayload("Line 1\n")),
        dataEvent(geminiPayload("Line 2\n")),
      ]
      expect(accumulateGeminiResponse(events)).toBe("Line 1\nLine 2\n")
    })
  })

  describe("array-wrapped format", () => {
    it("should handle a payload wrapped in a JSON array", () => {
      const inner = { candidates: [{ content: { parts: [{ text: "wrapped" }] } }] }
      const events: SSEEvent[] = [dataEvent(`[${json(inner)}]`)]
      expect(accumulateGeminiResponse(events)).toBe("wrapped")
    })

    it("should handle array-wrapped format across multiple events", () => {
      const makeWrapped = (text: string): string => {
        const inner = { candidates: [{ content: { parts: [{ text }] } }] }
        return `[${json(inner)}]`
      }
      const events: SSEEvent[] = [
        dataEvent(makeWrapped("alpha ")),
        dataEvent(makeWrapped("beta")),
      ]
      expect(accumulateGeminiResponse(events)).toBe("alpha beta")
    })

    it("should handle mixed wrapped and unwrapped events", () => {
      const wrapped = `[${json({ candidates: [{ content: { parts: [{ text: "first " }] } }] })}]`
      const plain = json({ candidates: [{ content: { parts: [{ text: "second" }] } }] })
      const events: SSEEvent[] = [dataEvent(wrapped), dataEvent(plain)]
      expect(accumulateGeminiResponse(events)).toBe("first second")
    })
  })

  describe("[DONE] sentinel and empty data handling", () => {
    it("should skip the [DONE] sentinel event", () => {
      const events: SSEEvent[] = [dataEvent("[DONE]")]
      expect(accumulateGeminiResponse(events)).toBe("")
    })

    it("should accumulate content before [DONE] and ignore the sentinel", () => {
      const events: SSEEvent[] = [
        dataEvent(geminiPayload("answer")),
        dataEvent("[DONE]"),
      ]
      expect(accumulateGeminiResponse(events)).toBe("answer")
    })

    it("should skip events with empty data strings", () => {
      const events: SSEEvent[] = [
        dataEvent(""),
        dataEvent(geminiPayload("content")),
      ]
      expect(accumulateGeminiResponse(events)).toBe("content")
    })

    it("should skip events with whitespace-only data strings", () => {
      const events: SSEEvent[] = [
        dataEvent("   "),
        dataEvent(geminiPayload("present")),
      ]
      expect(accumulateGeminiResponse(events)).toBe("present")
    })
  })

  describe("malformed and missing data", () => {
    it("should skip non-JSON data lines", () => {
      const events: SSEEvent[] = [
        dataEvent("not valid JSON"),
        dataEvent(geminiPayload("still captured")),
      ]
      expect(accumulateGeminiResponse(events)).toBe("still captured")
    })

    it("should skip a payload with no candidates key", () => {
      const events: SSEEvent[] = [
        dataEvent(json({ error: { code: 500, message: "Internal" } })),
        dataEvent(geminiPayload("ok")),
      ]
      expect(accumulateGeminiResponse(events)).toBe("ok")
    })

    it("should skip a payload with an empty candidates array", () => {
      const events: SSEEvent[] = [
        dataEvent(json({ candidates: [] })),
        dataEvent(geminiPayload("non-empty")),
      ]
      expect(accumulateGeminiResponse(events)).toBe("non-empty")
    })

    it("should skip a payload where candidate.content is missing", () => {
      const events: SSEEvent[] = [
        dataEvent(json({ candidates: [{ finishReason: "STOP" }] })),
        dataEvent(geminiPayload("fallback")),
      ]
      expect(accumulateGeminiResponse(events)).toBe("fallback")
    })

    it("should skip a payload where content.parts is missing", () => {
      const events: SSEEvent[] = [
        dataEvent(json({ candidates: [{ content: { role: "model" } }] })),
        dataEvent(geminiPayload("fallback")),
      ]
      expect(accumulateGeminiResponse(events)).toBe("fallback")
    })

    it("should skip a payload where content.parts is not an array", () => {
      const events: SSEEvent[] = [
        dataEvent(json({ candidates: [{ content: { parts: "not-an-array" } }] })),
        dataEvent(geminiPayload("good")),
      ]
      expect(accumulateGeminiResponse(events)).toBe("good")
    })

    it("should skip parts that have no text field", () => {
      const events: SSEEvent[] = [
        dataEvent(
          json({
            candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png" } }] } }],
          })
        ),
        dataEvent(geminiPayload("text only")),
      ]
      expect(accumulateGeminiResponse(events)).toBe("text only")
    })

    it("should skip a part where text is not a string", () => {
      const events: SSEEvent[] = [
        dataEvent(json({ candidates: [{ content: { parts: [{ text: 42 }] } }] })),
        dataEvent(geminiPayload("valid")),
      ]
      expect(accumulateGeminiResponse(events)).toBe("valid")
    })

    it("should return empty string when all events are non-JSON", () => {
      const events: SSEEvent[] = [
        dataEvent("garbage one"),
        dataEvent("garbage two"),
      ]
      expect(accumulateGeminiResponse(events)).toBe("")
    })
  })

  describe("mixed parts and skipped entries", () => {
    it("should concatenate only text parts, skipping non-text parts in the same event", () => {
      const events: SSEEvent[] = [
        dataEvent(
          json({
            candidates: [
              {
                content: {
                  parts: [
                    { inlineData: { mimeType: "image/jpeg" } },
                    { text: "caption text" },
                    { text: " and more" },
                  ],
                },
              },
            ],
          })
        ),
      ]
      expect(accumulateGeminiResponse(events)).toBe("caption text and more")
    })

    it("should return empty string when all parts lack a text field", () => {
      const events: SSEEvent[] = [
        dataEvent(
          json({
            candidates: [
              { content: { parts: [{ inlineData: {} }, { functionCall: {} }] } },
            ],
          })
        ),
      ]
      expect(accumulateGeminiResponse(events)).toBe("")
    })
  })
})
