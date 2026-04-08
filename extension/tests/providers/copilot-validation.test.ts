/**
 * Validation tests for the Copilot provider adapter.
 * Covers request and response shape validation with edge cases.
 */

import { describe, it, expect } from "vitest"
import { copilotAdapter } from "~src/providers/copilot"

describe("copilotAdapter.validateRequestPayload", () => {
  it("should return valid: true for a direct message string payload", () => {
    const body = JSON.stringify({ message: "Help me write code" })
    expect(copilotAdapter.validateRequestPayload(body)).toEqual({ valid: true })
  })

  it("should return valid: true for an OpenAI-compatible messages array payload", () => {
    const body = JSON.stringify({
      messages: [{ role: "user", content: "Help me write code" }],
    })
    expect(copilotAdapter.validateRequestPayload(body)).toEqual({ valid: true })
  })

  it("should return valid: true for a Sydney/legacy arguments payload", () => {
    const body = JSON.stringify({
      arguments: [{ messages: [{ text: "Help me write code" }] }],
    })
    expect(copilotAdapter.validateRequestPayload(body)).toEqual({ valid: true })
  })

  it("should return valid: false when no recognized message field is present", () => {
    const body = JSON.stringify({ model: "gpt-4" })
    const result = copilotAdapter.validateRequestPayload(body)
    expect(result.valid).toBe(false)
    expect(result.failedCheck).toBe("request_shape")
  })

  it("should return valid: false for unparseable JSON", () => {
    const result = copilotAdapter.validateRequestPayload("{not valid")
    expect(result.valid).toBe(false)
    expect(result.failedCheck).toBe("request_shape")
  })
})

describe("copilotAdapter.validateResponseChunk", () => {
  it("should return valid: true for a text chunk", () => {
    const chunk = JSON.stringify({ text: "Here is my response" })
    expect(copilotAdapter.validateResponseChunk(chunk)).toEqual({ valid: true })
  })

  it("should return valid: true for the [DONE] stream terminator", () => {
    expect(copilotAdapter.validateResponseChunk("[DONE]")).toEqual({ valid: true })
  })

  it("should return valid: true for a final type marker", () => {
    const chunk = JSON.stringify({ type: "final" })
    expect(copilotAdapter.validateResponseChunk(chunk)).toEqual({ valid: true })
  })

  it("should return valid: true for an empty chunk", () => {
    expect(copilotAdapter.validateResponseChunk("")).toEqual({ valid: true })
  })

  it("should return valid: false for a non-JSON chunk", () => {
    const result = copilotAdapter.validateResponseChunk("bad data ??!")
    expect(result.valid).toBe(false)
    expect(result.failedCheck).toBe("response_shape")
  })

  it("should return valid: false for a plain string chunk", () => {
    const result = copilotAdapter.validateResponseChunk("plain response text")
    expect(result.valid).toBe(false)
    expect(result.failedCheck).toBe("response_shape")
  })
})
