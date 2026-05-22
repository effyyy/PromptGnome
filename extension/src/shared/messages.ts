/**
 * Typed message definitions for `chrome.runtime` messaging.
 *
 * Every message exchanged between the content script, background service
 * worker, popup, and side panel is represented as a member of the
 * {@link ExtensionMessage} discriminated union.  The `type` field acts as
 * the discriminant, enabling exhaustive `switch` handling at each endpoint.
 */

import type { PIIMatch } from "~src/detection/types";
import type { ProviderName } from "~src/shared/constants";

// ---------------------------------------------------------------------------
// Message-type string literals
// ---------------------------------------------------------------------------

/**
 * String constants identifying each message kind.
 *
 * Used as the discriminant in {@link ExtensionMessage}.
 */
export const MESSAGE_TYPES = {
  /** Content script asks the background to scan a text input. */
  SCAN_REQUEST: "SCAN_REQUEST",
  /** Background returns detection results to the caller. */
  SCAN_RESULT: "SCAN_RESULT",
  /** Popup/side-panel pushes updated user settings. */
  SETTINGS_UPDATE: "SETTINGS_UPDATE",
  /** Content script increments stats counters in the background. */
  STATS_UPDATE: "STATS_UPDATE",
  /** Popup/side-panel toggles the master protection switch. */
  PROTECTION_TOGGLE: "PROTECTION_TOGGLE",
  /** Popup/side-panel requests the current settings from the background. */
  GET_SETTINGS: "GET_SETTINGS",
  /** Popup/side-panel requests the current statistics from the background. */
  GET_STATS: "GET_STATS",
  /** Popup requests the background to open the side panel. */
  OPEN_SIDE_PANEL: "OPEN_SIDE_PANEL",
  /** Content script reports the user's final decision for audit logging. */
  LOG_USER_DECISION: "LOG_USER_DECISION",
  /** Records accuracy feedback for a detection (correct/incorrect). */
  RECORD_FEEDBACK: "RECORD_FEEDBACK",
  /** Retrieves accumulated feedback statistics. */
  GET_FEEDBACK: "GET_FEEDBACK",
  /** Stores a privacy-safe report describing a missed PII pattern. */
  REPORT_MISSED_PII: "REPORT_MISSED_PII",
  /** Retrieves stored privacy-safe missed-PII reports. */
  GET_MISSED_PII_REPORTS: "GET_MISSED_PII_REPORTS",
  /** Sent when the user opts in or out of anonymous telemetry. */
  TELEMETRY_OPT_IN: "TELEMETRY_OPT_IN",
  /** Side panel requests the background to run a telemetry sync now. */
  TELEMETRY_SYNC_NOW: "TELEMETRY_SYNC_NOW",
  /** Content script requests a JWT for calling the OCR endpoint directly. */
  GET_JWT_FOR_OCR: "GET_JWT_FOR_OCR",
  /** Content script reports OCR scan results for file-based PII warnings. */
  OCR_SCAN_RESULT: "OCR_SCAN_RESULT",
  /** Content script notifies background that a scan completed (clean or with detections). */
  INCREMENT_SCAN_COUNT: "INCREMENT_SCAN_COUNT",
  /** Overlay requests the background to perform text anonymization and store the mapping. */
  ANONYMIZE_REQUEST: "ANONYMIZE_REQUEST",
  /** UI sends an analytics event to the background to forward to GA4 via backend. */
  ANALYTICS_EVENT: "ANALYTICS_EVENT",
  /** UI requests the background to send an OTP to the given email for Pro recovery. */
  VERIFY_EMAIL: "VERIFY_EMAIL",
  /** UI submits an OTP code to the background for verification. */
  VERIFY_OTP: "VERIFY_OTP",
  /** UI requests the background to generate a Paddle billing portal URL. */
  BILLING_PORTAL: "BILLING_PORTAL",
} as const;

/**
 * Union of all valid message-type string values.
 */
export type MessageType = (typeof MESSAGE_TYPES)[keyof typeof MESSAGE_TYPES];

// ---------------------------------------------------------------------------
// Individual message payloads
// ---------------------------------------------------------------------------

