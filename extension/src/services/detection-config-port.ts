/**
 * Null-object port for the detection-config service.
 *
 * Provides noop implementations of the functions consumed by message-router.ts
 * in the Free build. The Pro build (privito) wires in the real implementation.
 *
 * Architecture layer: Services / Port interface (Free)
 */

import type { PIIMatch } from "~src/detection/types";

/**
 * Loads the stored detection config from chrome.storage.local.
 * Always returns null in the Free build (no server-pushed config).
 *
 * @returns null — no config in the Free build.
 */
export async function loadStoredConfig(): Promise<null> {
  return null;
}

/**
 * Applies server-pushed confidence adjustments to PII matches.
 * Returns matches unchanged in the Free build.
 *
 * @param matches - The PII matches to adjust.
 * @returns The same matches unchanged.
 */
export function applyAdjustments(
  matches: PIIMatch[],
  _config: unknown,
  _text?: string,
): PIIMatch[] {
  return matches;
}
