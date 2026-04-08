/**
 * Tests for src/highlighting/context-classifier.ts
 *
 * Covers every ContextCategory branch plus edge cases: ambiguous text,
 * boundary positions, deeply nested code fences, and mixed indicators.
 */

import { describe, it, expect } from "vitest"
import { classifyContext } from "../../src/highlighting/context-classifier"

// ---------------------------------------------------------------------------
// Helper — builds a text string with the PII value inserted at a known index.
// ---------------------------------------------------------------------------

/**
 * Inserts `pii` into `template` at the position marked by `{{}}` and returns
 * the full string together with the computed start/end indices.
 */
function buildText(
  template: string,
  pii: string,
): { text: string; start: number; end: number } {
  const marker = "{{}}"
  const idx = template.indexOf(marker)
  if (idx === -1) throw new Error("Template must contain '{{}}'")
  const text = template.slice(0, idx) + pii + template.slice(idx + marker.length)
  return { text, start: idx, end: idx + pii.length }
}

// ---------------------------------------------------------------------------
// prose
// ---------------------------------------------------------------------------

describe("classifyContext — prose", () => {
  it("should return 'prose' for a plain sentence", () => {
    const { text, start, end } = buildText(
      "Please contact me at {{}} for any questions.",
      "test@example.com",
    )
    expect(classifyContext(text, start, end)).toBe("prose")
  })

  it("should return 'prose' when there is no surrounding special syntax", () => {
    const { text, start, end } = buildText(
      "My SSN is {{}} and I need help.",
      "123-45-6789",
    )
    expect(classifyContext(text, start, end)).toBe("prose")
  })

  it("should return 'prose' for match at the very start of the string", () => {
    const pii = "test@example.com"
    expect(classifyContext(pii + " is my address", 0, pii.length)).toBe("prose")
  })

  it("should return 'prose' for match at the very end of the string", () => {
    const prefix = "Send to "
    const pii = "test@example.com"
    const text = prefix + pii
    expect(classifyContext(text, prefix.length, text.length)).toBe("prose")
  })

  it("should return 'prose' when context has only one JSON bracket", () => {
    // Single bracket is below the threshold of 2.
    const { text, start, end } = buildText(
      "I have { one bracket and my email is {{}}",
      "test@example.com",
    )
    expect(classifyContext(text, start, end)).toBe("prose")
  })

  it("should return 'prose' for an empty surrounding context", () => {
    const pii = "192.168.1.1"
    expect(classifyContext(pii, 0, pii.length)).toBe("prose")
  })
})

// ---------------------------------------------------------------------------
// code — code fence
// ---------------------------------------------------------------------------

describe("classifyContext — code fence", () => {
  it("should return 'code' when match is inside a triple-backtick fence", () => {
    const { text, start, end } = buildText(
      "Here is some code:\n```\nconst email = '{{}}'\n```\nEnd.",
      "test@example.com",
    )
    expect(classifyContext(text, start, end)).toBe("code")
  })

  it("should return 'code' for a match deep inside a long code fence", () => {
    const fence = "```\n" + "const x = 1\n".repeat(20)
    const pii = "jane@example.com"
    const text = fence + "// " + pii + "\n```"
    const start = text.indexOf(pii)
    const end = start + pii.length
    expect(classifyContext(text, start, end)).toBe("code")
  })

  it("should return 'prose' when match is after a closed code fence", () => {
    // Two ``` occurrences before the match → even count → outside fence.
    const { text, start, end } = buildText(
      "```\nsome code\n``` and then {{}} outside.",
      "test@example.com",
    )
    expect(classifyContext(text, start, end)).toBe("prose")
  })

  it("should return 'code' with language-tagged fence (```typescript)", () => {
    const { text, start, end } = buildText(
      "```typescript\nconst ssn = '{{}}'\n```",
      "123-45-6789",
    )
    expect(classifyContext(text, start, end)).toBe("code")
  })

  it("should return 'prose' when an even number of fences precede the match", () => {
    const { text, start, end } = buildText(
      "First fence:\n```\ncode\n```\nSecond fence:\n```\ncode2\n```\nNow prose: {{}}",
      "test@example.com",
    )
    expect(classifyContext(text, start, end)).toBe("prose")
  })
})

