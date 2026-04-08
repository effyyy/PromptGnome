/**
 * Validation tests for the DeepSeek provider adapter.
 * Covers request and response shape validation with edge cases.
 */

import { describe, it, expect } from "vitest"
import { deepseekAdapter } from "~src/providers/deepseek"

describe("deepseekAdapter.validateRequestPayload", () => {
  it("should return valid: true for a well-formed OpenAI-compatible payload", () => {
    const body = JSON.stringify({
      messages: [{ role: "user", content: "What is 2+2?" }],
      model: "deepseek-chat",
    })
    expect(deepseekAdapter.validateRequestPayload(body)).toEqual({ valid: true })
  })

  it("should return valid: false when messages field is missing", () => {
    const body = JSON.stringify({ prompt: "Hello" })
    const result = deepseekAdapter.validateRequestPayload(body)
    expect(result.valid).toBe(false)
    expect(result.failedCheck).toBe("request_shape")
  })

  it("should return valid: false when messages array is empty", () => {
    const body = JSON.stringify({ messages: [] })
    const result = deepseekAdapter.validateRequestPayload(body)
    expect(result.valid).toBe(false)
    expect(result.failedCheck).toBe("request_shape")
  })

  it("should return valid: false for unparseable JSON", () => {
    const result = deepseekAdapter.validateRequestPayload("not json")
    expect(result.valid).toBe(false)
    expect(result.failedCheck).toBe("request_shape")
  })

  it("should return valid: false for a JSON array instead of object", () => {
    const result = deepseekAdapter.validateRequestPayload("[]")
    expect(result.valid).toBe(false)
    expect(result.failedCheck).toBe("request_shape")
  })
})

describe("deepseekAdapter.validateResponseChunk", () => {
  it("should return valid: true for a well-formed SSE JSON chunk", () => {
    const chunk = JSON.stringify({
      choices: [{ delta: { content: "Hello!" }, finish_reason: null }],
    })
    expect(deepseekAdapter.validateResponseChunk(chunk)).toEqual({ valid: true })
  })

  it("should return valid: true for the [DONE] stream terminator", () => {
    expect(deepseekAdapter.validateResponseChunk("[DONE]")).toEqual({ valid: true })
  })

  it("should return valid: false for a non-JSON chunk", () => {
    const result = deepseekAdapter.validateResponseChunk("bad data")
    expect(result.valid).toBe(false)
    expect(result.failedCheck).toBe("response_shape")
  })

  it("should return valid: false for a plain string", () => {
    const result = deepseekAdapter.validateResponseChunk("text content")
    expect(result.valid).toBe(false)
    expect(result.failedCheck).toBe("response_shape")
  })

  it("should return valid: false for a JSON array", () => {
    const result = deepseekAdapter.validateResponseChunk("[1, 2, 3]")
    expect(result.valid).toBe(false)
    expect(result.failedCheck).toBe("response_shape")
  })
})
