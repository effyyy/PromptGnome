/**
 * React hook for accessing and updating extension settings.
 *
 * Wraps `chrome.storage.local` with React state management and notifies the
 * background service worker of any changes via `chrome.runtime.sendMessage`.
 * Architecture layer: UI (hooks)
 */

import { useCallback, useEffect, useState } from "react";

import { PII_TYPES, PROVIDER_NAMES, CONFIG_KEYS } from "~src/shared/constants";
import { MESSAGE_TYPES } from "~src/shared/messages";
import type { Settings } from "~src/shared/schemas";

// Re-export the canonical Settings type so consumers can import it from this
// module without a direct dependency on schemas.
export type { Settings };

// ---------------------------------------------------------------------------
// Default settings constant
// ---------------------------------------------------------------------------

/**
 * Canonical default settings used when no persisted value exists.
 *
 * All PII types and providers are enabled, behaviour is set to `"warn"`,
 * and the confidence threshold defaults to `0.7`.
 */
const DEFAULT_SETTINGS: Settings = {
  protectionEnabled: true,
  enabledTypes: Object.fromEntries(
    Object.keys(PII_TYPES).map((key) => [key, true]),
  ) as Record<keyof typeof PII_TYPES, boolean>,
  enabledProviders: Object.fromEntries(
    Object.keys(PROVIDER_NAMES).map((key) => [key, true]),
  ) as Record<keyof typeof PROVIDER_NAMES, boolean>,
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
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Hook return type.
 */
export interface UseSettingsReturn {
  /** The current resolved settings (defaults applied when storage is empty). */
  settings: Settings;
  /** `true` while the initial storage read is in progress. */
  loading: boolean;
  /**
   * Merges `partial` into the current settings, persists to
   * `chrome.storage.local`, and notifies the background.
   */
  updateSettings: (update: Partial<Settings> | ((current: Settings) => Partial<Settings>)) => void;
}

/**
 * Reads and writes extension settings from `chrome.storage.local`.
 *
 * On mount the hook loads the persisted settings (falling back to
 * {@link DEFAULT_SETTINGS} when storage is empty or unavailable).  On each
 * call to `updateSettings` the new value is written to storage and broadcast
 * to the background via a `SETTINGS_UPDATE` message.
 *
 * @returns Object with current settings, loading state, and update function.
 */
export function useSettings(): UseSettingsReturn {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const applyStoredSettings = (value: unknown): void => {
      if (!value || typeof value !== "object") return;
      const raw = value as Partial<Settings> & {
        enabledTypes?: Record<string, boolean>;
        enabledProviders?: Record<string, boolean>;
      };
      setSettings({
        ...DEFAULT_SETTINGS,
        ...raw,
        enabledTypes: {
          ...DEFAULT_SETTINGS.enabledTypes,
          ...(raw.enabledTypes ?? {}),
        },
        enabledProviders: {
          ...DEFAULT_SETTINGS.enabledProviders,
          ...(raw.enabledProviders ?? {}),
        },
      });
    };

    try {
      chrome.storage.local.get(CONFIG_KEYS.SETTINGS, (result) => {
        if (chrome.runtime.lastError) {
          console.warn("[PromptGnome] Failed to load settings");
          setLoading(false);
          return;
        }
        applyStoredSettings(result[CONFIG_KEYS.SETTINGS]);
        setLoading(false);
      });
    } catch {
      setLoading(false);
    }

    const onStorageChanged = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string,
    ): void => {
      if (areaName !== "local") return;
      const change = changes[CONFIG_KEYS.SETTINGS];
      if (!change) return;
      applyStoredSettings(change.newValue);
    };

    try {
      chrome.storage.onChanged.addListener(onStorageChanged);
    } catch {
      // non-critical in non-extension test environments
    }

    return () => {
      try {
        chrome.storage.onChanged.removeListener(onStorageChanged);
      } catch {
        // non-critical
      }
    };
  }, []);

  const updateSettings = useCallback(
    (update: Partial<Settings> | ((current: Settings) => Partial<Settings>)) => {
      setSettings((current: Settings) => {
        const partial =
          typeof update === "function"
            ? (update as (current: Settings) => Partial<Settings>)(current)
            : update;
        const updated: Settings = { ...current, ...partial };
        try {
          chrome.storage.local.set(
            { [CONFIG_KEYS.SETTINGS]: updated },
            () => {
              if (chrome.runtime.lastError) {
                console.warn("[PromptGnome] Failed to save settings");
              }
            },
          );
          chrome.runtime.sendMessage({
            type: MESSAGE_TYPES.SETTINGS_UPDATE,
            settings: updated as unknown as Record<string, unknown>,
          });
        } catch {
          console.warn("[PromptGnome] Failed to save settings");
        }
        return updated;
      });
    },
    [],
  );

  return { settings, loading, updateSettings };
}
