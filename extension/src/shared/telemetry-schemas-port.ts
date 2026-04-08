/**
 * Null-object port for the telemetry-schemas module.
 *
 * Provides noop implementations of the functions consumed by message-router.ts
 * in the Free build. The Pro build (privito) imports the real schemas instead.
 *
 * Architecture layer: Shared / Port interface (Free)
 */

/** Privacy-safe bucket strings for text length ranges. */
export type TextLengthBucket = "0-50" | "50-200" | "200-500" | "500+";

/** Privacy-safe bucket strings for confidence ranges. */
export type ConfidenceBucket = "0.5-0.7" | "0.7-0.8" | "0.8-0.9" | "0.9-1.0";

/**
 * Maps an exact text length to its privacy-safe bucket.
 * Noop in the Free build — returns a static bucket string.
 *
 * @param _length - Exact character count.
 * @returns A static bucket string.
 */
export function toBucket(_length: number): TextLengthBucket {
  return "0-50";
}

/**
 * Maps a confidence score to its privacy-safe bucket.
 * Noop in the Free build — returns a static bucket string.
 *
 * @param _confidence - Detection confidence in [0, 1].
 * @returns A static bucket string.
 */
export function toConfidenceBucket(_confidence: number): ConfidenceBucket {
  return "0.9-1.0";
}
