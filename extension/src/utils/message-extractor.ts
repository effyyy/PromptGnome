/**
 * Provider-specific functions to extract complete response text from SSE events.
 * Each accumulator knows the JSON structure for its provider's streaming format
 * and concatenates incremental text deltas into a single response string.
 */

import type { SSEEvent } from "./sse-parser"

/**
 * Safely parses a JSON string, returning null on failure.
 * Avoids throwing on malformed or non-JSON data lines.
 */
function safeParse(json: string): unknown {
  try {
    return JSON.parse(json)
  } catch {
    return null
  }
}

/**
 * Type guard for plain objects (not arrays, not null).
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * Accumulates the full assistant response text from ChatGPT SSE events.
 *
 * ChatGPT streaming format sends JSON objects with the structure:
 * `{ choices: [{ delta: { content: "..." } }] }` for incremental tokens,
 * and a final `[DONE]` sentinel line.
 *
 * Legacy format may use `message.content.parts[0]` in some contexts.
 * This function handles both delta-based and parts-based payloads.
 *
 * @param events - Array of SSEEvent objects from the ChatGPT stream
 * @returns The concatenated assistant response text
 */
export function accumulateChatGPTResponse(events: SSEEvent[]): string {
  const parts: string[] = []

  for (const event of events) {
    if (event.data === "[DONE]") {
      continue
    }

    const parsed = safeParse(event.data)
    if (!isRecord(parsed)) {
      continue
    }

    const text = extractChatGPTDelta(parsed)
    if (text !== null) {
      parts.push(text)
    }
  }

  return parts.join("")
}

/**
 * Extracts a text fragment from a single parsed ChatGPT JSON payload.
 * Tries the streaming delta format first, then the parts format.
 */
function extractChatGPTDelta(
  parsed: Record<string, unknown>
): string | null {
  if (Array.isArray(parsed.choices) && parsed.choices.length > 0) {
    const choice = parsed.choices[0]
    if (isRecord(choice) && isRecord(choice.delta)) {
      const content = choice.delta.content
      if (typeof content === "string") {
        return content
      }
    }
  }

  if (isRecord(parsed.message) && isRecord(parsed.message.content)) {
    const contentParts = parsed.message.content.parts
    if (Array.isArray(contentParts) && contentParts.length > 0) {
      const first = contentParts[0]
      if (typeof first === "string") {
        return first
      }
    }
  }

  return null
}

/**
 * Accumulates the full assistant response text from Claude SSE events.
 *
 * Claude's streaming format uses typed events. Text tokens arrive as
 * `content_block_delta` events containing:
 * `{ type: "content_block_delta", delta: { type: "text_delta", text: "..." } }`
 *
 * Other event types (message_start, content_block_start, message_stop, etc.)
 * are structural and do not carry text content.
 *
 * @param events - Array of SSEEvent objects from the Claude stream
 * @returns The concatenated assistant response text
 */
export function accumulateClaudeResponse(events: SSEEvent[]): string {
  const parts: string[] = []

  for (const event of events) {
    if (event.event !== "content_block_delta") {
      continue
    }

    const parsed = safeParse(event.data)
    if (!isRecord(parsed)) {
      continue
    }

    const text = extractClaudeDelta(parsed)
    if (text !== null) {
      parts.push(text)
    }
  }

  return parts.join("")
}

/**
 * Extracts text from a single parsed Claude content_block_delta payload.
 */
function extractClaudeDelta(
  parsed: Record<string, unknown>
): string | null {
  if (!isRecord(parsed.delta)) {
    return null
  }
  const delta = parsed.delta
  if (delta.type === "text_delta" && typeof delta.text === "string") {
    return delta.text
  }
  return null
}

/**
 * Accumulates the full assistant response text from Gemini SSE events.
 *
 * Gemini's streaming format sends JSON objects with the structure:
 * `{ candidates: [{ content: { parts: [{ text: "..." }] } }] }`
 *
 * Some responses may include a top-level array wrapper. This function
 * handles both single-object and array-wrapped formats.
 *
 * @param events - Array of SSEEvent objects from the Gemini stream
 * @returns The concatenated assistant response text
 */
export function accumulateGeminiResponse(events: SSEEvent[]): string {
  const parts: string[] = []

  for (const event of events) {
    const data = event.data.trim()
    if (data === "" || data === "[DONE]") {
      continue
    }

    const stripped = stripArrayWrapper(data)
    const parsed = safeParse(stripped)
    if (!isRecord(parsed)) {
      continue
    }

    const text = extractGeminiText(parsed)
    if (text !== null) {
      parts.push(text)
    }
  }

  return parts.join("")
}

/**
 * Strips a leading/trailing JSON array bracket if present, so
 * Gemini's occasional `[{...}]` wrapper is handled transparently.
 */
function stripArrayWrapper(data: string): string {
  const trimmed = data.trim()
  if (trimmed.startsWith("[")) {
    return trimmed.slice(1).replace(/,?\s*]$/, "")
  }
  return trimmed
}

/**
 * Extracts text from a single parsed Gemini response payload.
 * Walks: candidates[0].content.parts[*].text
 */
function extractGeminiText(
  parsed: Record<string, unknown>
): string | null {
  if (!Array.isArray(parsed.candidates) || parsed.candidates.length === 0) {
    return null
  }
  const candidate = parsed.candidates[0]
  if (!isRecord(candidate) || !isRecord(candidate.content)) {
    return null
  }
  const contentParts = candidate.content.parts
  if (!Array.isArray(contentParts)) {
    return null
  }

  const texts: string[] = []
  for (const part of contentParts) {
    if (isRecord(part) && typeof part.text === "string") {
      texts.push(part.text)
    }
  }

  return texts.length > 0 ? texts.join("") : null
}
