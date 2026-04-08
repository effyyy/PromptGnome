/**
 * Zod validation schemas for persisted extension data.
 *
 * Every value written to `chrome.storage.local` passes through one of these
 * schemas before it is stored, and every value read back is parsed through
 * the same schema.  This guarantees runtime type safety even when the
 * storage format evolves between versions.
 *
 * **Privacy invariant:** {@link AuditLogEntrySchema} intentionally omits the
 * original PII value.  Only the entity type, action taken, and placeholder
 * used are recorded.
 *
 * **Schema structure:**
 * {@link FreeSettingsSchema} holds all fields present in the open-source
 * build.  {@link ProSettingsSchema} holds fields that are only meaningful
 * when the Pro build is active (backend NER, OCR, synthetic replacement,
 * feedback).  {@link SettingsSchema} is the merged union used by the Privito
 * Pro build; call sites that import `Settings` or `SettingsSchema` continue
 * to work unchanged.
 */

import { z, piiTypeKeys, providerKeys } from "~src/shared/zod-compat";
import type { ZodInfer } from "~src/shared/zod-compat";

// ---------------------------------------------------------------------------
// BehaviorMode
// ---------------------------------------------------------------------------

/**
 * The action the extension takes when PII is detected.
 *
 * - `"warn"` – highlight the PII and show a warning; let the user decide.
 * - `"block"` – prevent the message from being sent until PII is removed.
 * - `"silent"` – silently suppress the warning and allow the message through.
 */
export const BehaviorModeSchema = z.enum(["warn", "block", "silent"]);

/** Inferred TypeScript type for {@link BehaviorModeSchema}. */
export type BehaviorMode = ZodInfer<typeof BehaviorModeSchema>;

// ---------------------------------------------------------------------------
// FreeSettingsSchema  — always present in both Free and Pro builds
// ---------------------------------------------------------------------------

/**
 * User-configurable settings that are present in both the open-source (Free)
 * build and the Privito Pro build.
 *
 * Persisted under {@link CONFIG_KEYS.SETTINGS}.
 */
export const FreeSettingsSchema = z.object({
  /**
   * Master on/off switch for the entire extension.
   *
   * When `false`, no interception or detection occurs regardless of other
   * settings.  Defaults to `true`.
   */
  protectionEnabled: z.boolean(),

  /**
   * Per-PII-type on/off switches.
   *
   * Every key in {@link PII_TYPES} maps to a boolean indicating whether
   * that type should be detected.  Defaults to `true` for all types.
   */
  enabledTypes: z.record(z.enum(piiTypeKeys), z.boolean()),

  /**
   * Per-provider on/off switches.
   *
   * Every key in {@link PROVIDER_NAMES} maps to a boolean indicating
   * whether the extension should be active on that provider's site.
   * Defaults to `true` for all providers.
   */
  enabledProviders: z.record(z.enum(providerKeys), z.boolean()),

  /**
   * What the extension does when PII is detected.
   *
   * @see {@link BehaviorModeSchema}
   */
  behaviorMode: BehaviorModeSchema,

  /**
   * Minimum confidence score a match must reach to be surfaced.
   *
   * Matches below this threshold are silently discarded.
   * Range: `[0, 1]`.  Default: `0.7`.
   */
  confidenceThreshold: z.number().min(0).max(1),

  /**
   * Whether the user has opted in to anonymous telemetry.
   *
   * When `true`, detection accuracy events are buffered locally and
   * periodically synced as aggregate statistics.  Defaults to `false`
   * (opt-in only).
   */
  telemetryEnabled: z.boolean(),

  /**
   * Whether the backend NER service is enabled for Pro users.
   *
   * When `true`, text is sent to the backend NER service for enhanced
   * detection (conditioned on `nerBackendConsent`).  Defaults to `false`.
   */
  nerBackendEnabled: z.boolean().default(false),

  /**
   * Whether the user has explicitly consented to text transmission for
   * backend NER analysis.
   *
   * Must be `true` before any text is sent to the Pro backend NER service.
   * Defaults to `false` (opt-in only).
   */
  nerBackendConsent: z.boolean().default(false),

  /**
   * The backend NER service endpoint URL.
   *
   * In the Free build this defaults to an empty string — no backend NER
   * requests are made. The Pro build overrides this default at its entry
   * point. Can also be overridden at runtime for testing.
   */
  nerEndpoint: z.string().default(""),

  /**
   * Whether real-time highlighting is enabled.
   *
   * When `true`, detected PII spans are visually highlighted in the
   * textarea as the user types.  Defaults to `true`.
   */
  highlightingEnabled: z.boolean().default(true),

  /**
   * User-selected detection accuracy mode.
   *
   * Controls which NER models are loaded alongside the regex engine:
   * - `"speed"` – regex only; fastest, no NER overhead.
   * - `"balanced"` – regex + lightweight NER model (default).
   * - `"maximum"` – regex + full NER model; highest accuracy, most latency.
   */
  detectionMode: z.enum(["speed", "balanced", "maximum"]).default("speed"),

  /**
   * What happens when the user dismisses the PII warning overlay
   * (close button or clicking outside).
   *
   * - `"block"` – block the message from sending (safe default).
   * - `"send"` – send the message anyway despite detected PII.
   */
  dismissBehavior: z.enum(["block", "send"]).default("block"),
});

