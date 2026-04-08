/**
 * Null-object port for the backend NER client.
 *
 * Defines the interface that ner-engine.ts uses to call backend NER inference.
 * The Free build wires in the noop implementation (no backend call).
 * The Pro build (privito) wires in the real implementation from ner-client.ts.
 *
 * Architecture layer: Services / Port interface (Free)
 */

import type { PIIMatch } from "~src/detection/types";
import type { Settings } from "~src/shared/schemas";

/**
 * Port interface for backend NER text analysis.
 * The real implementation lives in src/services/ner-client.ts (Pro).
 */
export interface NerClientPort {
  /**
   * Analyzes text for PII using backend NER inference.
   * Returns null to signal "unavailable" (Free build noop).
   *
   * @param text     - The text to analyze.
   * @param settings - Current user settings (endpoint, consent flags).
   * @returns Array of PIIMatch objects, or null if unavailable.
   */
  analyzeText(
    text: string,
    settings: Settings,
  ): Promise<PIIMatch[] | null>;
}

/**
 * Noop implementation used in the Free build.
 * Always returns null to signal that backend NER is unavailable,
 * causing ner-engine.ts to skip the backend fallback path.
 */
export const noopNerClientPort: NerClientPort = {
  analyzeText: async (_text: string, _settings: Settings): Promise<null> => null,
};

/**
 * The active backend NER client for this build.
 *
 * In the Free build (this file), it is the noop port.
 * In the Pro build (privito), this file is replaced with a version that
 * imports and re-exports the real ner-client implementation.
 *
 * ner-engine.ts imports this symbol instead of directly importing from
 * ner-client.ts, which is a Pro-only module.
 */
export const activeNerClientPort: NerClientPort = noopNerClientPort;
