/**
 * Validation tests for the Grok provider adapter.
 * Covers request and response shape validation with edge cases.
 */

import { describe, it, expect } from "vitest"
import { grokAdapter } from "~src/providers/grok"

describe("grokAdapter.validateRequestPayload", () => {
  it("should return valid: true for a responses array payload (current primary)", () => {
    const body = JSON.stringify({
      responses: [{ message: "Hello Grok!", sender: 1 }],
    })
    expect(grokAdapter.validateRequestPayload(body)).toEqual({ valid: true })
  })

  it("should return valid: true for a messages array payload (legacy)", () => {
    const body = JSON.stringify({
      messages: [{ role: "user", content: "Hello Grok!" }],
    })
    expect(grokAdapter.validateRequestPayload(body)).toEqual({ valid: true })
  })

  it("should return valid: true for a top-level message string payload", () => {
    const body = JSON.stringify({ message: "Hello Grok!" })
    expect(grokAdapter.validateRequestPayload(body)).toEqual({ valid: true })
  })

  it("should return valid: false when no recognized field is present", () => {
    const body = JSON.stringify({ model: "grok-1" })
    const result = grokAdapter.validateRequestPayload(body)
    expect(result.valid).toBe(false)
    expect(result.failedCheck).toBe("request_shape")
  })

  it("should return valid: false when messages array is empty", () => {
    const body = JSON.stringify({ messages: [] })
    const result = grokAdapter.validateRequestPayload(body)
    expect(result.valid).toBe(false)
    expect(result.failedCheck).toBe("request_shape")
  })

  it("should return valid: false for unparseable JSON", () => {
    const result = grokAdapter.validateRequestPayload("{{invalid")
    expect(result.valid).toBe(false)
    expect(result.failedCheck).toBe("request_shape")
  })
})

describe("grokAdapter.validateResponseChunk", () => {
  it("should return valid: true for an OpenAI-compatible SSE chunk", () => {
    const chunk = JSON.stringify({
      choices: [{ delta: { content: "Hello!" }, finish_reason: null }],
    })
    expect(grokAdapter.validateResponseChunk(chunk)).toEqual({ valid: true })
  })

  it("should return valid: true for the [DONE] stream terminator", () => {
    expect(grokAdapter.validateResponseChunk("[DONE]")).toEqual({ valid: true })
  })

  it("should return valid: true for an empty chunk", () => {
    expect(grokAdapter.validateResponseChunk("")).toEqual({ valid: true })
  })

  it("should return valid: false for non-JSON data", () => {
    const result = grokAdapter.validateResponseChunk("binary garbage @#$%")
    expect(result.valid).toBe(false)
    expect(result.failedCheck).toBe("response_shape")
  })

  it("should return valid: false for a plain string chunk", () => {
    const result = grokAdapter.validateResponseChunk("some text response")
    expect(result.valid).toBe(false)
    expect(result.failedCheck).toBe("response_shape")
  })
})