// ---------------------------------------------------------------------------
// code — inline code
// ---------------------------------------------------------------------------

describe("classifyContext — inline code", () => {
  it("should return 'code' when match is wrapped in single backticks", () => {
    const { text, start, end } = buildText(
      "Use the value `{{}}` in your config.",
      "test@example.com",
    )
    expect(classifyContext(text, start, end)).toBe("code")
  })

  it("should return 'code' for inline code with no spaces", () => {
    const { text, start, end } = buildText(
      "Run `{{}}` now.",
      "192.168.0.1",
    )
    expect(classifyContext(text, start, end)).toBe("code")
  })

  it("should return 'prose' when only one backtick is present (unclosed)", () => {
    // Backtick before but not after the match.
    const { text, start, end } = buildText(
      "The value `{{}} appears here without closing tick",
      "test@example.com",
    )
    expect(classifyContext(text, start, end)).toBe("prose")
  })

  it("should return 'prose' when only a backtick follows but not precedes", () => {
    const { text, start, end } = buildText(
      "The value {{}}` appears here",
      "test@example.com",
    )
    expect(classifyContext(text, start, end)).toBe("prose")
  })
})

// ---------------------------------------------------------------------------
// url
// ---------------------------------------------------------------------------

describe("classifyContext — url", () => {
  it("should return 'url' when the match is part of an https URL", () => {
    const pii = "test@example.com"
    const text = "Visit https://example.com/user/" + pii + " for details."
    const start = text.indexOf(pii)
    const end = start + pii.length
    expect(classifyContext(text, start, end)).toBe("url")
  })

  it("should return 'url' when the match is part of an http URL", () => {
    const pii = "user@mail.com"
    const text = "Old link: http://site.org/email/" + pii
    const start = text.indexOf(pii)
    const end = start + pii.length
    expect(classifyContext(text, start, end)).toBe("url")
  })

  it("should return 'url' when scheme immediately precedes the context window", () => {
    // Build a text where the scheme is within 100 chars before the match.
    const pii = "jane@example.com"
    const prefix = "https://service.example.com/accounts/"
    const text = prefix + pii + " rest"
    const start = prefix.length
    const end = start + pii.length
    expect(classifyContext(text, start, end)).toBe("url")
  })

  it("should return 'prose' for an email address in plain text (no URL scheme)", () => {
    const { text, start, end } = buildText(
      "Send a message to {{}} whenever you like.",
      "test@example.com",
    )
    expect(classifyContext(text, start, end)).toBe("prose")
  })
})

// ---------------------------------------------------------------------------
// structured_data — JSON
// ---------------------------------------------------------------------------

describe("classifyContext — structured_data (JSON)", () => {
  it("should return 'structured_data' for a match inside a JSON object", () => {
    const { text, start, end } = buildText(
      '{ "email": "{{}}", "name": "Jane" }',
      "test@example.com",
    )
    expect(classifyContext(text, start, end)).toBe("structured_data")
  })

  it("should return 'structured_data' when JSON braces appear in the window", () => {
    const { text, start, end } = buildText(
      '{"phone": "{{}}", "active": true}',
      "555-867-5309",
    )
    expect(classifyContext(text, start, end)).toBe("structured_data")
  })

  it("should return 'structured_data' for a JSON array context", () => {
    const { text, start, end } = buildText(
      '["{{}}","other@example.com"]',
      "first@example.com",
    )
    expect(classifyContext(text, start, end)).toBe("structured_data")
  })

  it("should return 'structured_data' for a key-value pair pattern", () => {
    const { text, start, end } = buildText(
      'data = { "ssn": "{{}}", "id": 42 }',
      "123-45-6789",
    )
    expect(classifyContext(text, start, end)).toBe("structured_data")
  })
})

