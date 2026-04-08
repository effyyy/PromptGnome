/**
 * Type definitions for the real-time PII highlighting feature.
 *
 * This module is the foundation layer for highlighting — every other module
 * in `src/highlighting/` imports from here. It bridges the existing detection
 * pipeline (PIIMatch, PIITypeId from `src/detection/types`) with the DOM-aware
 * highlighting subsystem that annotates live textarea content.
 */

import type { PIIMatch, PIITypeId } from "~src/detection/types"

// Re-export upstream types so consumers only need one import.
export type { PIIMatch, PIITypeId }

// ---------------------------------------------------------------------------
// TextNodeOffset — a position inside a specific DOM Text node
// ---------------------------------------------------------------------------

/**
 * A character position anchored to a specific DOM {@link Text} node.
 *
 * When a contenteditable or textarea is rendered by the browser it may
 * contain multiple child {@link Text} nodes. This type maps a logical
 * character index in the concatenated plain text back to the exact node
 * and intra-node offset needed to interact with the Selection / Range API.
 *
 * @example
 * ```ts
 * const pos: TextNodeOffset = { node: someTextNode, offset: 5 }
 * const range = document.createRange()
 * range.setStart(pos.node, pos.offset)
 * ```
 */
export interface TextNodeOffset {
  /** The DOM Text node that contains this character position. */
  readonly node: Text
  /**
   * Zero-based character offset within {@link node}.
   *
   * Satisfies `0 <= offset <= node.length`.
   */
  readonly offset: number
}

// ---------------------------------------------------------------------------
// TextMapping — bidirectional map between plain text and DOM positions
// ---------------------------------------------------------------------------

/**
 * A snapshot of the flattened plain text for an element together with a
 * per-character lookup table that resolves each index back to the DOM
 * {@link Text} node that owns it.
 *
 * Produced by the input-monitor when the user edits a field and consumed
 * by the highlight renderer to place highlight ranges without re-walking
 * the DOM.
 *
 * @example
 * ```ts
 * const mapping: TextMapping = {
 *   plainText: "Hello world",
 *   offsets: [
 *     { node: firstTextNode, offset: 0 },
 *     // … one entry per character …
 *     { node: secondTextNode, offset: 3 },
 *   ],
 * }
 * // Resolve character index 7 back to the DOM:
 * const pos = mapping.offsets[7] // TextNodeOffset | null
 * ```
 */
export interface TextMapping {
  /** The full, concatenated plain-text content of the monitored element. */
  readonly plainText: string

  /**
   * Per-character DOM position lookup.
   *
   * `offsets[i]` is the {@link TextNodeOffset} for `plainText[i]`, or
   * `null` for virtual characters (e.g. block-element boundaries inserted
   * as newlines) that have no corresponding DOM node.
   *
   * Invariant: `offsets.length === plainText.length`.
   */
  readonly offsets: ReadonlyArray<TextNodeOffset | null>

  /**
   * The DOM element from which text was extracted.
   *
   * Used as a fallback coordinate reference for badge positioning when
   * per-character offsets are unavailable (e.g. textarea/input elements
   * where CSS Custom Highlight ranges cannot be created).
   */
  readonly sourceElement?: HTMLElement
}

// ---------------------------------------------------------------------------
// BadgePosition — layout information for an inline PII badge
// ---------------------------------------------------------------------------

/**
 * Describes where a PII badge should be rendered relative to the viewport.
 *
 * The highlight renderer computes one {@link BadgePosition} per detected
 * match and passes the array to the badge overlay component, which uses the
 * `rect` to position each badge absolutely.
 *
 * @example
 * ```ts
 * const badge: BadgePosition = {
 *   matchIndex: 0,
 *   type: "EMAIL",
 *   rect: range.getBoundingClientRect(),
 *   confidence: 0.97,
 * }
 * ```
 */
export interface BadgePosition {
  /**
   * Zero-based index of the corresponding match in the most recent
   * {@link OnMatchesCallback} call. Used to correlate badge interactions
   * with their source match.
   */
  readonly matchIndex: number

  /** The PII entity type that triggered this badge. */
  readonly type: PIITypeId

  /**
   * Bounding rectangle of the highlighted text range in viewport coordinates.
   *
   * Consumers should treat this as a snapshot — it is invalidated by any
   * layout change (scroll, resize, content edits).
   */
  readonly rect: DOMRect

