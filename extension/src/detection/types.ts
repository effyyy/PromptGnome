/**
 * Type definitions for the PII detection pipeline.
 *
 * Every interface in this module is consumed by the regex-based detectors,
 * the optional NER detector, and the orchestration layer that merges their
 * results.  Keeping them separate from runtime constants avoids circular
 * imports and keeps the detection module self-contained.
 */

// ---------------------------------------------------------------------------
// PIITypeId – derived from the constant registry
// ---------------------------------------------------------------------------

/**
 * String-literal union of every PII entity type the extension can detect.
 *
 * Uses a string type to allow the regex engine to return matches without
 * importing the constants module (avoids circular deps). Consumers that
 * need strict type-checking can narrow with `keyof typeof PII_TYPES`.
 */
export type PIITypeId = string;

// ---------------------------------------------------------------------------
// PIIMatch – a single detected PII occurrence
// ---------------------------------------------------------------------------

/**
 * Represents a single occurrence of PII detected within a text input.
 *
 * Instances are created by individual detector functions and aggregated into
 * a {@link DetectionResult}.
 */
export interface PIIMatch {
  /** Which PII entity type was detected. */
  type: PIITypeId;

  /**
   * The raw text that matched.
   *
   * **Privacy note:** this value is used only for in-memory processing and
   * MUST NOT be persisted to storage or sent over the network.
   */
  value: string;

  /** Zero-based start index (inclusive) in the source text. */
  start: number;

  /** Zero-based end index (exclusive) in the source text. */
  end: number;

  /**
   * Confidence score in the range `[0, 1]`.
   *
   * - Regex-only matches typically report a fixed confidence (e.g. 0.95).
   * - NER-backed matches report the model's confidence directly.
   */
  confidence: number;

  /**
   * Which detection subsystem produced this match.
   *
   * `"regex"` for the built-in pattern matchers, `"ner"` for the
   * named-entity-recognition model, `"both"` when both sources agree.
   */
  source: "regex" | "ner" | "both";
}

// ---------------------------------------------------------------------------
// DetectionResult – the aggregate output of a full scan
// ---------------------------------------------------------------------------

/**
 * Aggregate output returned by the top-level detection orchestrator after
 * scanning a single text input.
 */
export interface DetectionResult {
  /** Ordered list of every PII match found (may be empty). */
  readonly matches: readonly PIIMatch[];

  /** Wall-clock milliseconds for the entire detection pass. */
  readonly processingTimeMs: number;

  /** Wall-clock milliseconds spent in the regex detection phase. */
  readonly regexTimeMs: number;

  /**
   * Wall-clock milliseconds spent in the NER detection phase.
   *
   * `null` when NER is disabled or unavailable (free tier / provider skipped).
   * `0` when NER ran but completed instantly.
   */
  readonly nerTimeMs: number | null;

  /** Character length of the original input text. */
  readonly textLength: number;
}

// ---------------------------------------------------------------------------
// DetectorFunction – contract for individual detector implementations
// ---------------------------------------------------------------------------

/**
 * Signature shared by every individual PII detector function.
 *
 * A detector receives the full input text and returns zero or more matches.
 * Implementations may be synchronous (regex) or asynchronous (NER), so the
 * return type is always a `Promise`.
 *
 * @param text - The raw user input to scan.
 * @returns A promise resolving to an array of matches (possibly empty).
 */
export type DetectorFunction = (text: string) => Promise<readonly PIIMatch[]>;