// ---------------------------------------------------------------------------
// structured_data — XML/HTML
// ---------------------------------------------------------------------------

describe("classifyContext — structured_data (XML)", () => {
  it("should return 'structured_data' for a match inside XML tags", () => {
    const { text, start, end } = buildText(
      "<user><email>{{}}</email></user>",
      "test@example.com",
    )
    expect(classifyContext(text, start, end)).toBe("structured_data")
  })

  it("should return 'structured_data' for self-closing XML elements nearby", () => {
    const { text, start, end } = buildText(
      "<record ssn={{}} />",
      "123-45-6789",
    )
    expect(classifyContext(text, start, end)).toBe("structured_data")
  })

  it("should return 'structured_data' for HTML-like context", () => {
    const { text, start, end } = buildText(
      "<p>Contact: <span>{{}}</span></p>",
      "test@example.com",
    )
    expect(classifyContext(text, start, end)).toBe("structured_data")
  })
})

// ---------------------------------------------------------------------------
// Priority ordering — code beats structured_data, code fence beats inline
// ---------------------------------------------------------------------------

describe("classifyContext — priority ordering", () => {
  it("should prefer 'code' (fence) over 'structured_data' when both apply", () => {
    // JSON inside a code fence — should be classified as code.
    const { text, start, end } = buildText(
      '```\n{"email": "{{}}", "name": "x"}\n```',
      "test@example.com",
    )
    expect(classifyContext(text, start, end)).toBe("code")
  })

  it("should prefer 'code' (inline) over 'structured_data' when both apply", () => {
    const { text, start, end } = buildText(
      "Use `{\"key\": \"{{}}\"}` carefully",
      "test@example.com",
    )
    expect(classifyContext(text, start, end)).toBe("code")
  })

  it("should prefer 'code' over 'url' when URL is inside a code fence", () => {
    const { text, start, end } = buildText(
      "```\nhttps://example.com/{{}}\n```",
      "test@example.com",
    )
    expect(classifyContext(text, start, end)).toBe("code")
  })

  it("should prefer 'url' over 'structured_data' when URL scheme is present", () => {
    // URL scheme with JSON-like characters in path — url wins.
    const pii = "123-45-6789"
    const text = 'See https://api.example.com/{"ssn":"' + pii + '"}'
    const start = text.indexOf(pii)
    const end = start + pii.length
    // The URL scheme is present and close to the match, so url category expected.
    expect(classifyContext(text, start, end)).toBe("url")
  })
})

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("classifyContext — edge cases", () => {
  it("should handle match that spans the entire string", () => {
    const pii = "test@example.com"
    expect(classifyContext(pii, 0, pii.length)).toBe("prose")
  })

  it("should handle very long text where match is far from any structure", () => {
    const padding = "a".repeat(500)
    const pii = "jane@example.com"
    const text = padding + pii + padding
    const start = padding.length
    const end = start + pii.length
    expect(classifyContext(text, start, end)).toBe("prose")
  })

  it("should handle context window truncation when match is near string start", () => {
    const pii = "test@example.com"
    const text = pii + " hello world"
    expect(classifyContext(text, 0, pii.length)).toBe("prose")
  })

  it("should handle context window truncation when match is near string end", () => {
    const pii = "test@example.com"
    const text = "hello world " + pii
    expect(classifyContext(text, text.length - pii.length, text.length)).toBe(
      "prose",
    )
  })

  it("should return 'code' even when the code fence is far before the match", () => {
    // More than 100 chars between the fence opening and the match.
    const fence = "```\n"
    const filler = "x".repeat(200)
    const pii = "secret@example.com"
    const text = fence + filler + pii + "\n```"
    const start = text.indexOf(pii)
    const end = start + pii.length
    expect(classifyContext(text, start, end)).toBe("code")
  })

  it("should handle zero-length match gracefully", () => {
    const text = "Hello world"
    // Zero-length match at position 5.
    expect(() => classifyContext(text, 5, 5)).not.toThrow()
    expect(classifyContext(text, 5, 5)).toBe("prose")
  })
})
