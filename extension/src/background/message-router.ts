/**
 * Routes messages between content scripts, popup, and side panel.
 *
 * Handles incoming `chrome.runtime.onMessage` events, dispatching each
 * message type to the appropriate handler.  Every handler returns a
 * structured {@link MessageRouterResponse} so callers always receive a
 * predictable shape regardless of success or failure.
 *
 * SECURITY: PII values are never logged.  Only type identifiers and
 * aggregate counts appear in diagnostic output.
 */

import type { DetectionResult, PIIMatch } from "~src/detection/types";
import { detectPII } from "~src/detection/regex-engine";
import { filterCodeBlocks } from "~src/detection/code-block-filter";
import { filterByConfidence } from "~src/detection/confidence";
import { MESSAGE_TYPES } from "~src/shared/messages";
import { CONFIG_KEYS, PII_TYPES, PROMO_ACTIVE } from "~src/shared/constants";
import type { ProviderName } from "~src/shared/constants";
import type { Settings } from "~src/shared/schemas";
import { createLogger } from "~src/utils/logger";
import { getSettings, updateSettings } from "~src/services/settings-manager";
import {
  recordScan,
  recordDetection,
  recordBlock,
  recordSendAnyway,
  getTodayStats as getServiceTodayStats,
} from "~src/services/stats-tracker";
import { logDetection } from "~src/services/audit-logger";
import { detectWithNER } from "~src/detection/ner-engine";
import { getLocalNERStatusForMode, preloadLocalNER } from "~src/services/local-ner-client";
import { SessionMapper } from "~src/anonymization/session-mapper";
import { EncryptedMappingStore } from "~src/anonymization/encrypted-store";
import { anonymizeText } from "~src/anonymization/anonymizer";
import { getAdapterForHostname } from "~src/providers/registry";
import { PRO_BUILD } from "~src/shared/build-flags";
import {
  recordFeedback,
  getFeedbackStats,
  reportMissedPII,
  getMissedPIIReports,
} from "~src/services/feedback-collector-port";
import { appendEvent } from "~src/services/telemetry-buffer-port";
import { toBucket, toConfidenceBucket } from "~src/shared/telemetry-schemas-port";
import { loadStoredConfig, applyAdjustments } from "~src/services/detection-config-port";
import { generateInstallId, sync as syncTelemetry } from "~src/services/telemetry-sync-port";
import { getValidJWT } from "~src/services/jwt-manager-port";
import { incrementScanCount } from "~src/services/telemetry-nudge-port";

const log = createLogger("message-router");

/** Uniform response shape returned by every message handler. */
export interface MessageRouterResponse {
  readonly success: boolean;
  readonly data?: unknown;
  readonly error?: string;
}

/** A message payload received via `chrome.runtime.onMessage`. */
interface IncomingMessage {
  readonly type: string;
  readonly [key: string]: unknown;
}

/** MIME type to OCR setting-key mapping for per-file-type scan controls. */
const OCR_MIME_SETTING_MAP: Readonly<Record<string, "ocrScanImages" | "ocrScanPdfs" | "ocrScanDocuments">> = {
  "image/png": "ocrScanImages",
  "image/jpeg": "ocrScanImages",
  "image/jpg": "ocrScanImages",
  "image/webp": "ocrScanImages",
  "image/gif": "ocrScanImages",
  "image/tiff": "ocrScanImages",
  "image/bmp": "ocrScanImages",
  "application/pdf": "ocrScanPdfs",
  "application/msword": "ocrScanDocuments",
  "application/vnd.ms-excel": "ocrScanDocuments",
  "application/vnd.ms-powerpoint": "ocrScanDocuments",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "ocrScanDocuments",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "ocrScanDocuments",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "ocrScanDocuments",
};

/**
 * Returns whether OCR scanning is enabled for the given MIME type.
 * Unknown MIME types default to allowed; caller-side MIME filters still apply.
 */
function isOcrMimeAllowed(settings: Settings, mimeType?: string): boolean {
  if (!mimeType) return true;
  const gate = OCR_MIME_SETTING_MAP[mimeType];
  if (!gate) return true;
  return settings[gate] !== false;
}

// -- Scan pipeline ----------------------------------------------------------

/**
 * Merges regex and NER matches, resolving overlapping spans.
 *
 * For each NER match:
 * - If regex also detected the same span + type: keep higher confidence, set source "both"
 * - If NER-only: add with source "ner"
 * Regex-only matches are kept unchanged with source "regex".
 *
 * @param regexMatches - Matches from the local regex engine.
 * @param nerMatches   - Matches from the backend NER service.
 * @returns Merged array of PIIMatch objects.
 */
function mergeMatches(regexMatches: PIIMatch[], nerMatches: PIIMatch[]): PIIMatch[] {
  if (nerMatches.length === 0) return regexMatches;

  const result = [...regexMatches];

  for (const nerMatch of nerMatches) {
    const overlapIdx = result.findIndex(
      (r) => r.start === nerMatch.start && r.end === nerMatch.end && r.type === nerMatch.type,
    );

    if (overlapIdx !== -1) {
      const existing = result[overlapIdx];
      result[overlapIdx] = {
        ...existing,
        source: "both",
        confidence: Math.max(existing.confidence, nerMatch.confidence),
      };
    } else {
      result.push(nerMatch);
    }
  }

  return result;
}