/**
 * Sent by a content script to request a PII scan of user input.
 *
 * Note: `requestId` is NOT included here — it is only used for DOM-level
 * event correlation between the interceptor and overlay, not for the
 * chrome.runtime message to the background.
 */
export interface ScanRequestMessage {
  readonly type: typeof MESSAGE_TYPES.SCAN_REQUEST;
  /** The provider the user is currently chatting with. */
  readonly provider: ProviderName;
  /** The raw text to scan for PII. */
  readonly text: string;
}

/**
 * Returned by the background service worker with scan results.
 */
export interface ScanResultMessage {
  readonly type: typeof MESSAGE_TYPES.SCAN_RESULT;
  /** Ordered list of PII matches found (may be empty). */
  readonly matches: readonly PIIMatch[];
  /** Wall-clock milliseconds the scan took. */
  readonly processingTimeMs: number;
}

/**
 * Broadcast when the user changes settings via the popup or side panel.
 *
 * The payload carries the full settings object so every listener can replace
 * its local copy atomically.
 */
export interface SettingsUpdateMessage {
  readonly type: typeof MESSAGE_TYPES.SETTINGS_UPDATE;
  /**
   * Complete settings snapshot.
   *
   * Typed as `Record<string, unknown>` here to avoid a circular dependency
   * on the Zod-inferred type; consumers should parse it through
   * `SettingsSchema` at the boundary.
   */
  readonly settings: Record<string, unknown>;
}

/**
 * Sent by the content script to increment a stats counter.
 *
 * Each property is optional — only the counters being incremented are sent.
 */
export interface StatsUpdateMessage {
  readonly type: typeof MESSAGE_TYPES.STATS_UPDATE;
  /** Increment messages-scanned counter by 1 if truthy. */
  readonly messagesScanned?: number;
  /** Increment messages-blocked counter by 1 if truthy. */
  readonly messagesBlocked?: number;
  /** Increment messages-sent-anyway counter by 1 if truthy. */
  readonly messagesSentAnyway?: number;
}

/**
 * Sent when the user toggles the master protection switch.
 */
export interface ProtectionToggleMessage {
  readonly type: typeof MESSAGE_TYPES.PROTECTION_TOGGLE;
  /** `true` means protection is now active. */
  readonly enabled: boolean;
}

/**
 * Sent by the overlay to record the user's final decision in the audit log.
 */
export interface LogUserDecisionMessage {
  readonly type: typeof MESSAGE_TYPES.LOG_USER_DECISION;
  /** The AI provider the user was chatting with. */
  readonly provider: ProviderName;
  /** PII types that were detected (for logging one entry per type). */
  readonly detectedTypes: readonly string[];
  /** The user's final action: blocked, dismissed, or anonymized. */
  readonly action: "blocked" | "dismissed" | "anonymized";
}

/**
 * Sent by the popup or side panel to request the current settings.
 */
export interface GetSettingsMessage {
  readonly type: typeof MESSAGE_TYPES.GET_SETTINGS;
}

/**
 * Sent by the popup or side panel to request the current statistics.
 */
export interface GetStatsMessage {
  readonly type: typeof MESSAGE_TYPES.GET_STATS;
}

/**
 * Sent by the popup to request the background to open the side panel.
 */
export interface OpenSidePanelMessage {
  readonly type: typeof MESSAGE_TYPES.OPEN_SIDE_PANEL;
}

/**
 * Records accuracy feedback for a single PII detection.
 */
export interface RecordFeedbackMessage {
  readonly type: typeof MESSAGE_TYPES.RECORD_FEEDBACK;
  /** The PII type key (e.g. "EMAIL", "SSN"). */
  readonly entityType: string;
  /** Whether the detection was correct. */
  readonly correct: boolean;
}

/**
 * Requests accumulated feedback statistics.
 */
export interface GetFeedbackMessage {
  readonly type: typeof MESSAGE_TYPES.GET_FEEDBACK;
}

/**
 * Records a privacy-safe report describing PII that was missed by detection.
 */
export interface ReportMissedPIIMessage {
  readonly type: typeof MESSAGE_TYPES.REPORT_MISSED_PII;
  /** The PII type the user believes was missed. */
  readonly entityType: string;
  /** Description of the missed format without actual sensitive data. */
  readonly description: string;
  /** Optional provider context for debugging provider-specific misses. */
  readonly provider?: ProviderName;
}

