/**
 * NER engine wrapper for Pro-tier PII detection.
 *
 * Supports two inference paths:
 * 1. **Local NER** (preferred): Runs Transformers.js + ONNX in an offscreen
 *    document. Zero data leaves the browser. No consent gate needed.
 * 2. **Backend NER** (fallback): Sends text to the backend API.
 *    Requires explicit user consent (`nerBackendConsent === true`).
 *
 * The engine tries local NER first. If local inference is unavailable or
 * fails, it falls back to the backend path (when consented). Returns an
 * empty array on any failure (fail-open design).
 *
 * Architecture layer: Detection Engine
 */

import type { PIIMatch } from "./types";
import { analyzeTextLocally } from "~src/services/local-ner-client";
import type { Settings } from "~src/shared/schemas";
import { createLogger } from "~src/utils/logger";
import { activeNerClientPort } from "~src/services/ner-client-port";

/**
 * The active backend NER implementation.
 * Resolved by ner-client-port.ts: real client in Pro build, noop in Free.
 */
const backendNerClient = activeNerClientPort;

const log = createLogger("ner-engine");

/** Default maximum time allowed for a NER request per performance budget. */
const DEFAULT_NER_TIMEOUT_MS = 800;

/** Timeout per chunk for local NER inference (ms). Each chunk is processed
 *  sequentially by the BERT model, so total time scales linearly. 10s per
 *  chunk accommodates cold-start model loading on the first chunk plus
 *  warm inference time on subsequent ones. */
const LOCAL_NER_PER_CHUNK_TIMEOUT_MS = 10_000;

/** Must mirror the chunking constants in ner-worker.ts so we can estimate
 *  how many chunks the offscreen worker will produce for a given text. */
const NER_MAX_CHUNK_LENGTH = 2048;
const NER_CHUNK_OVERLAP = 200;

/**
 * Estimates the number of chunks the NER worker will create for a text.
 * Mirrors the `chunkText` logic in `ner-worker.ts`.
 *
 * @param textLen - Character length of the input text.
 * @returns Estimated chunk count (always >= 1).
 */
function estimateChunkCount(textLen: number): number {
  if (textLen <= NER_MAX_CHUNK_LENGTH) return 1;
  const stride = NER_MAX_CHUNK_LENGTH - NER_CHUNK_OVERLAP;
  return Math.ceil(textLen / stride);
}

/**
 * Calculates the local NER timeout based on text length.
 * Allocates {@link LOCAL_NER_PER_CHUNK_TIMEOUT_MS} per estimated chunk.
 *
 * @param textLen - Character length of the input text.
 * @returns Timeout in milliseconds.
 */
function calculateLocalNERTimeout(textLen: number): number {
  return estimateChunkCount(textLen) * LOCAL_NER_PER_CHUNK_TIMEOUT_MS;
}

// ---------------------------------------------------------------------------
// Timeout helper
// ---------------------------------------------------------------------------

/**
 * Returns a promise that resolves to null after the given delay.
 * Used to race against the NER client call.
 *
 * @param ms - Milliseconds to wait before resolving.
 * @returns A promise that resolves to null after the timeout.
 */
function timeoutPromise(ms: number): Promise<null> {
  return new Promise<null>((resolve) => {
    setTimeout(() => resolve(null), ms);
  });
}

// ---------------------------------------------------------------------------
// Local NER path
// ---------------------------------------------------------------------------

/**
 * Attempts local NER inference via the offscreen document.
 *
 * @param text      - The user message text to analyze.
 * @param timeoutMs - Maximum milliseconds to wait for inference.
 * @param mode      - Detection mode forwarded to the offscreen worker.
 * @returns Array of PIIMatch objects, or null if local NER is unavailable.
 */