/**
 * Runs the full PII detection pipeline on the given text.
 *
 * Applies code-block filtering, per-type enable/disable, and the user's
 * configured confidence threshold before returning results. For Pro users
 * with backend consent, also calls the backend NER service and merges
 * results with regex matches.
 *
 * @param text     - Raw user input to scan.
 * @param provider - The AI provider identifier (for audit context).
 * @param settings - Current user settings (thresholds, enabled types).
 * @returns A DetectionResult with filtered, high-confidence matches.
 */
async function runScanPipeline(
  text: string,
  provider: string,
  settings: Settings,
): Promise<DetectionResult> {
  log.group(`runScanPipeline — ${provider} (${text.length} chars)`)
  log.info("Scan pipeline started", {
    provider,
    textLen: text.length,
    confidenceThreshold: settings.confidenceThreshold,
    behaviorMode: settings.behaviorMode,
  })

  const start = performance.now();
  const regexStart = performance.now();
  const rawMatches: PIIMatch[] = detectPII(text);
  const regexTimeMs = performance.now() - regexStart;

  log.info("Regex detection complete", {
    rawMatchCount: rawMatches.length,
    regexTimeMs: Math.round(regexTimeMs),
    types: rawMatches.map((m) => m.type).join(", ") || "(none)",
  })

  const codeFiltered = filterCodeBlocks(text, [...rawMatches]);
  if (codeFiltered.length !== rawMatches.length) {
    log.debug("Code-block filter removed matches", {
      before: rawMatches.length,
      after: codeFiltered.length,
      removed: rawMatches.length - codeFiltered.length,
    })
  }

  // NER call — mode-aware: skipped in "speed" mode, runs for all users otherwise
  const detectionMode = (settings.detectionMode as string | undefined) ?? "balanced";
  let nerMatches: PIIMatch[] = [];
  let nerTimeMs: number | null = null;

  if (detectionMode !== "speed") {
    const nerStart = performance.now();
    try {
      const nerResult = await detectWithNER(text, settings, detectionMode);
      nerTimeMs = performance.now() - nerStart;
      nerMatches = nerResult;
      log.info("NER detection complete", {
        nerMatchCount: nerResult.length,
        nerTimeMs: Math.round(nerTimeMs),
        detectionMode,
        types: [...new Set(nerResult.map((m) => m.type))].join(", ") || "(none)",
      });
    } catch {
      nerTimeMs = performance.now() - nerStart;
      log.warn("NER detection threw — continuing with regex-only results");
    }
  }

  // Merge regex and NER results
  const merged = mergeMatches(codeFiltered, nerMatches);
  if (nerMatches.length > 0) {
    log.debug("Merged regex + NER results", {
      regex: codeFiltered.length,
      ner: nerMatches.length,
      merged: merged.length,
    });
  }

  // Filter by per-type toggle (undefined means enabled by default)
  const typeFiltered = merged.filter(
    (m) => (settings.enabledTypes as Record<string, boolean>)[m.type] !== false,
  );
  if (typeFiltered.length !== merged.length) {
    log.debug("Type-toggle filter removed matches", {
      before: merged.length,
      after: typeFiltered.length,
      removed: merged.length - typeFiltered.length,
    })
  }

  // Apply the user-configured confidence threshold
  const confident = filterByConfidence(typeFiltered, settings.confidenceThreshold);
  if (confident.length !== typeFiltered.length) {
    log.debug("Confidence filter removed matches", {
      before: typeFiltered.length,
      after: confident.length,
      removed: typeFiltered.length - confident.length,
      threshold: settings.confidenceThreshold,
    })
  }

  const processingTimeMs = performance.now() - start;


  log.info("Scan pipeline complete", {
    provider,
    finalMatchCount: confident.length,
    finalTypes: confident.map((m) => m.type).join(", ") || "(none)",
    textLen: text.length,
    processingTimeMs: Math.round(processingTimeMs),
    regexTimeMs: Math.round(regexTimeMs),
    nerTimeMs: nerTimeMs !== null ? Math.round(nerTimeMs) : null,
  });
  log.groupEnd()
  return { matches: confident, processingTimeMs, regexTimeMs, nerTimeMs, textLength: text.length };
}

// -- Individual message handlers --------------------------------------------

/**
 * Handles SCAN_REQUEST: checks settings gates, runs the detection pipeline,
 * records stats, and writes audit-log entries for every match found.
 *
 * @param text     - The raw user message to scan.
 * @param provider - The AI provider identifier.
 * @returns A {@link MessageRouterResponse} containing a {@link DetectionResult}.
 */
