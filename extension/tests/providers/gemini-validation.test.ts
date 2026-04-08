/**
 * Validation tests for the Gemini provider adapter.
 * Covers request and response shape validation with edge cases.
 */

import { describe, it, expect } from "vitest"
import { geminiAdapter } from "~src/providers/gemini"

describe("geminiAdapter.validateRequestPayload", () => {
  it("should return valid: true for a form-encoded body with f.req (current BardChatUi)", () => {
    const body = `at=token&f.req=${encodeURIComponent(JSON.stringify([["Hello, Gemini!"]]))}`;
    expect(geminiAdapter.validateRequestPayload(body)).toEqual({ valid: true })
  })

  it("should return valid: true for a nested array payload (legacy)", () => {
    const body = JSON.stringify([["Hello, Gemini!", null, null]])
    expect(geminiAdapter.validateRequestPayload(body)).toEqual({ valid: true })
  })

  it("should return valid: true for a deeply nested array payload", () => {
    const body = JSON.stringify([[null, null, [["user message"]]]])
    expect(geminiAdapter.validateRequestPayload(body)).toEqual({ valid: true })
  })

  it("should return valid: false when body is a JSON object (not array or form-encoded)", () => {
    const body = JSON.stringify({ message: "text" })
    const result = geminiAdapter.validateRequestPayload(body)
    expect(result.valid).toBe(false)
    expect(result.failedCheck).toBe("request_shape")
  })

  it("should return valid: false for unparseable JSON without f.req", () => {
    const result = geminiAdapter.validateRequestPayload("[[not json")
    expect(result.valid).toBe(false)
    expect(result.failedCheck).toBe("request_shape")
  })

  it("should return valid: false for empty string", () => {
    const result = geminiAdapter.validateRequestPayload("")
    expect(result.valid).toBe(false)
    expect(result.failedCheck).toBe("request_shape")
  })
})

describe("geminiAdapter.validateResponseChunk", () => {
  it("should return valid: true for a JSON array response chunk", () => {
    const chunk = JSON.stringify([["response text", null]])
    expect(geminiAdapter.validateResponseChunk(chunk)).toEqual({ valid: true })
  })

  it("should return valid: true for the null stream terminator", () => {
    expect(geminiAdapter.validateResponseChunk("null")).toEqual({ valid: true })
  })

  it("should return valid: true for an empty chunk", () => {
    expect(geminiAdapter.validateResponseChunk("")).toEqual({ valid: true })
  })

  it("should return valid: false for a non-JSON chunk", () => {
    const result = geminiAdapter.validateResponseChunk("random binary data @#$")
    expect(result.valid).toBe(false)
    expect(result.failedCheck).toBe("response_shape")
  })

  it("should return valid: false for a plain string chunk", () => {
    const result = geminiAdapter.validateResponseChunk("just plain text")
    expect(result.valid).toBe(false)
    expect(result.failedCheck).toBe("response_shape")
  })
})