/**
 * Requests stored privacy-safe missed-PII reports.
 */
export interface GetMissedPIIReportsMessage {
  readonly type: typeof MESSAGE_TYPES.GET_MISSED_PII_REPORTS;
}

/**
 * Sent when the user opts in or out of anonymous telemetry.
 * Sent by TelemetryConsent (onboarding) and the settings toggle.
 */
export interface TelemetryOptInMessage {
  readonly type: typeof MESSAGE_TYPES.TELEMETRY_OPT_IN;
  /** `true` to opt in, `false` to opt out. */
  readonly enabled: boolean;
}

/**
 * Sent by the side panel to request an immediate telemetry sync.
 */
export interface TelemetrySyncNowMessage {
  readonly type: typeof MESSAGE_TYPES.TELEMETRY_SYNC_NOW;
}

/**
 * Sent by file-interceptor content script to obtain a JWT for
 * direct communication with the OCR backend endpoint.
 */
export interface GetJwtForOcrMessage {
  readonly type: typeof MESSAGE_TYPES.GET_JWT_FOR_OCR;
  /** MIME type of the file being scanned (used for per-file-type OCR gates). */
  readonly mimeType?: string;
  /** Optional provider key for provider-level protection gating. */
  readonly provider?: ProviderName;
}

/**
 * Carries OCR PII detection results for a file back to the content script.
 */
export interface OcrScanResultMessage {
  readonly type: typeof MESSAGE_TYPES.OCR_SCAN_RESULT;
  readonly fileId: string;
  readonly fileName: string;
  readonly matches: readonly PIIMatch[];
  readonly processingTimeMs: number;
}

/**
 * Notifies the background that a scan completed (clean or with detections).
 * Used to increment the telemetry nudge counter so the extension can prompt
 * the user to report missed PII after a configurable number of clean scans.
 */
export interface IncrementScanCountMessage {
  readonly type: typeof MESSAGE_TYPES.INCREMENT_SCAN_COUNT;
}

/**
 * Sent by the overlay to request the background to anonymize text.
 * The background returns the modified request body plus the anonymized text
 * preview used to update the optimistic user bubble.
 */
export interface AnonymizeRequestMessage {
  readonly type: typeof MESSAGE_TYPES.ANONYMIZE_REQUEST;
  /** The user message text to anonymize. */
  readonly text: string;
  /** Detected PII matches to replace. */
  readonly matches: readonly PIIMatch[];
  /** The AI provider name (for audit logging). */
  readonly provider: ProviderName;
  /** The hostname of the current page (for adapter lookup). */
  readonly hostname: string;
  /** The raw request body string (JSON) to modify. */
  readonly originalBody: string;
}

/** Sent by UI to background to forward an analytics event to GA4 via backend. */
export interface AnalyticsEventMessage {
  type: typeof MESSAGE_TYPES.ANALYTICS_EVENT;
  payload: {
    name: string;
    params: Record<string, string>;
  };
}

/** Sent by UI to background to request OTP for Pro recovery. */
export interface VerifyEmailMessage {
  type: typeof MESSAGE_TYPES.VERIFY_EMAIL;
  payload: {
    email: string;
  };
}

/** Sent by UI to background to verify OTP code. */
export interface VerifyOtpMessage {
  type: typeof MESSAGE_TYPES.VERIFY_OTP;
  payload: {
    email: string;
    code: string;
  };
}

/** Sent by UI to background to get Paddle billing portal URL. */
export interface BillingPortalMessage {
  type: typeof MESSAGE_TYPES.BILLING_PORTAL;
  payload: {
    customerId: string;
    subscriptionId?: string;
  };
}

// ---------------------------------------------------------------------------
// Discriminated union
// ---------------------------------------------------------------------------

/**
 * Discriminated union of every message the extension can exchange via
 * `chrome.runtime.sendMessage` / `chrome.runtime.onMessage`.
 *
 * Use the `type` field in a `switch` statement for exhaustive handling:
 *
 * ```ts
 * function handleMessage(msg: ExtensionMessage) {
 *   switch (msg.type) {
 *     case MESSAGE_TYPES.SCAN_REQUEST:
 *       // msg is narrowed to ScanRequestMessage
 *       break;
 *     // ...
 *   }
 * }
 * ```
 */