async function handleScanRequest(
  text: string,
  provider: string,
): Promise<MessageRouterResponse> {
  try {
    log.info("handleScanRequest — fetching settings", { provider, textLen: text.length })
    const settings = await getSettings();

    log.debug("Settings loaded", {
      protectionEnabled: settings.protectionEnabled,
      behaviorMode: settings.behaviorMode,
      confidenceThreshold: settings.confidenceThreshold,
      providerEnabled: (settings.enabledProviders as Record<string, boolean>)[provider] !== false,
    })

    // Master protection toggle — return empty result immediately
    if (!settings.protectionEnabled) {
      log.info("Protection DISABLED — scan skipped", { provider })
      return {
        success: true,
        data: {
          matches: [],
          processingTimeMs: 0,
          regexTimeMs: 0,
          nerTimeMs: null,
          textLength: text.length,
        },
      };
    }

    // Per-provider toggle — return empty result if provider is disabled
    if (
      (settings.enabledProviders as Record<string, boolean>)[provider] === false
    ) {
      log.info("Provider DISABLED — scan skipped", { provider })
      return {
        success: true,
        data: {
          matches: [],
          processingTimeMs: 0,
          regexTimeMs: 0,
          nerTimeMs: null,
          textLength: text.length,
        },
      };
    }

    const result = await runScanPipeline(text, provider, settings);

    // Record scan and per-type detections in the stats service
    await recordScan(provider);
    for (const match of result.matches) {
      await recordDetection(match.type, 1);
    }

    // Write an audit-log entry for every detected match (initial "warned" action)
    if (result.matches.length > 0) {
      for (const match of result.matches) {
        await logDetection({
          provider,
          entityType: match.type,
          action: "warned",
          placeholder:
            PII_TYPES[match.type as keyof typeof PII_TYPES]?.placeholder ?? "",
        });
      }
    }

    // Apply detection config adjustments if available (Pro only — server-pushed config)
    let finalMatches = result.matches;
    if (PRO_BUILD) {
      try {
        const config = await loadStoredConfig();
        if (config) {
          finalMatches = applyAdjustments([...result.matches], config, text);
        }
      } catch {
        // Config application is non-critical
      }
    }

    // Telemetry: record post-adjustment match count with enriched training data (Pro only).
    if (PRO_BUILD) {
      const detectedTypes = [...new Set(finalMatches.map((m) => m.type))];
      const sourceBreakdown = { regex: 0, ner: 0, both: 0 };
      const confBuckets: Record<string, number> = {};
      for (const m of finalMatches) {
        const src = m.source ?? "regex";
        if (src in sourceBreakdown) sourceBreakdown[src as keyof typeof sourceBreakdown]++;
        const bucket = toConfidenceBucket(m.confidence);
        confBuckets[bucket] = (confBuckets[bucket] ?? 0) + 1;
      }
      appendEvent({
        kind: "scan",
        provider: provider as any,
        matchCount: finalMatches.length,
        detectedTypes: detectedTypes as any,
        sourceBreakdown,
        confidenceBuckets: confBuckets as any,
        processingTimeMs: Math.round(result.processingTimeMs),
        textLengthBucket: toBucket(text.length),
        ts: Date.now(),
      }).catch(() => {/* telemetry is non-critical */});
    }

    return { success: true, data: { ...{ ...result, matches: finalMatches }, behaviorMode: settings.behaviorMode } };
  } catch {
    log.error("Scan request failed", { provider });
    return { success: false, error: "Detection pipeline encountered an error." };
  }
}

/**
 * Handles SETTINGS_UPDATE: merges partial settings into storage via the
 * settings-manager service.
 *
 * @param settings - Partial settings record to persist.
 * @returns Success or a structured error response.
 */
async function handleSettingsUpdate(
  settings: Record<string, unknown>,
): Promise<MessageRouterResponse> {
  try {
    await updateSettings(settings as Partial<Settings>);
    log.info("Settings updated");
    return { success: true };
  } catch {
    log.error("Settings update failed");
    return { success: false, error: "Failed to persist settings." };
  }
}

/**
 * Handles STATS_UPDATE: delegates individual counters to the stats-tracker
 * service functions.
 *
 * @param event - Record containing optional counter increment flags.
 * @returns Success or a structured error response.
 */
async function handleStatsUpdate(
  event: Record<string, unknown>,
): Promise<MessageRouterResponse> {
  try {
    if (event["messagesScanned"]) await recordScan("");
    if (event["messagesBlocked"]) await recordBlock();
    if (event["messagesSentAnyway"]) await recordSendAnyway();
    return { success: true };
  } catch {
    log.error("Stats update failed");
    return { success: false, error: "Failed to update statistics." };
  }
}

/**
 * Handles PROTECTION_TOGGLE: persists the enabled/disabled state via the
 * settings-manager service (merged into the unified settings object).
 *
 * @param enabled - `true` to enable protection, `false` to disable.
 * @returns Success (with the new state echoed) or a structured error.
 */
async function handleProtectionToggle(
  enabled: boolean,
): Promise<MessageRouterResponse> {
  try {
    await updateSettings({ protectionEnabled: enabled });
    log.info("Protection toggled", { enabled });
    return { success: true, data: { enabled } };
  } catch {
    log.error("Protection toggle failed");
    return { success: false, error: "Failed to update protection state." };
  }
}

/**
 * Handles GET_SETTINGS: returns the current persisted settings.
 *
 * @returns Success with the validated settings object, or a structured error.
 */
async function handleGetSettings(): Promise<MessageRouterResponse> {
  try {
    return { success: true, data: await getSettings() };
  } catch {
    log.error("Get settings failed");
    return { success: false, error: "Failed to read settings." };
  }
}

