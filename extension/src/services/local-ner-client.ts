/**
 * Local NER client for the PromptGnome extension.
 *
 * Manages the offscreen document lifecycle and sends text to the local
 * Transformers.js NER model running in the offscreen document. Falls back
 * gracefully to null on any failure (fail-open).
 *
 * Unlike the backend NER client, this module runs inference entirely
 * in-browser — no text ever leaves the user's machine.
 *
 * Architecture layer: Services (Pro-tier local detection)
 */

import type { PIIMatch } from "~src/detection/types";
import { createLogger } from "~src/utils/logger";

const log = createLogger("local-ner-client");

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Reason string used when creating the offscreen document. */
const OFFSCREEN_REASON = "BLOBS" as chrome.offscreen.Reason;

/** URL of the offscreen document (relative to extension root).
 *  Points to a Plasmo tab page that imports the NER worker module. */
const OFFSCREEN_URL = "tabs/ner-worker.html";

/** Default hard timeout for inference requests (ms). Used when no
 *  caller-specified timeout is provided. */
const DEFAULT_INFERENCE_TIMEOUT_MS = 10_000;

/** Hard timeout for model preload requests (ms). */
const PRELOAD_TIMEOUT_MS = 45000;

// ---------------------------------------------------------------------------
// Offscreen document management
// ---------------------------------------------------------------------------

/** Whether we have already created the offscreen document in this session. */
let offscreenCreated = false;

/**
 * Ensures the offscreen document is created. No-op if already active.
 *
 * @throws Never — returns false on failure.
 * @returns true if the offscreen document is (now) active.
 */
async function ensureOffscreenDocument(): Promise<boolean> {
  if (offscreenCreated) return true;

  try {
    // Check if an offscreen document already exists
    log.info("Checking for existing offscreen document...");
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT" as chrome.runtime.ContextType],
    });

    if (existingContexts.length > 0) {
      log.info("Offscreen document already exists — reusing");
      offscreenCreated = true;
      return true;
    }

    log.info(`Creating offscreen document at URL: ${OFFSCREEN_URL}`);
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: [OFFSCREEN_REASON],
      justification:
        "Run local NER model inference via Transformers.js for Pro-tier PII detection without sending data to any server.",
    });

    offscreenCreated = true;
    log.info("Offscreen document created successfully for local NER");
    return true;
  } catch (err) {
    log.warn("Failed to create offscreen document", {
      url: OFFSCREEN_URL,
      errorName: err instanceof Error ? err.name : "unknown",
    });
    return false;
  }
}

// ---------------------------------------------------------------------------
// Message helpers
// ---------------------------------------------------------------------------

/**
 * Sends a message to the offscreen document with a timeout.
 *
 * @param message   - The message payload.
 * @param timeoutMs - Maximum wait time in milliseconds.
 * @returns The response data or null on failure/timeout.
 */
