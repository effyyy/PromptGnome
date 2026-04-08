/**
 * Null-object port for the feedback-collector service.
 *
 * Provides noop implementations of the functions consumed by message-router.ts
 * in the Free build. The Pro build (privito) wires in the real implementation
 * from feedback-collector.ts.
 *
 * Architecture layer: Services / Port interface (Free)
 */

import type { ProviderName } from "~src/shared/constants";
import type { MissedPIIReport } from "~src/shared/schemas";

/**
 * Records a single detection accuracy feedback event.
 * Noop in the Free build.
 *
 * @param _entityType - The PII type key.
 * @param _correct    - Whether the detection was correct.
 * @returns A promise that resolves immediately.
 */
export async function recordFeedback(
  _entityType: string,
  _correct: boolean,
): Promise<void> {
  // noop
}

/**
 * Returns accumulated feedback statistics.
 * Returns empty stats in the Free build.
 *
 * @returns An empty record.
 */
export async function getFeedbackStats(): Promise<
  Record<string, { correct: number; incorrect: number }>
> {
  return {};
}

/**
 * Records a privacy-safe description of missed PII.
 * Noop in the Free build.
 *
 * @param _entityType  - The PII type key.
 * @param _description - Privacy-safe description of the missed pattern.
 * @param _provider    - Optional provider where the miss occurred.
 * @returns A promise that resolves immediately.
 */
export async function reportMissedPII(
  _entityType: string,
  _description: string,
  _provider?: ProviderName,
): Promise<void> {
  // noop
}

/**
 * Returns locally stored privacy-safe missed-PII reports.
 * Returns empty array in the Free build.
 *
 * @returns An empty array.
 */
export async function getMissedPIIReports(): Promise<MissedPIIReport[]> {
  return [];
}