/**
 * Handles GET_STATS: returns today's aggregated statistics via the
 * stats-tracker service.
 *
 * @returns Success with a {@link StatsEntry} for today, or a structured error.
 */
async function handleGetStats(): Promise<MessageRouterResponse> {
  try {
    return { success: true, data: await getServiceTodayStats() };
  } catch {
    log.error("Get stats failed");
    return { success: false, error: "Failed to read statistics." };
  }
}

/** Timestamp of the last successful side panel open, used for debounce. */
let lastSidePanelOpenMs = 0;

/**
 * Handles OPEN_SIDE_PANEL: opens the extension's side panel in the window
 * that sent the message. Debounces rapid-fire calls (1s cooldown).
 *
 * @param sender - Chrome runtime sender metadata containing the source tab.
 * @returns Success or a structured error response.
 */
async function handleOpenSidePanel(
  sender: chrome.runtime.MessageSender,
): Promise<MessageRouterResponse> {
  const now = Date.now();
  if (now - lastSidePanelOpenMs < 1_000) {
    return { success: true }; // Debounce — silently succeed
  }

  try {
    if (!chrome.sidePanel?.open) {
      log.warn("chrome.sidePanel.open() not available — API may not be supported");
      return { success: false, error: "Side panel API not available in this browser version." };
    }

    let windowId = sender.tab?.windowId;
    // When called from the popup, sender.tab is undefined.
    // Fall back to the last-focused window so the side panel still opens.
    if (windowId === undefined) {
      const win = await chrome.windows.getLastFocused();
      windowId = win.id;
    }
    if (windowId !== undefined) {
      await chrome.sidePanel.open({ windowId });
      lastSidePanelOpenMs = now;
    } else {
      log.warn("No window ID available for side panel open");
      return { success: false, error: "No active window found." };
    }
    return { success: true };
  } catch (err) {
    const errName = err instanceof Error ? err.name : "unknown-error";
    log.error("Failed to open side panel", { error: errName });
    return { success: false, error: "Failed to open side panel" };
  }
}

/**
 * Handles LOG_USER_DECISION: records the user's final action (blocked or
 * dismissed) in the audit log for each detected PII type.
 *
 * @param provider      - The AI provider identifier.
 * @param detectedTypes - PII type keys that were detected.
 * @param action        - The user's final decision.
 * @returns Success or a structured error response.
 */
async function handleLogUserDecision(
  provider: string,
  detectedTypes: readonly string[],
  action: "blocked" | "dismissed" | "anonymized",
): Promise<MessageRouterResponse> {
  try {
    for (const entityType of detectedTypes) {
      await logDetection({
        provider,
        entityType,
        action,
        placeholder:
          PII_TYPES[entityType as keyof typeof PII_TYPES]?.placeholder ?? "",
      });
    }
    // Only record user-initiated actions in telemetry (not auto-logged "warned") (Pro only)
    if (PRO_BUILD && (action === "blocked" || action === "dismissed" || action === "anonymized")) {
      appendEvent({
        kind: "decision",
        action,
        provider: provider as any,
        detectedTypes: detectedTypes as any,
        ts: Date.now(),
      }).catch(() => {/* telemetry is non-critical */});
    }
    return { success: true };
  } catch {
    log.error("Log user decision failed");
    return { success: false, error: "Failed to record user decision." };
  }
}

/**
 * Handles RECORD_FEEDBACK: records a single accuracy feedback event.
 *
 * @param entityType  - The PII type key.
 * @param correct     - Whether the detection was correct.
 * @param provider    - The AI provider where the detection occurred.
 * @param confidence  - The confidence score of the detection (for calibration).
 * @param source      - Detection source ("regex" | "ner" | "both").
 * @returns Success or a structured error response.
 */
async function handleRecordFeedback(
  entityType: string,
  correct: boolean,
  provider?: string,
  confidence?: number,
  source?: string,
): Promise<MessageRouterResponse> {
  if (!PRO_BUILD) return { success: true };
  try {
    await recordFeedback(entityType, correct);
    appendEvent({
      kind: "feedback",
      entityType: entityType as any,
      correct,
      ...(provider ? { provider: provider as any } : {}),
      ...(confidence !== undefined ? { confidenceBucket: toConfidenceBucket(confidence) } : {}),
      ...(source ? { source: source as any } : {}),
      ts: Date.now(),
    }).catch(() => {/* telemetry is non-critical */});
    return { success: true };
  } catch {
    log.error("Record feedback failed");
    return { success: false, error: "Failed to record feedback." };
  }
}

/**
 * Handles GET_FEEDBACK: returns accumulated feedback statistics.
 *
 * @returns Success with feedback stats, or a structured error response.
 */
async function handleGetFeedback(): Promise<MessageRouterResponse> {
  if (!PRO_BUILD) return { success: true, data: { total: 0, correct: 0, incorrect: 0, byType: {} } };
  try {
    return { success: true, data: await getFeedbackStats() };
  } catch {
    log.error("Get feedback failed");
    return { success: false, error: "Failed to read feedback." };
  }
}

/**
 * Handles REPORT_MISSED_PII: stores a privacy-safe missed-pattern report.
 */