  /**
   * Detection confidence score in `[0, 1]`.
   *
   * Passed through from {@link PIIMatch#confidence} so the badge component
   * can adjust visual weight without re-querying the match array.
   */
  readonly confidence: number
}

// ---------------------------------------------------------------------------
// FeedbackVerdict — user's opinion of a detected match
// ---------------------------------------------------------------------------

/**
 * The two ways a user can reject a PII badge:
 *
 * - `"not_pii"` — the highlighted text is not sensitive information at all.
 * - `"wrong_type"` — it is PII, but the detected entity type is incorrect.
 *
 * @example
 * ```ts
 * const verdict: FeedbackVerdict = "not_pii"
 * ```
 */
export type FeedbackVerdict = "not_pii" | "wrong_type"

// ---------------------------------------------------------------------------
// ContextCategory — the nature of the surrounding text
// ---------------------------------------------------------------------------

/**
 * Broad category of the text context surrounding a PII match.
 *
 * Used by the context classifier (`src/highlighting/context-classifier.ts`)
 * to adjust confidence scores and by feedback payloads to provide model-
 * retraining signal.
 *
 * | Value | Meaning |
 * |---|---|
 * | `"prose"` | Free-form natural language |
 * | `"code"` | Inside a code fence or pre/code block |
 * | `"url"` | Inside a URL or URI |
 * | `"structured_data"` | CSV, JSON, YAML, or similar structured text |
 *
 * @example
 * ```ts
 * const category: ContextCategory = "code"
 * ```
 */
export type ContextCategory = "prose" | "code" | "url" | "structured_data"

// ---------------------------------------------------------------------------
// FeedbackPayload — anonymized accuracy signal sent to the feedback queue
// ---------------------------------------------------------------------------

/**
 * Anonymized, privacy-safe payload submitted when a user disputes a PII
 * detection result.
 *
 * **Privacy contract:** this object must NEVER contain the original PII
 * value or any text that could be used to reconstruct it. Only hashes,
 * type labels, and statistical metadata are included.
 *
 * @example
 * ```ts
 * const payload: FeedbackPayload = {
 *   textHash: "a3f1c9…",
 *   detectedType: "PHONE_US",
 *   verdict: "not_pii",
 *   correctedType: undefined,
 *   source: "regex",
 *   confidence: 0.82,
 *   contextCategory: "code",
 *   regexPatternId: "phone-us-v2",
 *   reputationScore: 0.1,
 * }
 * ```
 */
export interface FeedbackPayload {
  /**
   * SHA-256 hex digest of the matched text value (lowercased, trimmed).
   *
   * Allows the backend to track repeated false positives without storing
   * the original string.
   */
  readonly textHash: string

  /** The entity type the detector reported. */
  readonly detectedType: PIITypeId

  /** The user's verdict on the detection. */
  readonly verdict: FeedbackVerdict

  /**
   * The type the user believes is correct.
   *
   * Present only when `verdict === "wrong_type"`. When the user selects a
   * corrected type from the badge menu this field carries their choice.
   */
  readonly correctedType?: PIITypeId

  /** Which detection subsystem produced the original match. */
  readonly source: "regex" | "ner" | "both"

  /** Confidence score reported by the detector, in `[0, 1]`. */
  readonly confidence: number

  /** Context category at the time of detection. */
  readonly contextCategory: ContextCategory

  /**
   * Identifier for the specific regex pattern that fired, if applicable.
   *
   * Populated for `source === "regex"` matches to enable pattern-level
   * accuracy tracking. `undefined` for NER-only matches.
   */
  readonly regexPatternId?: string

  /**
   * Aggregate reputation score for the matched text hash, in `[0, 1]`.
   *
   * Higher values indicate this hash has been confirmed as PII by other
   * users (or by previous feedback from the same user). Lower values
   * indicate repeated false-positive reports.
   */
  readonly reputationScore: number
}

// ---------------------------------------------------------------------------
// AllowlistEntry — a user-approved false positive
// ---------------------------------------------------------------------------

