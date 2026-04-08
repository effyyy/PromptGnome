/**
 * Validation tests for the Perplexity provider adapter.
 * Covers request and response shape validation with edge cases.
 */

import { describe, it, expect } from "vitest"
import { perplexityAdapter } from "~src/providers/perplexity"

describe("perplexityAdapter.validateRequestPayload", () => {
  it("should return valid: true for current SSE query_str format", () => {
    const body = JSON.stringify({ query_str: "What is the capital of France?", search_focus: "internet" })
    expect(perplexityAdapter.validateRequestPayload(body)).toEqual({ valid: true })
  })

  it("should return valid: true for a legacy search-mode query payload", () => {
    const body = JSON.stringify({ query: "What is the capital of France?" })
    expect(perplexityAdapter.validateRequestPayload(body)).toEqual({ valid: true })
  })

  it("should return valid: true for a chat-mode messages payload", () => {
    const body = JSON.stringify({
      messages: [{ role: "user", content: "Tell me about AI" }],
    })
    expect(perplexityAdapter.validateRequestPayload(body)).toEqual({ valid: true })
  })

  it("should return valid: false when neither query_str, query nor messages is present", () => {
    const body = JSON.stringify({ model: "pplx-70b-online" })
    const result = perplexityAdapter.validateRequestPayload(body)
    expect(result.valid).toBe(false)
    expect(result.failedCheck).toBe("request_shape")
  })

  it("should return valid: false when messages array is empty", () => {
    const body = JSON.stringify({ messages: [] })
    const result = perplexityAdapter.validateRequestPayload(body)
    expect(result.valid).toBe(false)
    expect(result.failedCheck).toBe("request_shape")
  })

  it("should return valid: false for unparseable JSON", () => {
    const result = perplexityAdapter.validateRequestPayload("{broken json")
    expect(result.valid).toBe(false)
    expect(result.failedCheck).toBe("request_shape")
  })
})

describe("perplexityAdapter.validateResponseChunk", () => {
  it("should return valid: true for a well-formed SSE JSON chunk", () => {
    const chunk = JSON.stringify({ output: "Paris is the capital of France." })
    expect(perplexityAdapter.validateResponseChunk(chunk)).toEqual({ valid: true })
  })

  it("should return valid: true for the [DONE] stream terminator", () => {
    expect(perplexityAdapter.validateResponseChunk("[DONE]")).toEqual({ valid: true })
  })

  it("should return valid: true for an empty chunk", () => {
    expect(perplexityAdapter.validateResponseChunk("")).toEqual({ valid: true })
  })

  it("should return valid: false for a non-JSON chunk", () => {
    const result = perplexityAdapter.validateResponseChunk("broken data !!!")
    expect(result.valid).toBe(false)
    expect(result.failedCheck).toBe("response_shape")
  })

  it("should return valid: false for a plain string", () => {
    const result = perplexityAdapter.validateResponseChunk("response text")
    expect(result.valid).toBe(false)
    expect(result.failedCheck).toBe("response_shape")
  })
})