async function handleReportMissedPII(
  entityType: string,
  description: string,
  provider?: ProviderName,
): Promise<MessageRouterResponse> {
  if (!PRO_BUILD) return { success: true };
  try {
    await reportMissedPII(entityType, description, provider);
    appendEvent({
      kind: "missed",
      entityType: entityType as any,
      ...(provider ? { provider: provider as any } : {}),
      ts: Date.now(),
    }).catch(() => {/* telemetry is non-critical */});
    return { success: true };
  } catch {
    log.error("Report missed PII failed");
    return { success: false, error: "Failed to record missed PII report." };
  }
}

/**
 * Handles GET_MISSED_PII_REPORTS: returns stored privacy-safe reports.
 */
async function handleGetMissedPIIReports(): Promise<MessageRouterResponse> {
  if (!PRO_BUILD) return { success: true, data: [] };
  try {
    return { success: true, data: await getMissedPIIReports() };
  } catch {
    log.error("Get missed PII reports failed");
    return { success: false, error: "Failed to read missed PII reports." };
  }
}

/**
 * Handles TELEMETRY_OPT_IN: updates the telemetryEnabled setting and
 * generates the install ID if opting in for the first time.
 *
 * @param enabled - `true` to opt in, `false` to opt out.
 * @returns Success or a structured error response.
 */
async function handleTelemetryOptIn(
  enabled: boolean,
): Promise<MessageRouterResponse> {
  if (!PRO_BUILD) return { success: true };
  try {
    await updateSettings({ telemetryEnabled: enabled });
    if (enabled) {
      const items = await new Promise<Record<string, unknown>>((resolve) => {
        chrome.storage.local.get(CONFIG_KEYS.TELEMETRY_INSTALL_ID, resolve);
      });
      if (!items[CONFIG_KEYS.TELEMETRY_INSTALL_ID]) {
        await new Promise<void>((resolve) => {
          chrome.storage.local.set(
            { [CONFIG_KEYS.TELEMETRY_INSTALL_ID]: generateInstallId() },
            () => resolve(),
          );
        });
      }
    }
    log.info("Telemetry opt-in changed", { enabled });
    return { success: true };
  } catch {
    log.error("Telemetry opt-in failed");
    return { success: false, error: "Failed to update telemetry preference." };
  }
}

/**
 * Handles INCREMENT_SCAN_COUNT: increments the telemetry nudge scan counter.
 *
 * Called after every completed scan (clean or with detections) so the
 * extension can surface the "Did we miss something?" feedback prompt after
 * a configurable number of clean scans.
 *
 * @returns Success response with the new count value.
 */
async function handleIncrementScanCount(): Promise<MessageRouterResponse> {
  if (!PRO_BUILD) return { success: true, data: { count: 0 } };
  try {
    const newCount = await incrementScanCount();
    log.debug("Nudge scan count incremented", { newCount });
    return { success: true, data: { count: newCount } };
  } catch {
    log.error("Increment scan count failed");
    return { success: false, error: "Failed to increment scan count." };
  }
}

/**
 * Handles TELEMETRY_SYNC_NOW: delegates sync execution to the service worker.
 */
async function handleTelemetrySyncNow(): Promise<MessageRouterResponse> {
  if (!PRO_BUILD) return { success: true };
  try {
    await syncTelemetry();
    return { success: true };
  } catch {
    log.error("Telemetry sync-now failed");
    return { success: false, error: "Failed to sync telemetry now." };
  }
}

// -- Anonymize handler ------------------------------------------------------

/**
 * Handles ANONYMIZE_REQUEST: anonymizes PII in user text, replaces the
 * message in the request body using the provider adapter, and stores the
 * encrypted mapping in IndexedDB.
 *
 * @param text         - The raw user message text.
 * @param matches      - Detected PII matches to anonymize.
 * @param provider     - The AI provider name (for adapter lookup).
 * @param originalBody - The raw request body string (JSON).
 * @returns The modified body, serialized mapper, and session ID.
 */
async function handleAnonymizeRequest(
  text: string,
  matches: readonly PIIMatch[],
  hostname: string,
  originalBody: string,
): Promise<MessageRouterResponse> {
  const t0 = performance.now()
  log.group("ANONYMIZE_REQUEST handler")
  log.info("Starting anonymization", {
    hostname,
    matchCount: matches.length,
    textLength: text.length,
  })

  try {
    const mapper = new SessionMapper()
    const { anonymizedText } = anonymizeText(text, matches as PIIMatch[], mapper)
    log.info("Text anonymized", { anonymizedLength: anonymizedText.length })

    const adapter = getAdapterForHostname(hostname)
    if (!adapter) {
      log.warn("No adapter found for hostname", { hostname })
      log.groupEnd()
      return { success: false, error: `No adapter for hostname: ${hostname}` }
    }
    log.info("Adapter resolved", { adapter: adapter.name })

    const modifiedBody = adapter.replaceUserMessage(originalBody, anonymizedText)
    if (!modifiedBody) {
      log.warn("Adapter could not replace message body")
      log.groupEnd()
      return { success: false, error: "Could not modify request body for provider." }
    }
    log.info("Request body modified", { modifiedBodyLength: modifiedBody.length })

    const sessionId = `tab:${Date.now()}`
    const store = new EncryptedMappingStore()
    await store.init()
    await store.store(sessionId, mapper)
    log.info("Mapping encrypted and stored", { sessionId })

    const mapperSnapshot = mapper.toSerializable()

    log.info("Anonymization complete", {
      totalMs: (performance.now() - t0).toFixed(2),
    })
    log.groupEnd()

    return {
      success: true,
      data: { modifiedBody, mapperSnapshot, sessionId, anonymizedText },
    }
  } catch (err) {
    log.error("Anonymization handler failed", {
      error: err instanceof Error ? err.name : "unknown-error",
      elapsedMs: (performance.now() - t0).toFixed(2),
    })
    log.groupEnd()
    return { success: false, error: "Anonymization failed." }
  }
}

