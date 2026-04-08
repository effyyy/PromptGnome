/**
 * Settings manager — wraps chrome.storage.local for settings persistence.
 *
 * Reads and writes user-configurable settings (per-PII-type toggles,
 * per-provider toggles, behaviour mode, and confidence threshold).
 * Every write is validated through {@link SettingsSchema} before reaching
 * storage, and every read falls back to sensible defaults when storage is
 * empty or contains stale data.
 */

import { PII_TYPES, PROVIDER_NAMES, CONFIG_KEYS } from "~src/shared/constants";
import { SettingsSchema } from "~src/shared/schemas";
import type { Settings } from "~src/shared/schemas";
import { createLogger } from "~src/utils/logger";

const log = createLogger("settings-manager");

// ---------------------------------------------------------------------------
// Chrome storage helpers
// ---------------------------------------------------------------------------

/**
 * Promise wrapper around `chrome.storage.local.get`.
 *
 * @param keys - Storage keys to retrieve.
 * @returns The stored key-value pairs.
 */
function syncGet(keys: string | string[]): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(keys, (items) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(items);
      }
    });
  });
}

/**
 * Promise wrapper around `chrome.storage.local.set`.
 *
 * @param items - Key-value pairs to persist.
 */
function syncSet(items: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(items, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Default settings builder
// ---------------------------------------------------------------------------

/**
 * Returns the canonical default settings.
 *
 * All PII types enabled, all providers enabled, protection enabled,
 * behaviour set to `"warn"`, and confidence threshold at 0.7.
 *
 * @returns A fully populated {@link Settings} object with default values.
 */
export function getDefaultSettings(): Settings {
  const enabledTypes: Record<string, boolean> = {};
  for (const key of Object.keys(PII_TYPES)) {
    enabledTypes[key] = true;
  }

  /**
   * Provider enablement convention: enabledProviders[key] defaults to enabled
   * when the key is undefined (i.e., !== false check). New providers added
   * to PROVIDER_NAMES are automatically enabled without migration.
   */
  const enabledProviders: Record<string, boolean> = {};
  for (const key of Object.keys(PROVIDER_NAMES)) {
    enabledProviders[key] = true;
  }

  return SettingsSchema.parse({
    protectionEnabled: true,
    enabledTypes,
    enabledProviders,
    behaviorMode: "warn",
    confidenceThreshold: 0.7,
    telemetryEnabled: false,
    nerBackendEnabled: false,
    nerBackendConsent: false,
    nerEndpoint: "",
    highlightingEnabled: true,
    feedbackConsent: false,
    ocrBackendConsent: false,
    ocrScanImages: true,
    ocrScanPdfs: true,
    ocrScanDocuments: true,
    ocrEndpoint: "",
    detectionMode: "speed",
    enableSyntheticReplacement: false,
    dismissBehavior: "block",
  }) as Settings;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Retrieves the current user settings from sync storage.
 *
 * If storage is empty or the stored value fails schema validation the full
 * set of default settings is returned instead.
 *
 * @returns Current settings (validated).
 */
export async function getSettings(): Promise<Settings> {
  try {
    log.debug("Reading settings from storage")
    const items = await syncGet(CONFIG_KEYS.SETTINGS);
    const raw = items[CONFIG_KEYS.SETTINGS];

    if (!raw) {
      log.info("No settings in storage — returning defaults")
      return getDefaultSettings();
    }

    const defaults = getDefaultSettings();
    const rawObj =
      typeof raw === "object" && raw !== null
        ? (raw as Record<string, unknown>)
        : {};

    // Merge raw settings onto defaults so missing newly-added keys do not
    // force a full fallback to defaults.
    const mergedCandidate = {
      ...defaults,
      ...rawObj,
      enabledTypes: {
        ...(defaults.enabledTypes as Record<string, boolean>),
        ...(
          rawObj.enabledTypes &&
          typeof rawObj.enabledTypes === "object" &&
          rawObj.enabledTypes !== null
            ? (rawObj.enabledTypes as Record<string, boolean>)
            : {}
        ),
      },
      enabledProviders: {
        ...(defaults.enabledProviders as Record<string, boolean>),
        ...(
          rawObj.enabledProviders &&
          typeof rawObj.enabledProviders === "object" &&
          rawObj.enabledProviders !== null
            ? (rawObj.enabledProviders as Record<string, boolean>)
            : {}
        ),
      },
    };

    const parsed = SettingsSchema.safeParse(mergedCandidate);
    if (!parsed.success) {
      log.warn("Settings failed schema validation — returning defaults", {
        issues: parsed.error.issues.length,
      })
      return getDefaultSettings();
    }
    const result = parsed.data;

    log.debug("Settings loaded successfully", {
      protectionEnabled: result.protectionEnabled,
      behaviorMode: result.behaviorMode,
      confidenceThreshold: result.confidenceThreshold,
      telemetryEnabled: result.telemetryEnabled,
    })
    return result as Settings;
  } catch {
    log.warn("getSettings threw — returning defaults")
    return getDefaultSettings();
  }
}

/**
 * Merges a partial settings update into the current persisted settings.
 *
 * The merged result is validated against {@link SettingsSchema} before being
 * written.  Throws if validation fails.
 *
 * @param partial - One or more settings fields to update.
 */
export async function updateSettings(
  partial: Partial<Settings>,
): Promise<void> {
  try {
    log.info("Updating settings", { keys: Object.keys(partial).join(", ") })
    const current = await getSettings();
    const merged = { ...current, ...partial };
    const parsed = SettingsSchema.parse(merged);

    await syncSet({ [CONFIG_KEYS.SETTINGS]: parsed });
    log.info("Settings persisted successfully", { keys: Object.keys(partial).join(", ") })
  } catch (error: unknown) {
    log.error("updateSettings failed", {
      error: error instanceof Error ? error.name : "unknown-error",
    })
    throw new Error("Failed to update settings");
  }
}

/**
 * Checks whether detection of a specific PII type is currently enabled.
 *
 * @param typeId - A PII type key (e.g. `"EMAIL"`, `"SSN"`).
 * @returns `true` if the type is enabled or unknown (safe default).
 */
export async function isTypeEnabled(typeId: string): Promise<boolean> {
  try {
    const settings = await getSettings();
    const types = settings.enabledTypes as Record<string, boolean>;
    const value = types[typeId];
    return value !== false;
  } catch {
    return true;
  }
}

/**
 * Checks whether scanning is enabled for a given AI provider.
 *
 * @param provider - A provider key (e.g. `"CHATGPT"`, `"CLAUDE"`).
 * @returns `true` if the provider is enabled or unknown (safe default).
 */
export async function isProviderEnabled(provider: string): Promise<boolean> {
  try {
    const settings = await getSettings();
    const providers = settings.enabledProviders as Record<string, boolean>;
    const value = providers[provider];
    return value !== false;
  } catch {
    return true;
  }
}
