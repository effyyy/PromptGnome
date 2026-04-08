/**
 * Detection mode router — orchestrates the detection pipeline based
 * on the user's selected accuracy mode (speed/balanced/maximum).
 *
 * The smart hybrid pipeline (voting, calibration, code-block filtering)
 * runs at ALL modes. The difference is which NER models are invoked.
 *
 * Architecture layer: Detection (orchestration)
 */

import type { PIIMatch, DetectionResult } from "./types";
import type { DetectionMode } from "~src/shared/constants";
import { detectPII } from "./regex-engine";
import { filterCodeBlocks } from "./code-block-filter";
import { applyVoting } from "./cross-detector-voting";
import { calibrateConfidence } from "./calibration";
import { createLogger } from "~src/utils/logger";

const log = createLogger("mode-router");

/**
 * Placeholder for local NER invocation.
 *
 * The actual NER call is wired in by the message-router at integration
 * time. This function signature defines the contract.
 *
 * @param text - Text to analyze.
 * @param mode - Detection mode ("balanced" or "maximum").
 * @returns Array of NER matches, or empty array on failure.
 */
export type NERInvokeFn = (text: string, mode: DetectionMode) => Promise<PIIMatch[]>;

/** Default NER function: no-op (used in speed mode or when NER unavailable). */
const NO_NER: NERInvokeFn = async () => [];

/** Stored NER function, set via `setNERInvoker`. */
let nerInvoke: NERInvokeFn = NO_NER;

/**
 * Registers the NER invocation function. Called once during service
 * worker initialization to wire in the local NER client.
 *
 * @param fn - Function that runs NER inference for the given mode.
 * @returns void
 *
 * @example
 * ```ts
 * setNERInvoker(async (text, mode) => localNerClient.run(text, mode));
 * ```
 */
export function setNERInvoker(fn: NERInvokeFn): void {
  nerInvoke = fn;
}

/**
 * Runs the full detection pipeline for the given mode.
 *
 * Pipeline stages (all modes):
 * 1. Regex detection
 * 2. Code-block / URL filtering
 * 3. NER detection (balanced/maximum only)
 * 4. Cross-detector voting
 * 5. Confidence calibration
 *
 * @param text - User message text to scan.
 * @param mode - Selected detection mode.
 * @returns Detection result with matches and timing data.
 * @throws Never — errors in NER are caught and logged; regex errors propagate
 *   only if the underlying engine itself throws.
 *
 * @example
 * ```ts
 * const result = await runDetection("My SSN is 123-45-6789", "balanced");
 * ```
 */
export async function runDetection(
  text: string,
  mode: DetectionMode,
): Promise<DetectionResult> {
  const start = performance.now();

  // Stage 1: Regex
  const regexStart = performance.now();
  const regexMatches = detectPII(text);
  const regexTimeMs = performance.now() - regexStart;

  // Stage 2: Code-block filter
  const codeFiltered = filterCodeBlocks(text, [...regexMatches]);

  // Stage 3: NER (skip in speed mode)
  let nerMatches: PIIMatch[] = [];
  let nerTimeMs: number | null = null;

  if (mode !== "speed") {
    const nerStart = performance.now();
    try {
      nerMatches = await nerInvoke(text, mode);
    } catch {
      log.warn("NER invocation failed — continuing with regex-only");
      nerMatches = [];
    }
    nerTimeMs = performance.now() - nerStart;
  }

  // Stage 4: Cross-detector voting
  const voted = applyVoting(codeFiltered, nerMatches);

  // Stage 5: Confidence calibration
  const calibrated = voted.map((m) => ({
    ...m,
    confidence: calibrateConfidence(m.confidence, m.type),
  }));

  const processingTimeMs = performance.now() - start;

  log.info("Detection complete", {
    mode,
    regexCount: codeFiltered.length,
    nerCount: nerMatches.length,
    finalCount: calibrated.length,
    regexTimeMs: Math.round(regexTimeMs),
    nerTimeMs: nerTimeMs !== null ? Math.round(nerTimeMs) : null,
    totalMs: Math.round(processingTimeMs),
  });

  return {
    matches: calibrated,
    processingTimeMs,
    regexTimeMs,
    nerTimeMs,
    textLength: text.length,
  };
}