async function tryLocalNER(
  text: string,
  timeoutMs: number,
  mode = "balanced",
): Promise<PIIMatch[] | null> {
  try {
    const result = await Promise.race([
      analyzeTextLocally(text, mode, timeoutMs),
      timeoutPromise(timeoutMs),
    ]);

    if (result === null) return null;

    return result.map((m) => ({ ...m, source: "ner" as const }));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Backend NER path
// ---------------------------------------------------------------------------

/**
 * Runs backend NER inference with timeout.
 *
 * @param text      - The user message text to analyze.
 * @param settings  - Current user settings (gates backend consent).
 * @param timeoutMs - Maximum milliseconds to wait for the backend.
 * @returns Array of PIIMatch objects, or null on failure.
 */
async function tryBackendNER(
  text: string,
  settings: Settings,
  timeoutMs: number,
): Promise<PIIMatch[] | null> {
  try {
    const result = await Promise.race([
      backendNerClient.analyzeText(text, settings),
      timeoutPromise(timeoutMs),
    ]);

    if (result === null) return null;

    return result.map((m) => ({ ...m, source: "ner" as const }));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Runs NER-based PII detection on the provided text.
 *
 * Strategy:
 * 1. If mode is "speed", skip NER entirely and return empty array.
 * 2. Try local NER (no data leaves browser, runs for ALL users).
 * 3. If local NER is unavailable or returns null, fall back to backend NER
 *    (only when user has explicitly consented).
 * 4. If both fail, return empty array (fail-open).
 *
 * Enforces timeout budgets on each path independently.
 *
 * @param text      - The user message text to analyze.
 * @param settings  - Current user settings (gates backend consent checks).
 * @param mode      - Detection mode ("speed" | "balanced" | "maximum").
 *                    Defaults to "balanced". "speed" skips NER entirely.
 * @param timeoutMs - Maximum milliseconds for the backend NER path.
 *                    Defaults to {@link DEFAULT_NER_TIMEOUT_MS} (800ms).
 *                    Local NER timeout is calculated dynamically as
 *                    {@link LOCAL_NER_PER_CHUNK_TIMEOUT_MS} × chunk count.
 * @returns Array of PIIMatch objects with source "ner", or empty array on
 *          any failure.
 * @throws Never — all errors are caught internally (fail-open).
 * @example
 * ```ts
 * const matches = await detectWithNER("My name is Jane Testperson", settings, "balanced")
 * // [{ type: "PERSON_NAME", value: "Jane Testperson", start: 11, end: 26,
 * //    confidence: 0.94, source: "ner" }]
 * ```
 */
export async function detectWithNER(
  text: string,
  settings: Settings,
  mode = "balanced",
  timeoutMs: number = DEFAULT_NER_TIMEOUT_MS,
): Promise<PIIMatch[]> {
  try {
    // Speed mode: skip NER entirely to minimise latency
    if (mode === "speed") {
      log.debug("NER skipped — speed mode active");
      return [];
    }

    const nerStart = performance.now();

    // Maximum mode: backend-only (PRO feature — no local model downloads)
    if (mode === "maximum") {
      if (!settings.nerBackendEnabled || !settings.nerBackendConsent) {
        log.debug("Maximum mode requires backend — not enabled/consented");
        return [];
      }
      const backendResult = await tryBackendNER(text, settings, timeoutMs);
      const elapsed = Math.round(performance.now() - nerStart);
      if (backendResult === null) {
        log.debug("Maximum mode backend NER returned null", { totalElapsedMs: elapsed });
        return [];
      }
      log.info("Maximum mode backend NER complete", {
        matchCount: backendResult.length,
        totalElapsedMs: elapsed,
        types: [...new Set(backendResult.map((m) => m.type))].join(",") || "(none)",
      });
      return backendResult;
    }

    // Balanced mode: local NER first, backend fallback
    // Step 1: Try local NER (privacy-preserving, runs for ALL users)
    const localTimeoutMs = calculateLocalNERTimeout(text.length);
    const localResult = await tryLocalNER(text, localTimeoutMs, mode);
    const localElapsed = Math.round(performance.now() - nerStart);

    if (localResult !== null) {
      // Local NER ran successfully — trust its result (even if empty).
      // This preserves privacy: user text is never sent to backend when
      // local inference is available.
      log.info("Local NER detection complete", {
        matchCount: localResult.length,
        elapsedMs: localElapsed,
        mode,
        types: [...new Set(localResult.map((m) => m.type))].join(",") || "(none)",
      });
      return localResult;
    }

    // Local NER unavailable (returned null) — fall back to backend
    log.debug("Local NER unavailable, attempting backend fallback", {
      elapsedMs: localElapsed,
    });

    // Step 2: Fall back to backend NER (requires explicit consent — opt-in only)
    if (!settings.nerBackendEnabled || !settings.nerBackendConsent) {
      log.debug("NER unavailable — local failed, backend not consented");
      return [];
    }

    const backendResult = await tryBackendNER(text, settings, timeoutMs);
    const totalElapsed = Math.round(performance.now() - nerStart);

    if (backendResult === null) {
      log.debug("Backend NER returned null", { totalElapsedMs: totalElapsed });
      return [];
    }

    log.info("Backend NER detection complete (fallback)", {
      matchCount: backendResult.length,
      totalElapsedMs: totalElapsed,
      types: [...new Set(backendResult.map((m) => m.type))].join(",") || "(none)",
    });
    return backendResult;
  } catch (err) {
    log.warn("NER detection threw unexpectedly — returning empty (fail-open)", {
      errorName: err instanceof Error ? err.name : "unknown",
    });
    return [];
  }
}
