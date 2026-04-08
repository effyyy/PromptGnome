/**
 * Filters PII matches that fall inside code blocks or URLs.
 * Prevents false positives from code examples and link content.
 * Architecture layer: Detection (pre/post-processing)
 */

import type { PIIMatch } from "./types"

/** Represents a range of text that should be excluded from PII detection */
interface ExcludedRange {
  start: number
  end: number
}

/**
 * Finds all fenced code block ranges (triple backticks) in text.
 * @param text - Input text to scan
 * @returns Array of excluded ranges for code blocks
 */
function findCodeBlocks(text: string): ExcludedRange[] {
  const ranges: ExcludedRange[] = []
  const pattern = /```[\s\S]*?```/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    ranges.push({ start: match.index, end: match.index + match[0].length })
  }
  return ranges
}

/**
 * Finds all inline code ranges (single backticks) in text,
 * scanning only outside fenced code blocks to avoid consuming
 * backticks that belong to fenced block boundaries.
 * @param text - Input text to scan
 * @param fencedRanges - Already-found fenced code block ranges
 * @returns Array of excluded ranges for inline code
 */
function findInlineCode(text: string, fencedRanges: ExcludedRange[]): ExcludedRange[] {
  let masked = text
  for (const r of fencedRanges) {
    masked = masked.slice(0, r.start) + " ".repeat(r.end - r.start) + masked.slice(r.end)
  }
  const ranges: ExcludedRange[] = []
  const pattern = /`[^`]+`/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(masked)) !== null) {
    ranges.push({ start: match.index, end: match.index + match[0].length })
  }
  return ranges
}

/**
 * Finds all URL ranges in text.
 * @param text - Input text to scan
 * @returns Array of excluded ranges for URLs
 */
function findURLs(text: string): ExcludedRange[] {
  const ranges: ExcludedRange[] = []
  const pattern = /https?:\/\/[^\s)>\]]+/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    ranges.push({ start: match.index, end: match.index + match[0].length })
  }
  return ranges
}

/**
 * Checks if a match position falls within any excluded range.
 * @param matchStart - Start position of the PII match
 * @param matchEnd - End position of the PII match
 * @param ranges - Array of excluded ranges
 * @returns true if the match is inside an excluded range
 */
function isInsideRange(matchStart: number, matchEnd: number, ranges: ExcludedRange[]): boolean {
  return ranges.some((r) => matchStart >= r.start && matchEnd <= r.end)
}

/**
 * Filters out PII matches that fall inside code blocks or URLs.
 * Matches inside excluded zones get confidence set to 0.0.
 * @param text - Original text that was scanned
 * @param matches - Array of PII matches to filter
 * @returns Filtered array with code block/URL matches removed
 * @example
 * ```ts
 * const filtered = filterCodeBlocks("```test@example.com```", matches)
 * // Returns empty array - email is inside code block
 * ```
 */
export function filterCodeBlocks(text: string, matches: PIIMatch[]): PIIMatch[] {
  const fenced = findCodeBlocks(text)
  const inline = findInlineCode(text, fenced)
  const urls = findURLs(text)

  const excludedRanges = [...fenced, ...inline, ...urls]

  if (excludedRanges.length === 0) return matches

  return matches.filter(
    (m) => !isInsideRange(m.start, m.end, excludedRanges)
  )
}
