/**
 * Validation tests for the Meta AI provider adapter.
 * Covers request and response shape validation with edge cases.
 */

import { describe, it, expect } from "vitest"
import { metaAiAdapter } from "~src/providers/meta-ai"

describe("metaAiAdapter.validateRequestPayload", () => {
  it("should return valid: true for a form-encoded body with variables (current primary)", () => {
    const body = `doc_id=7783822248314888&variables=${encodeURIComponent(JSON.stringify({ message: { text: "Hello" } }))}&fb_dtsg=token`;
    expect(metaAiAdapter.validateRequestPayload(body)).toEqual({ valid: true })
  })

  it("should return valid: true for a form-encoded body with doc_id", () => {
    const body = "doc_id=123456&fb_dtsg=token&__a=1";
    expect(metaAiAdapter.validateRequestPayload(body)).toEqual({ valid: true })
  })

  it("should return valid: true for a JSON GraphQL payload with variables", () => {
    const body = JSON.stringify({
      query: "mutation SendMessage($message: String!) { sendMessage(message: $message) { id } }",
      variables: { message: "Hello Meta AI!" },
    })
    expect(metaAiAdapter.validateRequestPayload(body)).toEqual({ valid: true })
  })

  it("should return valid: true for a direct message field payload", () => {
    const body = JSON.stringify({ message: "Hello Meta AI!" })
    expect(metaAiAdapter.validateRequestPayload(body)).toEqual({ valid: true })
  })

  it("should return valid: true for a text field payload", () => {
    const body = JSON.stringify({ text: "Hello Meta AI!" })
    expect(metaAiAdapter.validateRequestPayload(body)).toEqual({ valid: true })
  })

  it("should return valid: false when no recognized field is present", () => {
    const body = JSON.stringify({ operationName: "SomeOp" })
    const result = metaAiAdapter.validateRequestPayload(body)
    expect(result.valid).toBe(false)
    expect(result.failedCheck).toBe("request_shape")
  })

  it("should return valid: false for unparseable JSON", () => {
    const result = metaAiAdapter.validateRequestPayload("{not json")
    expect(result.valid).toBe(false)
    expect(result.failedCheck).toBe("request_shape")
  })
})

describe("metaAiAdapter.validateResponseChunk", () => {
  it("should return valid: true for a data.text streaming chunk", () => {
    const chunk = JSON.stringify({ data: { text: "Hello from Meta AI!" } })
    expect(metaAiAdapter.validateResponseChunk(chunk)).toEqual({ valid: true })
  })

  it("should return valid: true for the [DONE] stream terminator", () => {
    expect(metaAiAdapter.validateResponseChunk("[DONE]")).toEqual({ valid: true })
  })

  it("should return valid: true for an empty chunk", () => {
    expect(metaAiAdapter.validateResponseChunk("")).toEqual({ valid: true })
  })

  it("should return valid: false for a non-JSON chunk", () => {
    const result = metaAiAdapter.validateResponseChunk("garbage data &&&")
    expect(result.valid).toBe(false)
    expect(result.failedCheck).toBe("response_shape")
  })

  it("should return valid: false for a plain string chunk", () => {
    const result = metaAiAdapter.validateResponseChunk("response text here")
    expect(result.valid).toBe(false)
    expect(result.failedCheck).toBe("response_shape")
  })

  it("should return valid: false for a JSON array chunk", () => {
    const result = metaAiAdapter.validateResponseChunk("[1, 2, 3]")
    expect(result.valid).toBe(false)
    expect(result.failedCheck).toBe("response_shape")
  })
})
