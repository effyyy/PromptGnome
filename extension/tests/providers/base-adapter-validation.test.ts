import { describe, it, expect } from "vitest"
import type { BaseProviderAdapter, ValidationResult } from "~src/providers/base-adapter"

describe("ValidationResult interface", () => {
  it("should accept a valid result", () => {
    const result: ValidationResult = { valid: true }
    expect(result.valid).toBe(true)
  })
  it("should accept a failed result with details", () => {
    const result: ValidationResult = { valid: false, reason: "test", failedCheck: "request_shape" }
    expect(result.valid).toBe(false)
    expect(result.failedCheck).toBe("request_shape")
  })
})
describe("BaseProviderAdapter with validation", () => {
  it("should require validation methods", () => {
    const adapter = {
      name: "TEST", hostPatterns: [], urlPattern: /test/,
      extractUserMessage: () => null, extractResponseText: () => null,
      isStreamComplete: () => false, replaceUserMessage: () => null,
      validateRequestPayload: (_body: string): ValidationResult => ({ valid: true }),
      validateResponseChunk: (_chunk: string): ValidationResult => ({ valid: true }),
    } satisfies BaseProviderAdapter
    expect(adapter.validateRequestPayload("{}")).toEqual({ valid: true })
  })
})