/**
 * A record indicating that the user has explicitly approved a particular
 * text value as a false positive for a given PII type.
 *
 * Persisted in `chrome.storage.local` by the local-allowlist module so
 * that the same value is never highlighted again for the same type.
 *
 * @example
 * ```ts
 * const entry: AllowlistEntry = {
 *   textHash: "a3f1c9…",
 *   type: "PHONE_US",
 *   dismissedAt: 1710000000000,
 *   dismissCount: 3,
 * }
 * ```
 */
export interface AllowlistEntry {
  /**
   * SHA-256 hex digest of the matched text value (lowercased, trimmed).
   *
   * Must match the same hashing scheme used in {@link FeedbackPayload#textHash}.
   */
  readonly textHash: string

  /** The PII type for which this value has been allowlisted. */
  readonly type: PIITypeId

  /**
   * Unix timestamp (milliseconds) when the entry was first created.
   *
   * Used to expire stale entries after a configurable TTL.
   */
  readonly dismissedAt: number

  /**
   * Number of times the user has dismissed highlights for this value + type
   * combination.
   *
   * Incremented on each dismissal. Used to weight reputation scoring.
   */
  dismissCount: number
}

// ---------------------------------------------------------------------------
// HighlightConfig — runtime configuration for the highlighting subsystem
// ---------------------------------------------------------------------------

/**
 * Runtime configuration consumed by every module in `src/highlighting/`.
 *
 * Sourced from `chrome.storage.sync` via the settings manager and passed
 * down through the integration module. Treating config as an immutable
 * snapshot per detection cycle prevents race conditions when the user
 * changes settings mid-session.
 *
 * @example
 * ```ts
 * const config: HighlightConfig = {
 *   enabled: true,
 *   isProUser: false,
 *   confidenceThreshold: 0.7,
 *   feedbackEnabled: true,
 *   nerEndpoint: "https://api.promptgnome.com/v1/analyze",
 * }
 * ```
 */
export interface HighlightConfig {
  /** Master switch — when `false` the entire highlighting subsystem is a no-op. */
  readonly enabled: boolean

  /**
   * Whether the current user has an active Pro subscription.
   *
   * Controls availability of NER-based entity types (PERSON_NAME,
   * ORGANIZATION, LOCATION, MEDICAL_TERM) and the auto-anonymize path.
   */
  readonly isProUser: boolean

  /**
   * Minimum confidence required to display a highlight badge, in `[0, 1]`.
   *
   * Matches below this threshold are silently discarded. Default: `0.7`.
   */
  readonly confidenceThreshold: number

  /**
   * Whether the feedback UI (thumbs-down / wrong-type menu) is shown on
   * highlight badges.
   *
   * When `false` the badge renders as read-only.
   */
  readonly feedbackEnabled: boolean

  /**
   * Base URL for the NER inference endpoint.
   *
   * Only contacted when `isProUser === true` AND the user has granted
   * `nerBackendConsent`. Defaults to `"https://api.promptgnome.com/v1/analyze"`.
   */
  readonly nerEndpoint: string
}

// ---------------------------------------------------------------------------
// Callback types — contracts for event-driven communication
// ---------------------------------------------------------------------------

/**
 * Callback invoked by the input monitor each time the plain-text content of
 * a monitored element changes.
 *
 * Consumers use this to keep their cached {@link TextMapping} up to date
 * before the next detection cycle.
 *
 * @param mapping - The fresh text mapping for the monitored element.
 *
 * @example
 * ```ts
 * const onTextChange: OnTextChangeCallback = (mapping) => {
 *   cachedMapping = mapping
 * }
 * ```
 */
export type OnTextChangeCallback = (mapping: TextMapping) => void

/**
 * Callback invoked by the detection scheduler each time a new set of PII
 * matches has been computed for the current text.
 *
 * Consumers (e.g. the highlight renderer) use this to synchronise their
 * highlight overlays with the latest detection results.
 *
 * @param matches - Ordered list of detected PII occurrences (may be empty).
 * @param mapping - The text mapping that was current when detection ran.
 *                  Passed alongside matches so the renderer can resolve DOM
 *                  positions without an additional re-walk.
 *
 * @example
 * ```ts
 * const onMatches: OnMatchesCallback = (matches, mapping) => {
 *   renderer.update(matches, mapping)
 * }
 * ```
 */
export type OnMatchesCallback = (
  matches: readonly PIIMatch[],
  mapping: TextMapping,
) => void
