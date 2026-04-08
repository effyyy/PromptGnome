/**
 * placeholder-scanner.ts — Rehydration layer
 *
 * Scans a text string for anonymization placeholders of the form [TYPE_N]
 * (e.g. [EMAIL_1], [NAME_2]) and returns their positions and metadata.
 * The set of recognised TYPE tokens is derived dynamically from the
 * PII_TYPES registry so new entity types are automatically picked up.
 */

import { PII_TYPES } from "~src/shared/constants"

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

/**
 * A single placeholder occurrence found within a scanned text string.
 */
export interface PlaceholderMatch {
  /** The full placeholder string, including brackets (e.g. "[EMAIL_1]"). */
  placeholder: string
  /** The placeholder type token (e.g. "EMAIL"). */
  type: string
  /** The 1-based counter appended to the type token (e.g. 1). */
  index: number
  /** Zero-based start offset of the placeholder within the source text. */
  start: number
  /** Zero-based exclusive end offset of the placeholder within the source text. */
  end: number
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Escapes all regex special characters in a string so it can be embedded
 * literally inside a RegExp pattern.
 *
 * @param value - The string to escape.
 * @returns The escaped string safe for use in a RegExp constructor.
 *
 * @example
 * escapeRegex("API_KEY") // => "API_KEY"
 * escapeRegex("C++")     // => "C\\+\\+"
 */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Builds and returns the compiled RegExp used to match placeholders.
 *
 * The pattern is constructed once from the unique set of `.placeholder`
 * values across all entries in {@link PII_TYPES}.  Longer tokens are listed
 * before shorter ones to ensure the most-specific alternative wins when one
 * token is a prefix of another (e.g. "NATIONAL_ID" before "N").
 *
 * The returned regex uses the global (`g`) flag so it can be used with
 * `exec()` in a loop.  Callers must reset `.lastIndex` to 0 before each
 * independent scan.
 *
 * @returns A global RegExp that matches `[TYPE_N]` placeholders.
 */
function buildPlaceholderRegex(): RegExp {
  const uniquePlaceholders = [
    ...new Set(
      Object.values(PII_TYPES).map((descriptor) => descriptor.placeholder),
    ),
  ]

  // Sort longest first so more-specific tokens match before shorter prefixes.
  uniquePlaceholders.sort((a, b) => b.length - a.length)

  const alternation = uniquePlaceholders.map(escapeRegex).join("|")
  return new RegExp(`\\[(${alternation})_(\\d+)\\]`, "g")
}

// Module-level compiled regex — built once, reused across all calls.
const PLACEHOLDER_REGEX = buildPlaceholderRegex()

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Scans `text` for anonymization placeholders of the form `[TYPE_N]` and
 * returns an array of {@link PlaceholderMatch} objects describing each
 * occurrence.
 *
 * The set of valid TYPE tokens is derived from the `.placeholder` fields of
 * {@link PII_TYPES}, so the scanner automatically recognises any new entity
 * types added to the registry.
 *
 * Returns an empty array when no placeholders are found.
 *
 * @param text - The string to scan (e.g. an AI response body or DOM text node).
 * @returns Ordered array of {@link PlaceholderMatch} objects, sorted by start offset.
 *
 * @example
 * const matches = scanForPlaceholders("Hello [NAME_1], your email is [EMAIL_1].")
 * // matches[0] => { placeholder: "[NAME_1]",  type: "NAME",  index: 1, start: 6,  end: 14 }
 * // matches[1] => { placeholder: "[EMAIL_1]", type: "EMAIL", index: 1, start: 30, end: 39 }
 */
export function scanForPlaceholders(text: string): PlaceholderMatch[] {
  // Reset lastIndex so repeated calls are independent regardless of how the
  // previous call terminated (mid-match timeout, early return, etc.).
  PLACEHOLDER_REGEX.lastIndex = 0

  const matches: PlaceholderMatch[] = []
  let match: RegExpExecArray | null

  while ((match = PLACEHOLDER_REGEX.exec(text)) !== null) {
    const [fullMatch, type, indexStr] = match
    const start = match.index
    const end = start + fullMatch.length

    matches.push({
      placeholder: fullMatch,
      type,
      index: parseInt(indexStr, 10),
      start,
      end,
    })
  }

  return matches
}
