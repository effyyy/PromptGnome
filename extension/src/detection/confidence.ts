/**
 * Confidence scoring and thresholding for PII detection results.
 * Applies context-based adjustments and filters by user-configured thresholds.
 * Architecture layer: Detection (post-processing)
 */

import type { PIIMatch } from "./types"

/** Default confidence thresholds */
export const DEFAULT_WARN_THRESHOLD = 0.7
export const DEFAULT_ANONYMIZE_THRESHOLD = 0.85

/**
 * Filters matches below the given confidence threshold.
 * @param matches - Array of PII matches
 * @param threshold - Minimum confidence to keep (0.0 to 1.0)
 * @returns Filtered array with only matches at or above the threshold
 * @example
 * ```ts
 * const filtered = filterByConfidence(matches, 0.7)
 * ```
 */
export function filterByConfidence(
  matches: PIIMatch[],
  threshold: number
): PIIMatch[] {
  return matches.filter((m) => m.confidence >= threshold)
}

/**
 * Sorts matches by confidence descending, then by position.
 * @param matches - Array of PII matches
 * @returns New sorted array
 */
export function sortByConfidence(matches: PIIMatch[]): PIIMatch[] {
  return [...matches].sort(
    (a, b) => b.confidence - a.confidence || a.start - b.start
  )
}

/**
 * Groups matches by their PII type.
 * @param matches - Array of PII matches
 * @returns Record mapping PII type to array of matches of that type
 * @example
 * ```ts
 * const grouped = groupByType(matches)
 * // { EMAIL: [...], SSN: [...] }
 * ```
 */
export function groupByType(
  matches: PIIMatch[]
): Record<string, PIIMatch[]> {
  const groups: Record<string, PIIMatch[]> = {}
  for (const match of matches) {
    if (!groups[match.type]) {
      groups[match.type] = []
    }
    groups[match.type].push(match)
  }
  return groups
}

/**
 * Returns a human-readable summary of detected PII.
 * @param matches - Array of PII matches
 * @returns Summary string like "2 emails, 1 SSN"
 */
export function summarizeDetections(matches: PIIMatch[]): string {
  const grouped = groupByType(matches)
  const parts: string[] = []
  for (const [type, items] of Object.entries(grouped)) {
    parts.push(`${items.length} ${type.toLowerCase().replace(/_/g, " ")}`)
  }
  return parts.join(", ") || "no PII detected"
}