// -- Analytics / OTP / Billing handlers ------------------------------------

/**
 * Forwards an analytics event to the backend GA4 proxy.
 *
 * @param payload - The analytics event payload with name and params.
 * @returns Success indicator.
 */
async function handleAnalyticsEvent(
  payload: { name: string; params: Record<string, string> },
): Promise<{ success: boolean }> {
  try {
    const settings = await getSettings();
    if (!settings.telemetryEnabled) {
      return { success: true };
    }

    const installIdResult = await chrome.storage.local.get(CONFIG_KEYS.TELEMETRY_INSTALL_ID);
    const clientId = (installIdResult[CONFIG_KEYS.TELEMETRY_INSTALL_ID] as string) || "unknown";

    const response = await fetch("https://api.promptgnome.com/v1/analytics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        events: [{ name: payload.name, params: payload.params }],
      }),
      signal: AbortSignal.timeout(5000),
    });

    return { success: response.ok };
  } catch {
    return { success: false };
  }
}

/**
 * Sends an OTP verification email for Pro subscription recovery.
 *
 * @param payload - Object containing the user's email address.
 * @returns Whether the email was found in the system.
 */
async function handleVerifyEmail(
  payload: { email: string },
): Promise<{ found: boolean }> {
  try {
    const response = await fetch("https://api.promptgnome.com/v1/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: payload.email }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return { found: false };
    return (await response.json()) as { found: boolean };
  } catch {
    return { found: false };
  }
}

/**
 * Verifies an OTP code for Pro subscription recovery.
 *
 * @param payload - Object containing the user's email and OTP code.
 * @returns Subscription status and customer ID on success, or an error object.
 */
async function handleVerifyOtp(
  payload: { email: string; code: string },
): Promise<{ status: string; customerId: string } | { error: string }> {
  try {
    const response = await fetch("https://api.promptgnome.com/v1/verify-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: payload.email, code: payload.code }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      const body = (await response.json()) as { error?: string };
      return { error: body.error || "Verification failed" };
    }
    return (await response.json()) as { status: string; customerId: string };
  } catch {
    return { error: "Network error — please try again" };
  }
}

/**
 * Gets a Paddle billing portal URL for subscription management.
 *
 * @param payload - Object containing the Paddle customer ID and optional subscription ID.
 * @returns A billing portal URL on success, or an error object.
 */
async function handleBillingPortal(
  payload: { customerId: string; subscriptionId?: string },
): Promise<{ url: string } | { error: string }> {
  try {
    const response = await fetch("https://api.promptgnome.com/v1/billing-portal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerId: payload.customerId,
        subscriptionId: payload.subscriptionId,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      return { error: "Failed to open billing portal" };
    }
    return (await response.json()) as { url: string };
  } catch {
    return { error: "Network error — please try again" };
  }
}

// -- Message dispatch -------------------------------------------------------

/**
 * Selects and invokes the correct handler for the given message.
 *
 * @param message - The incoming message with a `type` discriminant.
 * @param sender  - Chrome runtime sender metadata (required for side-panel).
 * @returns The handler's {@link MessageRouterResponse}.
 */
async function dispatchMessage(
  message: IncomingMessage,
  sender: chrome.runtime.MessageSender,
): Promise<MessageRouterResponse> {
  const tabId = sender.tab?.id ?? "no-tab"
  log.info("Message received — dispatching", {
    type: message.type,
    tabId: tabId as string | number,
    origin: sender.origin ?? "unknown",
  })
  const dispatchStart = performance.now()
  let result: MessageRouterResponse

  switch (message.type) {
    case MESSAGE_TYPES.SCAN_REQUEST:
      result = await handleScanRequest(
        message["text"] as string,
        message["provider"] as string,
      );
      break;
    case MESSAGE_TYPES.SETTINGS_UPDATE:
      result = await handleSettingsUpdate(message["settings"] as Record<string, unknown>);
      break;
    case MESSAGE_TYPES.STATS_UPDATE:
      result = await handleStatsUpdate(message as Record<string, unknown>);
      break;
    case MESSAGE_TYPES.PROTECTION_TOGGLE:
      result = await handleProtectionToggle(message["enabled"] as boolean);
      break;
    case MESSAGE_TYPES.GET_SETTINGS:
      result = await handleGetSettings();
      break;
    case MESSAGE_TYPES.GET_STATS:
      result = await handleGetStats();
      break;
    case MESSAGE_TYPES.OPEN_SIDE_PANEL:
      result = await handleOpenSidePanel(sender);
      break;
    case MESSAGE_TYPES.LOG_USER_DECISION:
      result = await handleLogUserDecision(
        message["provider"] as string,
        message["detectedTypes"] as string[],
        message["action"] as "blocked" | "dismissed" | "anonymized",
      );
      break;
    case MESSAGE_TYPES.RECORD_FEEDBACK:
      result = await handleRecordFeedback(
        message["entityType"] as string,
        message["correct"] as boolean,
        message["provider"] as string | undefined,
        message["confidence"] as number | undefined,
        message["source"] as string | undefined,
      );
      break;
    case MESSAGE_TYPES.GET_FEEDBACK:
      result = await handleGetFeedback();
      break;
    case MESSAGE_TYPES.REPORT_MISSED_PII:
      result = await handleReportMissedPII(
        message["entityType"] as string,
        message["description"] as string,
        message["provider"] as ProviderName | undefined,
      );
      break;
    case MESSAGE_TYPES.GET_MISSED_PII_REPORTS:
      result = await handleGetMissedPIIReports();
      break;
    case MESSAGE_TYPES.TELEMETRY_OPT_IN:
      result = await handleTelemetryOptIn(message["enabled"] as boolean);
      break;
    case MESSAGE_TYPES.TELEMETRY_SYNC_NOW:
      result = await handleTelemetrySyncNow();
      break;
    case MESSAGE_TYPES.INCREMENT_SCAN_COUNT:
      result = await handleIncrementScanCount();
      break;
    case MESSAGE_TYPES.ANONYMIZE_REQUEST:
      result = await handleAnonymizeRequest(
        message["text"] as string,
        message["matches"] as PIIMatch[],
        message["hostname"] as string,
        message["originalBody"] as string,
      );
      break;
    case "GET_MODEL_STATUS": {
      const mode = message["mode"] as string | undefined;
      if (!mode || mode === "speed") {
        result = { success: true, data: { ready: false } };
        break;
      }
      try {
        log.info(`GET_MODEL_STATUS — checking mode="${mode}"`);
        const status = await getLocalNERStatusForMode(mode);
        const ready = status?.ready === true;

        if (ready) {
          result = { success: true, data: { ready: true, loading: false, cached: true } };
          break;
        }

        // Model not ready in memory — check persistent cache to distinguish
        // "never downloaded" from "downloaded but needs reload into memory"
        const stored = await chrome.storage.local.get("nerModelCached");
        const cachedModes = stored["nerModelCached"] as Record<string, { cached?: boolean }> | undefined;
        const isCached = cachedModes?.[mode]?.cached === true;

        if (!status?.loading) {
          // Not loaded and not loading — trigger preload.
          // If cached, Transformers.js will load from Cache API (fast).
          log.info(`GET_MODEL_STATUS — model not ready for mode="${mode}", cached=${isCached}, triggering preload`);
          preloadLocalNER(mode).catch((err) => {
            log.warn(`Background preload failed for mode="${mode}"`, {
              error: err instanceof Error ? err.name : "unknown-error",
            });
          });
        }
        result = {
          success: true,
          data: {
            ready: false,
            loading: status?.loading || isCached,
            cached: isCached,
          },
        };
      } catch (err) {
        log.warn("GET_MODEL_STATUS failed", {
          error: err instanceof Error ? err.name : "unknown-error",
        });
        result = { success: true, data: { ready: false } };
      }
      break;
    }
    case "DOWNLOAD_MODEL": {
      const dlMode = message["mode"] as string | undefined;
      if (!dlMode || dlMode === "speed") {
        result = { success: true, data: { started: false } };
        break;
      }
      log.info(`DOWNLOAD_MODEL — starting preload for mode="${dlMode}"`);
      preloadLocalNER(dlMode).catch((err) => {
        log.warn(`DOWNLOAD_MODEL preload failed for mode="${dlMode}"`, {
          error: err instanceof Error ? err.name : "unknown-error",
        });
      });
      result = { success: true, data: { started: true } };
      break;
    }
    case MESSAGE_TYPES.GET_JWT_FOR_OCR: {
      if (!PRO_BUILD) {
        result = { success: false, error: "OCR is a Pro feature." };
        break;
      }
      const settings = await getSettings();
      if (!settings.protectionEnabled) {
        result = { success: false, error: "Protection is disabled" };
        break;
      }
      const provider =
        typeof message["provider"] === "string"
          ? (message["provider"] as string)
          : undefined;
      if (
        provider &&
        (settings.enabledProviders as Record<string, boolean>)[provider] === false
      ) {
        result = { success: false, error: "Provider is disabled" };
        break;
      }
      if (!settings.ocrBackendConsent) {
        result = { success: false, error: "OCR consent not granted" };
        break;
      }
      const mimeType =
        typeof message["mimeType"] === "string"
          ? (message["mimeType"] as string)
          : undefined;
      if (!isOcrMimeAllowed(settings, mimeType)) {
        result = { success: false, error: "OCR disabled for this file type" };
        break;
      }

      let identifier: string | null = null;
      let useInstallId = false;

      try {
        const items = await new Promise<Record<string, unknown>>((resolve) => {
          chrome.storage.local.get(["paddleCustomerId", "telemetryInstallId"], resolve);
        });
        const paddleCustomerId = (items["paddleCustomerId"] as string | undefined) ?? null;
        if (paddleCustomerId) {
          identifier = paddleCustomerId;
        } else if (PROMO_ACTIVE) {
          const installId = (items["telemetryInstallId"] as string | undefined) ?? null;
          if (installId) {
            identifier = installId;
            useInstallId = true;
          }
        }
      } catch {
        result = { success: false, error: "Could not resolve credentials" };
        break;
      }

      if (!identifier) {
        result = { success: false, error: "No credentials available" };
        break;
      }

      const tokenEndpoint = settings.ocrEndpoint.replace(/\/v\d+\/analyze-file$/, "/v1/token");
      const jwt = await getValidJWT(identifier, tokenEndpoint, useInstallId);
      if (!jwt) {
        result = { success: false, error: "JWT exchange failed" };
        break;
      }

      result = {
        success: true,
        data: { jwt, endpoint: settings.ocrEndpoint },
      };
      break;
    }
    case MESSAGE_TYPES.ANALYTICS_EVENT:
      result = PRO_BUILD
        ? await handleAnalyticsEvent(
            message["payload"] as { name: string; params: Record<string, string> },
          ).then((data) => ({ success: data.success }))
        : { success: true };
      break;
    case MESSAGE_TYPES.VERIFY_EMAIL:
      result = PRO_BUILD
        ? await handleVerifyEmail(
            message["payload"] as { email: string },
          ).then((data) => ({ success: true, data }))
        : { success: false, error: "Pro feature not available." };
      break;
    case MESSAGE_TYPES.VERIFY_OTP:
      result = PRO_BUILD
        ? await handleVerifyOtp(
            message["payload"] as { email: string; code: string },
          ).then((data) => ({ success: !("error" in data), data }))
        : { success: false, error: "Pro feature not available." };
      break;
    case MESSAGE_TYPES.BILLING_PORTAL:
      result = PRO_BUILD
        ? await handleBillingPortal(
            message["payload"] as { customerId: string },
          ).then((data) => ({ success: !("error" in data), data }))
        : { success: false, error: "Pro feature not available." };
      break;
    case "MODEL_DOWNLOAD_PROGRESS":
      // Broadcast from offscreen NER worker — consumed by popup/sidepanel listeners.
      // No handling needed in the service worker; just acknowledge.
      result = { success: true };
      break;
    case "MODEL_DOWNLOAD_COMPLETE": {
      // Persist download status so it survives service worker restarts.
      // The actual model files are cached by Transformers.js in the Cache API,
      // but the extension needs to know models were previously downloaded so
      // it can preload them from cache instead of showing "not downloaded".
      const dlData = message["data"] as { loaded?: boolean; mode?: string } | undefined;
      if (dlData?.loaded && dlData?.mode) {
        try {
          const existing = await chrome.storage.local.get("nerModelCached");
          const cached = (existing["nerModelCached"] as Record<string, unknown>) ?? {};
          cached[dlData.mode] = { cached: true, timestamp: Date.now() };
          await chrome.storage.local.set({ nerModelCached: cached });
          log.info("Persisted model cached status", { mode: dlData.mode });
        } catch (err) {
          log.warn("Failed to persist model cached status", {
            error: err instanceof Error ? err.name : "unknown-error",
          });
        }
      }
      result = { success: true };
      break;
    }
    case "MODEL_DOWNLOAD_ERROR":
      // Broadcast from offscreen NER worker on download failure.
      {
        const dlErr = message["data"] as { mode?: string } | undefined;
        log.warn("Model download error received", { mode: dlErr?.mode ?? "unknown" });
      }
      result = { success: true };
      break;
    default:
      log.warn("Unknown message type received", { type: message.type });
      result = { success: false, error: `Unknown message type: ${message.type}` };
  }

  log.info("Message dispatch complete", {
    type: message.type,
    success: result.success,
    durationMs: Math.round(performance.now() - dispatchStart),
    hasError: result.error !== undefined,
  })
  return result
}

/**
 * Top-level message listener. Routes each incoming message to the
 * appropriate handler and returns the response asynchronously.
 *
 * @param message      - The incoming extension message.
 * @param sender       - Chrome runtime sender metadata.
 * @param sendResponse - Callback to return the response to the sender.
 * @returns `true` to signal Chrome that the response is asynchronous.
 */
function onMessageReceived(
  message: IncomingMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: MessageRouterResponse) => void,
): boolean {
  dispatchMessage(message, sender).then(sendResponse).catch(() => {
    log.error("Unhandled dispatch error", { type: message.type });
    sendResponse({ success: false, error: "Internal error." });
  });
  return true;
}

// -- Initialization ---------------------------------------------------------

/**
 * Registers the message listener on `chrome.runtime.onMessage`.
 * Call once during service worker startup.
 */
export function initMessageRouter(): void {
  chrome.runtime.onMessage.addListener(onMessageReceived);
  log.info("Message router initialized");
}