/** Inferred TypeScript type for {@link FreeSettingsSchema}. */
export type FreeSettings = ZodInfer<typeof FreeSettingsSchema>;

// ---------------------------------------------------------------------------
// StatsEntrySchema
// ---------------------------------------------------------------------------

/**
 * A single day's aggregated detection statistics.
 *
 * One entry is stored per calendar day (keyed by ISO-8601 date string).
 */
export const StatsEntrySchema = z.object({
  /** ISO-8601 date string (`YYYY-MM-DD`) this entry covers. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),

  /** Number of user messages scanned on this day. */
  messagesScanned: z.number().int().nonnegative(),

  /**
   * Per-PII-type count of detections on this day.
   *
   * Keys are members of {@link PII_TYPES}; values are non-negative
   * integers.
   */
  piiDetected: z.record(z.enum(piiTypeKeys), z.number().int().nonnegative()),

  /** Messages the user chose not to send after a warning. */
  messagesBlocked: z.number().int().nonnegative(),

  /** Messages the user sent despite a PII warning. */
  messagesSentAnyway: z.number().int().nonnegative(),
});

/** Inferred TypeScript type for {@link StatsEntrySchema}. */
export type StatsEntry = ZodInfer<typeof StatsEntrySchema>;

// ---------------------------------------------------------------------------
// AuditLogEntrySchema
// ---------------------------------------------------------------------------

/**
 * A single audit-log entry recording that PII was detected and what action
 * was taken.
 *
 * **Privacy invariant:** the original PII value is intentionally NOT stored.
 * Only the entity type and the placeholder that replaced it are recorded so
 * that the log itself cannot become a data-leak vector.
 */
export const AuditLogEntrySchema = z.object({
  /** Unix-epoch millisecond timestamp of the detection event. */
  timestamp: z.number().int().nonnegative(),

  /** Which AI provider the user was chatting with. */
  provider: z.enum(providerKeys),

  /** The PII entity type that was detected. */
  entityType: z.enum(piiTypeKeys),

  /**
   * Action the extension (or user) took in response to the detection.
   *
   * - `"warned"` – user was shown a warning.
   * - `"blocked"` – message send was prevented.
   * - `"anonymized"` – PII was replaced with a placeholder.
   * - `"dismissed"` – user dismissed the warning and sent anyway.
   */
  action: z.enum(["warned", "blocked", "anonymized", "dismissed"]),

  /**
   * The placeholder string that was (or would have been) substituted for
   * the original PII value.
   *
   * Present even for `"warned"` / `"dismissed"` actions so the log reader
   * can see what would have replaced the value.
   */
  placeholderUsed: z.string(),
});

/** Inferred TypeScript type for {@link AuditLogEntrySchema}. */
export type AuditLogEntry = ZodInfer<typeof AuditLogEntrySchema>;

// ---------------------------------------------------------------------------
// Feedback schemas
// ---------------------------------------------------------------------------

/** Tally of correct / incorrect votes for a single entity type. */
export const FeedbackTallySchema = z.object({
  correct: z.number().int().nonnegative(),
  incorrect: z.number().int().nonnegative(),
});

/** Inferred TypeScript type for {@link FeedbackTallySchema}. */
export type FeedbackTally = ZodInfer<typeof FeedbackTallySchema>;

/** Privacy-safe accuracy tallies keyed by entity type. */
export const FeedbackStatsSchema = z.record(z.string(), FeedbackTallySchema);

/** Inferred TypeScript type for {@link FeedbackStatsSchema}. */
export type FeedbackStats = ZodInfer<typeof FeedbackStatsSchema>;

/** Privacy-safe user report describing a missed PII pattern. */
export const MissedPIIReportSchema = z.object({
  id: z.string().min(1),
  createdAt: z.string().datetime(),
  entityType: z.string().min(1),
  description: z.string().min(4).max(240),
  provider: z.enum(providerKeys).optional(),
});

/** Inferred TypeScript type for {@link MissedPIIReportSchema}. */
export type MissedPIIReport = ZodInfer<typeof MissedPIIReportSchema>;

/** Ordered collection of missed-PII reports stored locally. */
export const MissedPIIReportsSchema = z.array(MissedPIIReportSchema);

// ============================================================

// === Free-only build: SettingsSchema = FreeSettingsSchema ===
export const SettingsSchema = FreeSettingsSchema;
export type Settings = FreeSettings;
