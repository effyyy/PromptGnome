/**
 * Validation tests for the ChatGPT provider adapter.
 * Covers request and response shape validation with edge cases.
 */

import { describe, it, expect } from "vitest"
import { chatgptAdapter } from "~src/providers/chatgpt"

describe("chatgptAdapter.validateRequestPayload", () => {
  it("should return valid: true for a well-formed payload with content.parts", () => {
    const body = JSON.stringify({
      messages: [
        { role: "user", content: { parts: ["Hello, world!"] } },
      ],
    })
    expect(chatgptAdapter.validateRequestPayload(body)).toEqual({ valid: true })
  })

  it("should return valid: true for a payload with plain content string", () => {
    const body = JSON.stringify({
      messages: [
        { role: "user", content: "Hello, world!" },
      ],
    })
    expect(chatgptAdapter.validateRequestPayload(body)).toEqual({ valid: true })
  })

  it("should return valid: false when messages array is missing", () => {
    const body = JSON.stringify({ model: "gpt-4" })
    const result = chatgptAdapter.validateRequestPayload(body)
    expect(result.valid).toBe(false)
    expect(result.failedCheck).toBe("request_shape")
  })

  it("should return valid: false when messages array is empty", () => {
    const body = JSON.stringify({ messages: [] })
    const result = chatgptAdapter.validateRequestPayload(body)
    expect(result.valid).toBe(false)
    expect(result.failedCheck).toBe("request_shape")
  })

  it("should return valid: false when last message has no content field", () => {
    const body = JSON.stringify({
      messages: [{ role: "user" }],
    })
    const result = chatgptAdapter.validateRequestPayload(body)
    expect(result.valid).toBe(false)
    expect(result.failedCheck).toBe("request_shape")
  })

  it("should return valid: false for unparseable JSON", () => {
    const result = chatgptAdapter.validateRequestPayload("not json {{{")
    expect(result.valid).toBe(false)
    expect(result.failedCheck).toBe("request_shape")
  })
})

describe("chatgptAdapter.validateResponseChunk", () => {
  it("should return valid: true for a well-formed JSON response chunk", () => {
    const chunk = JSON.stringify({
      message: { author: { role: "assistant" }, content: { parts: ["Hi!"] } },
    })
    expect(chatgptAdapter.validateResponseChunk(chunk)).toEqual({ valid: true })
  })

  it("should return valid: true for the [DONE] stream terminator", () => {
    expect(chatgptAdapter.validateResponseChunk("[DONE]")).toEqual({ valid: true })
  })

  it("should return valid: false for a non-JSON chunk", () => {
    const result = chatgptAdapter.validateResponseChunk("not valid json !!!")
    expect(result.valid).toBe(false)
    expect(result.failedCheck).toBe("response_shape")
  })

  it("should return valid: false for a plain string chunk", () => {
    const result = chatgptAdapter.validateResponseChunk("just a string")
    expect(result.valid).toBe(false)
    expect(result.failedCheck).toBe("response_shape")
  })
})
