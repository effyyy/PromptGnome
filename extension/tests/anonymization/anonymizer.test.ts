import { describe, it, expect } from "vitest"
import { anonymizeText } from "~src/anonymization/anonymizer"
import { SessionMapper } from "~src/anonymization/session-mapper"
import type { PIIMatch } from "~src/detection/types"

function makeMatch(type: string, value: string, start: number, end: number): PIIMatch {
  return { type, value, start, end, confidence: 0.95, source: "regex" }
}

describe("anonymizeText", () => {
  it("should replace a single PII match with placeholder", () => {
    const mapper = new SessionMapper()
    const text = "My email is test@example.com ok"
    const matches = [makeMatch("EMAIL", "test@example.com", 12, 28)]
    const result = anonymizeText(text, matches, mapper)
    expect(result.anonymizedText).toBe("My email is [EMAIL_1] ok")
  })

  it("should replace multiple non-overlapping matches", () => {
    const mapper = new SessionMapper()
    const text = "Name: Jane Testperson, SSN: 123-45-6789"
    const matches = [
      makeMatch("PERSON_NAME", "Jane Testperson", 6, 21),
      makeMatch("SSN", "123-45-6789", 28, 39),
    ]
    const result = anonymizeText(text, matches, mapper)
    expect(result.anonymizedText).toBe("Name: [NAME_1], SSN: [SSN_1]")
  })

  it("should preserve string indices by processing right-to-left", () => {
    const mapper = new SessionMapper()
    const text = "a@b.com and c@d.com"
    const matches = [
      makeMatch("EMAIL", "a@b.com", 0, 7),
      makeMatch("EMAIL", "c@d.com", 12, 19),
    ]
    const result = anonymizeText(text, matches, mapper)
    expect(result.anonymizedText).toBe("[EMAIL_1] and [EMAIL_2]")
  })

  it("should return original text when no matches", () => {
    const mapper = new SessionMapper()
    const result = anonymizeText("hello world", [], mapper)
    expect(result.anonymizedText).toBe("hello world")
  })

  it("should reuse existing mapper entries", () => {
    const mapper = new SessionMapper()
    mapper.getOrCreatePlaceholder("EMAIL", "test@example.com")
    const text = "Email: test@example.com"
    const matches = [makeMatch("EMAIL", "test@example.com", 7, 23)]
    const result = anonymizeText(text, matches, mapper)
    expect(result.anonymizedText).toBe("Email: [EMAIL_1]")
  })
})
