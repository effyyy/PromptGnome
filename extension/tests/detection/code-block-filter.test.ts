/**
 * Tests for code block and URL filtering of PII matches.
 */
import { describe, it, expect } from "vitest"

import { filterCodeBlocks } from "../../src/detection/code-block-filter"
import type { PIIMatch } from "../../src/detection/types"

function makeMatch(start: number, end: number, type = "EMAIL"): PIIMatch {
  return { type, value: "test", start, end, confidence: 0.95, source: "regex" }
}

describe("filterCodeBlocks", () => {
  it("should keep matches outside code blocks", () => {
    const text = "Email: test@example.com is here"
    const matches = [makeMatch(7, 23)]
    const result = filterCodeBlocks(text, matches)
    expect(result).toHaveLength(1)
  })

  it("should remove matches inside fenced code blocks", () => {
    const text = "```\ntest@example.com\n```"
    const matches = [makeMatch(4, 20)]
    const result = filterCodeBlocks(text, matches)
    expect(result).toHaveLength(0)
  })

  it("should remove matches inside inline code", () => {
    const text = "Use `test@example.com` as an example"
    const matches = [makeMatch(5, 21)]
    const result = filterCodeBlocks(text, matches)
    expect(result).toHaveLength(0)
  })

  it("should remove matches inside URLs", () => {
    const text = "Visit https://user@example.com/path"
    const matches = [makeMatch(14, 30)]
    const result = filterCodeBlocks(text, matches)
    expect(result).toHaveLength(0)
  })

  it("should keep matches before and after code blocks", () => {
    const text = "a@b.com ```code``` c@d.com"
    const matches = [makeMatch(0, 7), makeMatch(19, 26)]
    const result = filterCodeBlocks(text, matches)
    expect(result).toHaveLength(2)
  })

  it("should handle text with no code blocks", () => {
    const text = "Plain text with test@example.com"
    const matches = [makeMatch(16, 32)]
    const result = filterCodeBlocks(text, matches)
    expect(result).toHaveLength(1)
  })

  it("should handle empty matches array", () => {
    const result = filterCodeBlocks("some text", [])
    expect(result).toHaveLength(0)
  })

  it("should handle multiple code blocks", () => {
    const text = "```\na@b.com\n``` then `c@d.org` then e@f.net"
    // a@b.com starts at 4, c@d.org starts at 22, e@f.net starts at 36
    const aStart = text.indexOf("a@b.com")
    const cStart = text.indexOf("c@d.org")
    const eStart = text.indexOf("e@f.net")
    const matches = [
      makeMatch(aStart, aStart + 7),   // inside ``` fenced block
      makeMatch(cStart, cStart + 7),   // inside ` inline code
      makeMatch(eStart, eStart + 7)    // plain text — should survive
    ]
    const result = filterCodeBlocks(text, matches)
    expect(result).toHaveLength(1)
    expect(result[0].start).toBe(eStart)
  })
})
