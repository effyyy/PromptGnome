/**
 * Text anonymization engine for the PromptGnome extension.
 *
 * Belongs to the anonymization layer. Accepts a raw text string and an array
 * of detected {@link PIIMatch} objects, substitutes each matched span with a
 * `[TYPE_N]` placeholder via {@link SessionMapper}, and returns the
 * anonymized result.
 */

// ---------------------------------------------------------------------------
// Architecture layer: Anonymization — text transformation
// Dependencies: ~src/shared/constants (PII_TYPES), ~src/detection/types,
//               ./session-mapper
// ---------------------------------------------------------------------------

import { PII_TYPES } from "~src/shared/constants"
import type { PIIMatch } from "~src/detection/types"
import type { SessionMapper } from "./session-mapper"
import { createLogger } from "~src/utils/logger"

const log = createLogger("anonymizer")

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Derives the placeholder label for a given PII type identifier by looking
 * it up in the {@link PII_TYPES} registry. Falls back to the raw `typeId`
 * string when the type is not registered (e.g. custom NER types).
 *
 * @param typeId - A key from `PII_TYPES` (e.g. `"PERSON_NAME"`) or any
 *   arbitrary string produced by a detector.
 * @returns The placeholder label (e.g. `"NAME"`) used when building
 *   `[TYPE_N]` strings.
 */
function getPlaceholderLabel(typeId: string): string {
  const descriptor = (PII_TYPES as Record<string, { placeholder: string } | undefined>)[typeId]
  return descriptor?.placeholder ?? typeId
}

// ---------------------------------------------------------------------------
// AnonymizeResult
// ---------------------------------------------------------------------------

/**
 * Output of a single {@link anonymizeText} call.
 */
export interface AnonymizeResult {
  /** The input text with every detected PII span replaced by a placeholder. */
  anonymizedText: string
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Replaces every PII span in `text` with a `[TYPE_N]` placeholder, using
 * `sessionMapper` to assign or reuse per-value placeholder strings.
 *
 * Replacements are applied right-to-left (highest start index first) so that
 * earlier span indices remain valid after each substitution.
 *
 * @param text - The original user message text.
 * @param matches - Detected PII spans, as returned by the detection pipeline.
 *   May be empty, in which case `text` is returned unchanged.
 * @param sessionMapper - The active session mapper. Updated in-place with any
 *   new placeholder assignments created during this call.
 * @returns An {@link AnonymizeResult} containing the anonymized text.
 *
 * @example
 * ```ts
 * const mapper = new SessionMapper()
 * const { anonymizedText } = anonymizeText(
 *   "My SSN is 123-45-6789",
 *   [{ type: "SSN", value: "123-45-6789", start: 10, end: 21, confidence: 0.95, source: "regex" }],
 *   mapper,
 * )
 * // anonymizedText === "My SSN is [SSN_1]"
 * ```
 */
export function anonymizeText(
  text: string,
  matches: readonly PIIMatch[],
  sessionMapper: SessionMapper,
): AnonymizeResult {
  if (matches.length === 0) {
    log.info("No matches to anonymize — returning text unchanged", {
      textLength: text.length,
    })
    return { anonymizedText: text }
  }

  const t0 = performance.now()

  // Collect type counts for logging (never log values).
  const typeCounts: Record<string, number> = {}
  for (const m of matches) {
    typeCounts[m.type] = (typeCounts[m.type] ?? 0) + 1
  }
  log.info("Anonymization started", {
    matchCount: matches.length,
    typeCounts,
    inputLength: text.length,
  })

  // Pass 1: assign placeholder numbers in left-to-right order so that the
  // first occurrence in the text always gets the lowest counter (_1, _2, …).
  const leftToRight = [...matches].sort((a, b) => a.start - b.start)
  const placeholderMap = new Map<PIIMatch, string>()
  for (const match of leftToRight) {
    // Prefer backend-supplied synthetic replacement value when available
    // (Pro + enableSyntheticReplacement); fall back to [TYPE_N] placeholder.
    const replacement = (match as any).synthetic
      ? (match as any).synthetic
      : sessionMapper.getOrCreatePlaceholder(getPlaceholderLabel(match.type), match.value)
    placeholderMap.set(match, replacement)
  }

  // Pass 2: apply substitutions right-to-left so earlier span indices remain
  // valid after each replacement (lengths may differ).
  const rightToLeft = [...matches].sort((a, b) => b.start - a.start)
  let result = text
  for (const match of rightToLeft) {
    const placeholder = placeholderMap.get(match) ?? ""
    result = result.slice(0, match.start) + placeholder + result.slice(match.end)
  }

  const elapsedMs = (performance.now() - t0).toFixed(2)
  log.info("Anonymization complete", {
    matchCount: matches.length,
    inputLength: text.length,
    outputLength: result.length,
    lengthDelta: result.length - text.length,
    elapsedMs,
  })

  return { anonymizedText: result }
}