export type ExtensionMessage =
  | ScanRequestMessage
  | ScanResultMessage
  | SettingsUpdateMessage
  | StatsUpdateMessage
  | ProtectionToggleMessage
  | LogUserDecisionMessage
  | GetSettingsMessage
  | GetStatsMessage
  | OpenSidePanelMessage
  | RecordFeedbackMessage
  | GetFeedbackMessage
  | ReportMissedPIIMessage
  | GetMissedPIIReportsMessage
  | TelemetryOptInMessage
  | TelemetrySyncNowMessage
  | GetJwtForOcrMessage
  | OcrScanResultMessage
  | IncrementScanCountMessage
  | AnonymizeRequestMessage
  | AnalyticsEventMessage
  | VerifyEmailMessage
  | VerifyOtpMessage
  | BillingPortalMessage;

// ---------------------------------------------------------------------------
// Response map (for typed sendMessage / onMessage pairs)
// ---------------------------------------------------------------------------

/**
 * Maps each message type to the expected response type.
 *
 * This enables a fully typed `sendMessage` wrapper:
 *
 * ```ts
 * async function send<T extends ExtensionMessage>(
 *   msg: T
 * ): Promise<MessageResponseMap[T["type"]]> { ... }
 * ```
 */
export interface MessageResponseMap {
  [MESSAGE_TYPES.SCAN_REQUEST]: { success: boolean; data?: unknown; error?: string };
  [MESSAGE_TYPES.SCAN_RESULT]: void;
  [MESSAGE_TYPES.SETTINGS_UPDATE]: { success: boolean; error?: string };
  [MESSAGE_TYPES.STATS_UPDATE]: { success: boolean; error?: string };
  [MESSAGE_TYPES.PROTECTION_TOGGLE]: { success: boolean; data?: { enabled: boolean }; error?: string };
  [MESSAGE_TYPES.GET_SETTINGS]: { success: boolean; data?: unknown; error?: string };
  [MESSAGE_TYPES.GET_STATS]: { success: boolean; data?: unknown; error?: string };
  [MESSAGE_TYPES.OPEN_SIDE_PANEL]: { success: boolean; error?: string };
  [MESSAGE_TYPES.LOG_USER_DECISION]: { success: boolean; error?: string };
  [MESSAGE_TYPES.RECORD_FEEDBACK]: { success: boolean; error?: string };
  [MESSAGE_TYPES.GET_FEEDBACK]: { success: boolean; data?: unknown; error?: string };
  [MESSAGE_TYPES.REPORT_MISSED_PII]: { success: boolean; error?: string };
  [MESSAGE_TYPES.GET_MISSED_PII_REPORTS]: { success: boolean; data?: unknown; error?: string };
  [MESSAGE_TYPES.TELEMETRY_OPT_IN]: { success: boolean; error?: string };
  [MESSAGE_TYPES.TELEMETRY_SYNC_NOW]: { success: boolean; error?: string };
  [MESSAGE_TYPES.GET_JWT_FOR_OCR]: { success: boolean; data?: { jwt: string; endpoint: string }; error?: string };
  [MESSAGE_TYPES.OCR_SCAN_RESULT]: void;
  [MESSAGE_TYPES.INCREMENT_SCAN_COUNT]: { success: boolean };
  [MESSAGE_TYPES.ANONYMIZE_REQUEST]: {
    success: boolean;
    data?: {
      /** The modified request body with anonymized text. */
      modifiedBody: string;
      /** The placeholder-based text shown in the local optimistic bubble. */
      anonymizedText: string;
    };
    error?: string;
  };
  [MESSAGE_TYPES.ANALYTICS_EVENT]: { success: boolean };
  [MESSAGE_TYPES.VERIFY_EMAIL]: { found: boolean };
  [MESSAGE_TYPES.VERIFY_OTP]: { status: string; customerId: string } | { error: string };
  [MESSAGE_TYPES.BILLING_PORTAL]: { url: string } | { error: string };
}
