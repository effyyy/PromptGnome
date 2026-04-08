/**
 * Hybrid detection pipeline that merges regex and NER results.
 * Free tier: regex only. Pro tier: regex + NER with deduplication.
 * Architecture layer: Detection Engine
 *
 * Orchestrates the two detection subsystems, deduplicates overlapping spans,
 * applies the code-block filter, and enforces the user-configured confidence
 * threshold before returning a DetectionResult with full timing metadata.
 */

import type { PIIMatch, DetectionResult } from "./types";
import { detectPII as detectWithRegex } from "./regex-engine";
import { detectWithNER } from "./ner-engine";
import { filterCodeBlocks } from "./code-block-filter";
import { filterByConfidence, DEFAULT_WARN_THRESHOLD } from "./confidence";
import type { Settings } from "~src/shared/schemas";
import { createLogger } from "~src/utils/logger";

const log = createLogger("detection");

// ---------------------------------------------------------------------------
// DetectionOptions
// ---------------------------------------------------------------------------

/**
 * Options that control how the hybrid pipeline runs for a given message.
 */
export interface DetectionOptions {
  /**
   * Whether to invoke the backend NER service (Pro tier only).
   * When false, only the regex engine runs.
   */
  readonly useNER: boolean;

  /**
   * Maximum milliseconds to wait for the NER backend response.
   * Defaults to 800ms per the performance budget.
   */
  readonly nerTimeoutMs?: number;

  /**
   * Minimum confidence a match must reach to be returned.
   * Defaults to {@link DEFAULT_WARN_THRESHOLD} (0.7).
   */
  readonly confidenceThreshold?: number;