async function sendToOffscreen(
  message: Record<string, unknown>,
  timeoutMs: number,
): Promise<Record<string, unknown> | null> {
  const active = await ensureOffscreenDocument();
  if (!active) return null;

  return new Promise<Record<string, unknown> | null>((resolve) => {
    const timer = setTimeout(() => {
      log.warn("Offscreen message timed out", { type: message["type"], timeoutMs });
      resolve(null);
    }, timeoutMs);

    try {
      chrome.runtime.sendMessage(message, (response: unknown) => {
        clearTimeout(timer);
        if (chrome.runtime.lastError) {
          log.warn("Offscreen message failed", {
            error: chrome.runtime.lastError.message,
          });
          resolve(null);
          return;
        }
        const resp = response as Record<string, unknown> | undefined;
        if (resp && resp["success"]) {
          resolve(resp["data"] as Record<string, unknown>);
        } else {
          resolve(null);
        }
      });
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Runs local NER inference on the provided text.
 *
 * Creates the offscreen document on first call, sends text for analysis,
 * and returns PIIMatch-compatible results. All processing happens locally
 * in the browser — no data is transmitted externally.
 *
 * @param text      - The user's message text to analyze.
 * @param mode      - Detection mode ("balanced" | "maximum"). Forwarded to the
 *                    offscreen worker to select the appropriate inference path.
 *                    Defaults to "balanced".
 * @param timeoutMs - Maximum milliseconds to wait for the offscreen response.
 *                    Defaults to {@link DEFAULT_INFERENCE_TIMEOUT_MS}. Callers
 *                    should scale this based on expected chunk count.
 * @returns Array of PIIMatch results or null on any failure (fail-open).
 * @throws Never — all errors are caught internally.
 * @example
 * ```ts
 * const matches = await analyzeTextLocally("My name is Jane Testperson", "balanced")
 * // [{ type: "PERSON_NAME", value: "Jane Testperson", start: 11, end: 26,
 * //    confidence: 0.94, source: "ner" }]
 * ```
 */
export async function analyzeTextLocally(
  text: string,
  mode = "balanced",
  timeoutMs: number = DEFAULT_INFERENCE_TIMEOUT_MS,
): Promise<PIIMatch[] | null> {
  if (!text || text.length === 0) return [];

  try {
    const data = await sendToOffscreen(
      { type: "LOCAL_NER_ANALYZE", text, mode },
      timeoutMs,
    );

    if (!data) return null;

    const entities = data["entities"] as
      | Array<{ type: string; value: string; start: number; end: number; confidence: number }>
      | undefined;

    if (!entities || !Array.isArray(entities)) return null;

    return entities.map((e) => ({
      type: e.type,
      value: e.value,
      start: e.start,
      end: e.end,
      confidence: e.confidence,
      source: "ner" as const,
    }));
  } catch (err) {
    log.warn("Local NER analysis failed", {
      errorName: err instanceof Error ? err.name : "unknown",
    });
    return null;
  }
}

/**
 * Preloads the local NER models required for the given detection mode.
 *
 * - `"balanced"` → Multilingual DistilBERT only (~110 MB).
 * - `"maximum"` → BERT-large + Multilingual DistilBERT (~450 MB).
 *
 * Call this proactively when the user switches detection mode so that
 * subsequent inference requests do not incur cold-start latency.
 *
 * @param mode - Detection mode to preload for. Defaults to "balanced".
 * @returns true if the required models loaded successfully, false otherwise.
 * @throws Never — all errors are caught internally.
 */
export async function preloadLocalNER(mode = "balanced"): Promise<boolean> {
  try {
    const data = await sendToOffscreen(
      { type: "LOCAL_NER_PRELOAD", mode },
      PRELOAD_TIMEOUT_MS,
    );

    if (!data) return false;
    return data["loaded"] === true;
  } catch {
    return false;
  }
}

/**
 * Returns the current status of the local NER model.
 *
 * @returns Status object or null if the offscreen document is unavailable.
 */
export async function getLocalNERStatus(): Promise<{
  loaded: boolean;
  loading: boolean;
  error: string | null;
} | null> {
  try {
    const data = await sendToOffscreen(
      { type: "LOCAL_NER_STATUS" },
      3000,
    );

    if (!data) return null;
    return {
      loaded: data["loaded"] === true,
      loading: data["loading"] === true,
      error: (data["error"] as string) ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Returns model readiness for a specific detection mode.
 *
 * Unlike {@link getLocalNERStatus} which returns aggregate state,
 * this checks whether the specific models needed for the given mode
 * are loaded and ready.
 *
 * @param mode - Detection mode ("balanced" | "maximum").
 * @returns Mode-specific status, or null if unavailable.
 * @throws Never — all errors are caught internally.
 */
export async function getLocalNERStatusForMode(mode: string): Promise<{
  ready: boolean;
  loading: boolean;
  error: string | null;
} | null> {
  if (mode === "maximum") {
    // Maximum mode runs on the backend — no local model needed
    return { ready: true, loading: false, error: null };
  }

  try {
    const data = await sendToOffscreen(
      { type: "LOCAL_NER_STATUS" },
      3000,
    );

    if (!data) {
      // Offscreen document unreachable — check persistent cache to determine
      // whether models were previously downloaded (files in Cache API).
      // This prevents the UI from showing "not downloaded" after a service
      // worker restart when models are actually cached and just need reload.
      try {
        const stored = await chrome.storage.local.get("nerModelCached");
        const cachedModes = stored["nerModelCached"] as Record<string, { cached?: boolean }> | undefined;
        if (cachedModes?.[mode]?.cached) {
          log.info(`Offscreen unreachable but model cached for mode="${mode}" — reporting as loading`);
          return { ready: false, loading: false, error: null };
        }
      } catch {
        // Ignore storage errors — fall through to null
      }
      return null;
    }

    const bert = data["bert"] as { loaded?: boolean; loading?: boolean; error?: string | null } | undefined;

    if (mode === "balanced") {
      return {
        ready: bert?.loaded === true,
        loading: bert?.loading === true,
        error: (bert?.error as string) ?? null,
      };
    }

    return { ready: false, loading: false, error: null };
  } catch {
    return null;
  }
}
