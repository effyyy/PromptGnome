/**
 * Validation tests for the Claude provider adapter.
 * Covers request and response shape validation with edge cases.
 */

import { describe, it, expect } from "vitest"
import { claudeAdapter } from "~src/providers/claude"

describe("claudeAdapter.validateRequestPayload", () => {
  it("should return valid: true for completion.prompt format (current)", () => {
    const body = JSON.stringify({
      completion: { prompt: "Help me with this task", model: "claude-opus-4-5" },
      text: "Help me with this task"
    })
    expect(claudeAdapter.validateRequestPayload(body)).toEqual({ valid: true })
  })

  it("should return valid: true for top-level text field", () => {
    const body = JSON.stringify({
      organization_uuid: "org-123",
      text: "Help me with this task"
    })
    expect(claudeAdapter.validateRequestPayload(body)).toEqual({ valid: true })
  })

  it("should return valid: true for legacy top-level prompt string", () => {
    const body = JSON.stringify({ prompt: "Help me with this task" })
    expect(claudeAdapter.validateRequestPayload(body)).toEqual({ valid: true })
  })

  it("should return valid: false when no recognized message field is present", () => {
    const body = JSON.stringify({ model: "claude-3-opus" })
    const result = claudeAdapter.validateRequestPayload(body)
    expect(result.valid).toBe(false)
    expect(result.failedCheck).toBe("request_shape")
  })

  it("should return valid: false when all message fields are empty strings", () => {
    const body = JSON.stringify({ completion: { prompt: "" }, text: "" })
    const result = claudeAdapter.validateRequestPayload(body)
    expect(result.valid).toBe(false)
    expect(result.failedCheck).toBe("request_shape")
  })

  it("should return valid: false when prompt is not a string", () => {
    const body = JSON.stringify({ completion: { prompt: 42 } })
    const result = claudeAdapter.validateRequestPayload(body)
    expect(result.valid).toBe(false)
    expect(result.failedCheck).toBe("request_shape")
  })

  it("should return valid: false for unparseable JSON", () => {
    const result = claudeAdapter.validateRequestPayload("{invalid json")
    expect(result.valid).toBe(false)
    expect(result.failedCheck).toBe("request_shape")
  })
})

describe("claudeAdapter.validateResponseChunk", () => {
  it("should return valid: true for a well-formed content_block_delta chunk", () => {
    const chunk = JSON.stringify({
      type: "content_block_delta",
      delta: { type: "text_delta", text: "Hello" },
    })
    expect(claudeAdapter.validateResponseChunk(chunk)).toEqual({ valid: true })
  })

  it("should return valid: true for a message_stop chunk", () => {
    const chunk = JSON.stringify({ type: "message_stop" })
    expect(claudeAdapter.validateResponseChunk(chunk)).toEqual({ valid: true })
  })

  it("should return valid: true for the empty stream marker", () => {
    expect(claudeAdapter.validateResponseChunk("")).toEqual({ valid: true })
  })

  it("should return valid: false for a non-JSON chunk", () => {
    const result = claudeAdapter.validateResponseChunk("bad data %%%")
    expect(result.valid).toBe(false)
    expect(result.failedCheck).toBe("response_shape")
  })

  it("should return valid: false for a plain non-object chunk", () => {
    const result = claudeAdapter.validateResponseChunk("plain text response")
    expect(result.valid).toBe(false)
    expect(result.failedCheck).toBe("response_shape")
  })
})