  /**
   * The current user settings object, required when useNER is true to
   * pass through to the NER engine (consent gating, endpoint config, etc.).
   */
  readonly settings?: Settings;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Checks whether two PII matches have overlapping character spans.
 *
 * @param a - First match.
 * @param b - Second match.
 * @returns true if the spans overlap.
 */
function spansOverlap(a: PIIMatch, b: PIIMatch): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * Merges a regex match and a NER match that cover the same span into a
 * single match with source "both" and confidence = max(a, b).
 *
 * The regex match's type takes precedence because regex types are more
 * specifically labelled; NER provides the confidence boost.
 *
 * @param regexMatch - Match from the regex engine.
 * @param nerMatch   - Match from the NER engine.
 * @returns Merged PIIMatch with source "both".
 */
function mergeMatches(regexMatch: PIIMatch, nerMatch: PIIMatch): PIIMatch {
  return {
    ...regexMatch,
    confidence: Math.max(regexMatch.confidence, nerMatch.confidence),
    source: "both",
  };
}

/**
 * Deduplicates and merges a combined list of regex and NER matches.
 *
 * Algorithm:
 * 1. For each regex match, check whether any NER match overlaps it.
 *    If so, produce a "both" match with max confidence and remove that
 *    NER match from the pool.
 * 2. Remaining NER matches (no regex overlap) are included as-is.
 * 3. The result is sorted by start position.
 *
 * When two matches of the same source overlap, only the higher-confidence
 * one is kept.
 *
 * @param regexMatches - Matches from the regex engine.
 * @param nerMatches   - Matches from the NER engine.
 * @returns Deduplicated, merged array sorted by start position.
 */
function deduplicateAndMerge(
  regexMatches: PIIMatch[],
  nerMatches: PIIMatch[],
): PIIMatch[] {
  const usedNERIndices = new Set<number>();
  const merged: PIIMatch[] = [];

  for (const regexMatch of regexMatches) {
    let bestNERIndex = -1;
    let bestNERConfidence = -1;

    for (let i = 0; i < nerMatches.length; i++) {
      if (usedNERIndices.has(i)) continue;
      if (spansOverlap(regexMatch, nerMatches[i])) {
        if (nerMatches[i].confidence > bestNERConfidence) {
          bestNERConfidence = nerMatches[i].confidence;
          bestNERIndex = i;
        }
      }
    }

    if (bestNERIndex >= 0) {
      usedNERIndices.add(bestNERIndex);
      merged.push(mergeMatches(regexMatch, nerMatches[bestNERIndex]));
    } else {
      merged.push(regexMatch);
    }
  }

  // Add remaining NER matches that had no regex overlap
  for (let i = 0; i < nerMatches.length; i++) {
    if (!usedNERIndices.has(i)) {
      merged.push(nerMatches[i]);
    }
  }

  // Resolve any remaining intra-source overlaps (keep highest confidence)
  return resolveIntraSourceOverlaps(merged);
}

/**
 * Removes intra-source overlapping matches, keeping the higher-confidence
 * match in each overlapping group.
 *
 * @param matches - Array of matches that may contain overlapping spans.
 * @returns Deduplicated array sorted by start position.
 */
function resolveIntraSourceOverlaps(matches: PIIMatch[]): PIIMatch[] {
  if (matches.length <= 1) return matches;

  const sorted = [...matches].sort(
    (a, b) => a.start - b.start || b.confidence - a.confidence,
  );
  const result: PIIMatch[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const last = result[result.length - 1];
    if (current.start < last.end) {
      // Overlapping — keep the higher-confidence one
      if (current.confidence > last.confidence) {
        result[result.length - 1] = current;
      }
    } else {
      result.push(current);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Runs the full PII detection pipeline on the provided text.
 *
 * **Free tier** (`options.useNER === false`):
 * - Runs regex detection only.
 * - Adds zero perceptible latency.
 *
 * **Pro tier** (`options.useNER === true`):
 * - Runs regex detection immediately, then awaits the NER backend.
 * - Merges results; overlapping spans are deduplicated and sourced as "both".
 * - Aborts NER automatically if it exceeds `nerTimeoutMs` (default 800ms).
 *
 * Matches are then:
 * 1. Filtered by the code-block filter (removes false positives in code fences).
 * 2. Filtered by `confidenceThreshold` (default 0.7).
 *
 * The pipeline never throws and never blocks the page — on any internal
 * error, it falls back to the last successfully computed result set.
 *
 * @param text    - The user message text to analyze.
 * @param options - Pipeline configuration (tier, timeout, threshold).
 * @returns A DetectionResult with matches and timing metadata.
 * @throws Never — all errors are caught internally (fail-open).
 * @example
 * ```ts
 * // Free-tier usage
 * const result = await detectPII("My email is test@example.com", { useNER: false })
 * // result.matches[0].type === "EMAIL"
 * // result.nerTimeMs === null
 *
 * // Pro-tier usage
 * const proResult = await detectPII("Call Jane at 555-867-5309", {
 *   useNER: true,
 *   settings,
 *   nerTimeoutMs: 800,
 *   confidenceThreshold: 0.7,
 * })
 * ```
 */
export async function detectPII(
  text: string,
  options: DetectionOptions,
): Promise<DetectionResult> {
  const pipelineStart = performance.now();

  const threshold = options.confidenceThreshold ?? DEFAULT_WARN_THRESHOLD;
  const nerTimeoutMs = options.nerTimeoutMs ?? 800;

  let regexMatches: PIIMatch[] = [];
  let nerMatches: PIIMatch[] = [];
  let regexTimeMs = 0;
  let nerTimeMs: number | null = null;

  // ── Step 1: Regex detection (always runs) ─────────────────────────────
  try {
    const regexStart = performance.now();
    regexMatches = detectWithRegex(text);
    regexTimeMs = Math.round(performance.now() - regexStart);
    log.debug("Regex detection complete", {
      matchCount: regexMatches.length,
      durationMs: regexTimeMs,
    });
  } catch (err) {
    log.warn("Regex detection threw — continuing with empty results", {
      errorName: err instanceof Error ? err.name : "unknown",
    });
  }

  // ── Step 2: NER detection (Pro only) ──────────────────────────────────
  if (options.useNER && options.settings) {
    try {
      const nerStart = performance.now();
      nerMatches = await detectWithNER(text, options.settings, "balanced", nerTimeoutMs);
      nerTimeMs = Math.round(performance.now() - nerStart);
      log.debug("NER detection complete", {
        matchCount: nerMatches.length,
        durationMs: nerTimeMs,
      });
    } catch (err) {
      log.warn("NER detection threw — falling back to regex-only", {
        errorName: err instanceof Error ? err.name : "unknown",
      });
      nerTimeMs = Math.round(performance.now() - pipelineStart) - regexTimeMs;
    }
  }

  // ── Step 3: Merge and deduplicate ─────────────────────────────────────
  let merged: PIIMatch[];
  try {
    merged = options.useNER
      ? deduplicateAndMerge(regexMatches, nerMatches)
      : regexMatches;
  } catch (err) {
    log.warn("Merge step threw — using regex-only results", {
      errorName: err instanceof Error ? err.name : "unknown",
    });
    merged = regexMatches;
  }

  // ── Step 4: Code-block filter ─────────────────────────────────────────
  let filtered: PIIMatch[];
  try {
    filtered = filterCodeBlocks(text, merged);
  } catch (err) {
    log.warn("Code-block filter threw — skipping filter", {
      errorName: err instanceof Error ? err.name : "unknown",
    });
    filtered = merged;
  }

  // ── Step 5: Confidence threshold ──────────────────────────────────────
  const thresholded = filterByConfidence(filtered, threshold);

  const processingTimeMs = Math.round(performance.now() - pipelineStart);

  log.info("Hybrid pipeline complete", {
    textLength: text.length,
    regexMatches: regexMatches.length,
    nerMatches: nerMatches.length,
    afterMerge: merged.length,
    afterCodeFilter: filtered.length,
    afterThreshold: thresholded.length,
    regexTimeMs,
    nerTimeMs: nerTimeMs ?? "n/a",
    processingTimeMs,
    useNER: options.useNER,
  });

  return {
    matches: thresholded,
    processingTimeMs,
    regexTimeMs,
    nerTimeMs,
    textLength: text.length,
  };
}
