/**
 * Cross-detector voting: merges regex and NER matches into a unified result.
 * Applies agreement boosts, structural-type penalties, and NER-native pass-through.
 * Architecture layer: Detection (post-processing, hybrid pipeline integration)
 *
 * This module is the authoritative merge step for the hybrid detection pipeline.
 * It replaces the naive `mergeMatches()` previously used in the message router.
 */

import type { PIIMatch } from "./types"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Confidence bonus applied when both regex and NER agree on the same span
 * and type.  Capped so the final confidence never exceeds 1.0.
 */
export const AGREEMENT_BOOST = 0.05 as const

/**
 * Confidence penalty applied to NER-only matches for types that should have
 * been caught by the regex engine.  A NER-only hit on a structured type
 * indicates a non-standard format, reducing trust.
 */
export const STRUCTURAL_PENALTY = 0.10 as const

/**
 * The set of PII types whose patterns are well-defined enough that the regex
 * engine should reliably detect them.  If NER fires alone for one of these
 * types, the match confidence is penalised by {@link STRUCTURAL_PENALTY}.
 */
export const STRUCTURED_TYPES: ReadonlySet<string> = new Set([
  "EMAIL",
  "SSN",
  "CREDIT_CARD",
  "PHONE_US",
  "PHONE_INTL",
  "IPV4",
  "IPV6",
  "IBAN",
  "AWS_ACCESS_KEY",
  "AWS_SECRET_KEY",
  "GITHUB_TOKEN",
  "STRIPE_KEY",
  "GENERIC_API_KEY",
  "PASSPORT_US",
  "DRIVERS_LICENSE",
  "ZIP_CODE",
  "DATE_OF_BIRTH",
  "STREET_ADDRESS",
])

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Builds a lookup key that uniquely identifies a match by its span and type.
 *
 * @param type  - PII entity type string.
 * @param start - Zero-based inclusive start index.
 * @param end   - Zero-based exclusive end index.
 * @returns A string key of the form `"TYPE:start:end"`.
 */
function spanKey(type: string, start: number, end: number): string {
  return `${type}:${start}:${end}`
}

/**
 * Clamps a confidence value to the range [0, 1].
 *
 * @param value - Raw confidence value.
 * @returns The clamped value.
 */
function clamp(value: number): number {
  return Math.min(1.0, Math.max(0.0, value))
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Merges regex and NER matches using the cross-detector voting rules:
 *
 * 1. **Both agree** (same span start+end AND same type): source = `"both"`,
 *    confidence = `min(1.0, max(regexConf, nerConf) + AGREEMENT_BOOST)`.
 *
 * 2. **NER-only on a structured type**: confidence = `nerConf − STRUCTURAL_PENALTY`
 *    (clamped to 0.0), source = `"ner"`.  These types should have been caught
 *    by regex, so a NER-only hit suggests a non-standard format.
 *
 * 3. **NER-only on an NER-native type** (`PERSON_NAME`, `ORGANIZATION`,
 *    `LOCATION`, `MEDICAL_TERM`): kept at face value, source = `"ner"`.
 *
 * 4. **Regex-only**: kept entirely unchanged.
 *
 * 5. **Empty NER array**: returns regex matches unchanged (speed / free-tier
 *    pass-through).  This rule takes precedence and returns immediately.
 *
 * The function is pure — it does **not** mutate the input arrays.
 *
 * @param regexMatches - Matches produced by the regex engine.
 * @param nerMatches   - Matches produced by the NER engine.  Pass an empty
 *                       array when NER is disabled or unavailable.
 * @returns Merged array of {@link PIIMatch} objects ready for confidence
 *          filtering and downstream processing.
 *
 * @example
 * ```ts
 * const merged = applyVoting(regexResults, nerResults)
 * const final  = filterByConfidence(merged, 0.7)
 * ```
 */
export function applyVoting(
  regexMatches: readonly PIIMatch[],
  nerMatches: readonly PIIMatch[]
): PIIMatch[] {
  // Rule 5: empty NER → immediate pass-through
  if (nerMatches.length === 0) {
    return regexMatches.slice()
  }

  const result: PIIMatch[] = []

  // Build a keyed index of NER matches for O(1) lookup.
  // Each key maps to the NER match; we also track which NER matches were
  // consumed by agreement so they are not re-emitted as standalone NER hits.
  const nerByKey = new Map<string, PIIMatch>()
  for (const nm of nerMatches) {
    nerByKey.set(spanKey(nm.type, nm.start, nm.end), nm)
  }
  const consumedNerKeys = new Set<string>()

  // Pass 1: process every regex match.
  for (const rm of regexMatches) {
    const key = spanKey(rm.type, rm.start, rm.end)
    const nm = nerByKey.get(key)

    if (nm !== undefined) {
      // Rule 1: both agree — boost confidence.
      const boosted = clamp(Math.max(rm.confidence, nm.confidence) + AGREEMENT_BOOST)
      result.push({
        type: rm.type,
        value: rm.value,
        start: rm.start,
        end: rm.end,
        confidence: boosted,
        source: "both",
      })
      consumedNerKeys.add(key)
    } else {
      // Rule 4: regex-only — keep unchanged.
      result.push({ ...rm })
    }
  }

  // Pass 2: emit unconsumed NER matches.
  for (const nm of nerMatches) {
    const key = spanKey(nm.type, nm.start, nm.end)
    if (consumedNerKeys.has(key)) {
      continue // already merged in pass 1
    }

    if (STRUCTURED_TYPES.has(nm.type)) {
      // Rule 2: NER-only on a structured type — penalise.
      result.push({
        ...nm,
        confidence: clamp(nm.confidence - STRUCTURAL_PENALTY),
      })
    } else {
      // Rule 3: NER-native type — keep at face value.
      result.push({ ...nm })
    }
  }

  return result
}
