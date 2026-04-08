/**
 * Per-type confidence calibration for PII detection results.
 * Maps raw detector confidence scores to empirically-calibrated values using
 * piecewise linear curves. Runs after cross-detector voting and before
 * threshold filtering in the hybrid detection pipeline.
 * Architecture layer: Detection (post-processing)
 */

// ---------------------------------------------------------------------------
// Calibration curve definitions
// ---------------------------------------------------------------------------

/**
 * A breakpoint in a piecewise linear calibration curve.
 * Index 0 is the raw confidence, index 1 is the calibrated confidence.
 */
type Breakpoint = readonly [number, number]

/**
 * A calibration curve is an ordered list of breakpoints sorted by raw
 * confidence (ascending). Must contain at least two breakpoints.
 */
type CalibrationCurve = readonly Breakpoint[]

/**
 * Per-entity-type piecewise linear calibration curves.
 *
 * Structured types (EMAIL, SSN, etc.) use curves that boost scores at high
 * confidence because regex patterns are highly reliable for these formats.
 *
 * NER-native types (PERSON_NAME, etc.) use conservative curves that reduce
 * scores at low-to-medium confidence because the model is less reliable
 * without strong contextual cues.
 */
const CALIBRATION_CURVES: Readonly<Record<string, CalibrationCurve>> = {
  // Structured types — regex is highly reliable, boost high-confidence
  EMAIL:       [[0.5, 0.45], [0.7, 0.70], [0.85, 0.90], [0.95, 0.98]],
  SSN:         [[0.5, 0.50], [0.7, 0.72], [0.85, 0.90], [0.95, 0.98]],
  CREDIT_CARD: [[0.5, 0.50], [0.7, 0.72], [0.85, 0.90], [0.95, 0.99]],
  PHONE_US:    [[0.5, 0.45], [0.7, 0.68], [0.85, 0.88], [0.95, 0.97]],
  PHONE_INTL:  [[0.5, 0.42], [0.7, 0.65], [0.85, 0.85], [0.95, 0.95]],

  // NER-native types — conservative calibration (model less reliable)
  PERSON_NAME:  [[0.5, 0.40], [0.7, 0.60], [0.85, 0.80], [0.95, 0.93]],
  ORGANIZATION: [[0.5, 0.38], [0.7, 0.58], [0.85, 0.78], [0.95, 0.92]],
  LOCATION:     [[0.5, 0.40], [0.7, 0.62], [0.85, 0.80], [0.95, 0.93]],
  MEDICAL_TERM: [[0.5, 0.35], [0.7, 0.55], [0.85, 0.75], [0.95, 0.90]],
} as const

// ---------------------------------------------------------------------------
// Core interpolation helper
// ---------------------------------------------------------------------------

/**
 * Applies piecewise linear interpolation to a raw confidence score using the
 * provided calibration curve.
 *
 * Rules:
 * - If `raw` is below the first breakpoint, return the first calibrated value.
 * - If `raw` is above the last breakpoint, return the last calibrated value.
 * - Otherwise, linearly interpolate between the surrounding two breakpoints.
 *
 * @param raw - Raw confidence score in [0, 1].
 * @param curve - Ordered array of [rawConfidence, calibratedConfidence] pairs.
 * @returns Interpolated calibrated confidence.
 */
function interpolate(raw: number, curve: CalibrationCurve): number {
  const first = curve[0]
  const last = curve[curve.length - 1]

  if (raw <= first[0]) {
    return first[1]
  }

  if (raw >= last[0]) {
    return last[1]
  }

  // Find the surrounding breakpoint pair
  for (let i = 0; i < curve.length - 1; i++) {
    const lo = curve[i]
    const hi = curve[i + 1]

    if (raw >= lo[0] && raw <= hi[0]) {
      const t = (raw - lo[0]) / (hi[0] - lo[0])
      return lo[1] + t * (hi[1] - lo[1])
    }
  }

  // Unreachable given the guards above, but satisfies the type system
  return last[1]
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Calibrates a raw detector confidence score to an empirically-adjusted value
 * using a per-entity-type piecewise linear curve.
 *
 * - Known entity types: score is mapped through the registered curve.
 * - Unknown entity types: identity mapping (calibrated = raw).
 * - Special case: raw === 0 always returns 0; this avoids spuriously raising
 *   a zero-confidence match to the first breakpoint's calibrated value.
 * - Output is always clamped to [0, 1].
 *
 * @param rawConfidence - The raw confidence score from a detector (0.0–1.0).
 *   Values outside [0, 1] are clamped at the output stage.
 * @param entityType - The PII entity type identifier (e.g. `"EMAIL"`, `"SSN"`).
 * @returns Calibrated confidence score in [0, 1].
 *
 * @example
 * ```ts
 * calibrateConfidence(0.95, "EMAIL")        // → 0.98  (boosted)
 * calibrateConfidence(0.70, "PERSON_NAME")  // → 0.60  (reduced)
 * calibrateConfidence(0.75, "UNKNOWN_TYPE") // → 0.75  (identity)
 * ```
 */
export function calibrateConfidence(
  rawConfidence: number,
  entityType: string
): number {
  // Special case: raw 0 must always return 0 to avoid raising it to the first
  // breakpoint's calibrated value (which would be misleading).
  if (rawConfidence === 0) {
    return 0
  }

  const curve = CALIBRATION_CURVES[entityType]

  const calibrated =
    curve !== undefined
      ? interpolate(rawConfidence, curve)
      : rawConfidence // identity for unknown types

  // Clamp to [0, 1]
  return Math.min(1, Math.max(0, calibrated))
}

/**
 * Returns the calibration curve for the given entity type, or `undefined` if
 * the type is not registered. Useful for introspection and testing.
 *
 * @param entityType - The PII entity type identifier.
 * @returns The calibration curve or `undefined`.
 */
export function getCalibrationCurve(
  entityType: string
): CalibrationCurve | undefined {
  return CALIBRATION_CURVES[entityType]
}
