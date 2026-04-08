/**
 * Context classifier for the real-time PII highlighting feature.
 *
 * Examines text surrounding a PII match to determine the broad context
 * category (prose, code, url, structured_data). The result is stored in
 * FeedbackPayload.contextCategory so the backend can weight false-positive
 * reports appropriately — e.g. a phone number inside a JSON blob is a
 * different kind of false positive than one in natural language.
 *
 * Layer: src/highlighting — detection metadata enrichment.
 */

import type { ContextCategory } from "./types"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Number of characters examined on each side of the match. */
const CONTEXT_WINDOW = 100

/** Minimum JSON/XML indicator count to classify as structured_data. */
const STRUCTURED_DATA_THRESHOLD = 2

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Counts occurrences of a substring in a string.
 *
 * @param haystack - The string to search within.
 * @param needle - The substring to count.
 * @returns The number of non-overlapping occurrences.
 */
function countOccurrences(haystack: string, needle: string): number {
  let count = 0
  let pos = 0
  while ((pos = haystack.indexOf(needle, pos)) !== -1) {
    count++
    pos += needle.length
  }
  return count
}

/**
 * Checks whether the match is inside a code fence (``` ... ```).
 *
 * Counts triple-backtick occurrences before the match start. An odd count
 * means we are inside an open fence.
 *
 * @param textBefore - All text in the document before the match start.
 * @returns `true` if the match is inside a code fence.
 */
function isInsideCodeFence(textBefore: string): boolean {
  return countOccurrences(textBefore, "```") % 2 === 1
}

/**
 * Checks whether the match is inside an inline code span (` ... `).
 *
 * Scans within {@link CONTEXT_WINDOW} chars on each side for a single
 * backtick. Ignores double-backticks (which are escape sequences, not spans).
 *
 * @param before - Up-to-100-char prefix before the match.
 * @param after - Up-to-100-char suffix after the match.
 * @returns `true` if single backticks surround the match.
 */
function isInsideInlineCode(before: string, after: string): boolean {
  // Strip double-backticks so they don't falsely count as single ones.
  const cleanBefore = before.replace(/``/g, "")
  const cleanAfter = after.replace(/``/g, "")
  return cleanBefore.includes("`") && cleanAfter.includes("`")
}

/**
 * Checks whether the match falls inside a URL.
 *
 * Looks for an `https?://` scheme that starts within the context window and
 * extends to at least the match start, or checks if the prefix ends with
 * common URL-interior characters immediately following `://`.
 *
 * @param before - Up-to-100-char prefix before the match.
 * @param after - Up-to-100-char suffix after the match.
 * @returns `true` if the match appears to be part of a URL.
 */
function isInsideUrl(before: string, after: string): boolean {
  // Check for an https?:// that hasn't been terminated by whitespace yet.
  const urlPrefixPattern = /https?:\/\/[^\s]*$/
  if (urlPrefixPattern.test(before)) {
    return true
  }
  // Check if the combined context forms a URL pattern around the match.
  const combined = before + after
  if (/https?:\/\//.test(combined)) {
    // Verify the URL anchor is close to the match (within the window).
    const schemeIndex = combined.search(/https?:\/\//)
    const matchRelativePos = before.length
    return Math.abs(matchRelativePos - schemeIndex) <= CONTEXT_WINDOW
  }
  return false
}

/**
 * Checks whether the surrounding context looks like structured data.
 *
 * Counts JSON-style indicators (`{`, `}`, `[`, `]`, `": "`) and
 * XML-style indicators (`<`, `>`, `</`, `/>`). Returns `true` if either
 * set reaches {@link STRUCTURED_DATA_THRESHOLD}.
 *
 * @param surrounding - Context window text (before + after combined).
 * @returns `true` if the context is likely structured data.
 */
function isInsideStructuredData(surrounding: string): boolean {
  const jsonScore =
    countOccurrences(surrounding, "{") +
    countOccurrences(surrounding, "}") +
    countOccurrences(surrounding, "[") +
    countOccurrences(surrounding, "]") +
    countOccurrences(surrounding, '": "')

  if (jsonScore >= STRUCTURED_DATA_THRESHOLD) return true

  const xmlScore =
    countOccurrences(surrounding, "<") +
    countOccurrences(surrounding, ">") +
    countOccurrences(surrounding, "</") +
    countOccurrences(surrounding, "/>")

  return xmlScore >= STRUCTURED_DATA_THRESHOLD
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Classifies the context surrounding a PII match within a larger text.
 *
 * The algorithm checks candidate categories in priority order:
 * 1. Code fence — triple backticks before match start (odd count = inside fence)
 * 2. Inline code — single backtick on each side within 100 chars
 * 3. URL — `https?://` pattern found in the surrounding context window
 * 4. Structured data — JSON or XML indicator count >= 2 in context window
 * 5. Default — "prose"
 *
 * @param fullText - The complete text string containing the match.
 * @param matchStart - Zero-based start index of the match in `fullText`.
 * @param matchEnd - Zero-based exclusive end index of the match in `fullText`.
 * @returns The {@link ContextCategory} that best describes the match context.
 *
 * @example
 * ```ts
 * classifyContext("My email is test@example.com today", 11, 27)
 * // => "prose"
 *
 * classifyContext("```\nconst x = 'test@example.com'\n```", 17, 33)
 * // => "code"
 *
 * classifyContext("Visit https://example.com/user/test@example.com", 27, 43)
 * // => "url"
 * ```
 */
export function classifyContext(
  fullText: string,
  matchStart: number,
  matchEnd: number,
): ContextCategory {
  const textBefore = fullText.slice(0, matchStart)
  const contextBefore = textBefore.slice(-CONTEXT_WINDOW)
  const contextAfter = fullText.slice(matchEnd, matchEnd + CONTEXT_WINDOW)
  const surrounding = contextBefore + contextAfter

  // 1. Code fence check (uses full text before match, not just window).
  if (isInsideCodeFence(textBefore)) return "code"

  // 2. Inline code check.
  if (isInsideInlineCode(contextBefore, contextAfter)) return "code"

  // 3. URL check.
  if (isInsideUrl(contextBefore, contextAfter)) return "url"

  // 4. Structured data check.
  if (isInsideStructuredData(surrounding)) return "structured_data"

  // 5. Default.
  return "prose"
}
