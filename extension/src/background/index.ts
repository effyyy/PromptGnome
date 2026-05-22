/**
 * Service worker entry point.
 *
 * Bootstraps the PromptGnome background process by wiring up the
 * message router, alarm handler, and one-time install setup.  This file
 * is the single `background.service_worker` entry registered in the
 * Plasmo manifest.
 */

import { CONFIG_KEYS, PROMO_ACTIVE } from "~src/shared/constants";
import { createLogger } from "~src/utils/logger";
import { PRO_BUILD } from "~src/shared/build-flags";
import { generateInstallId } from "~src/services/telemetry-sync-port";
import { initMessageRouter } from "./message-router";
import { initAlarmHandler, registerAlarms } from "./alarm-handler";

// Plasmo's Parcel pipeline rewrites these `url:` imports to the bundled,
// content-hashed filenames at build time. Importing them here lets us
// register the MAIN-world content scripts ourselves with reliable error
// handling, rather than depending on Plasmo's auto-generated registration
// which silently swallows errors and leaves the scripts unregistered on
// any failure (e.g. duplicate id after service worker restart).
import interceptorScriptUrl from "url:~src/contents/interceptor";
import highlighterScriptUrl from "url:~src/contents/highlighter";

const PROVIDER_MATCHES: string[] = [
  "https://chatgpt.com/*",
  "https://chat.openai.com/*",
  "https://claude.ai/*",
  "https://gemini.google.com/*",
  "https://chat.deepseek.com/*",
  "https://www.perplexity.ai/*",
  "https://perplexity.ai/*",
  "https://grok.com/*",
  "https://x.com/i/grok*",
  "https://copilot.microsoft.com/*",
  "https://www.meta.ai/*",
  "https://meta.ai/*",
];

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

const log = createLogger("service-worker");

// ---------------------------------------------------------------------------
// Default settings
// ---------------------------------------------------------------------------

/** Default settings applied on first install when no settings exist yet. */
const DEFAULT_SETTINGS: Record<string, unknown> = {
  protectionEnabled: true,
  enabledTypes: Object.fromEntries(
    [
      // Free-tier local detectors (20 types)
      "EMAIL", "SSN", "CREDIT_CARD", "PHONE_US", "PHONE_INTL",
      "IPV4", "IPV6", "AWS_ACCESS_KEY", "AWS_SECRET_KEY",
      "GITHUB_TOKEN", "STRIPE_KEY", "GENERIC_API_KEY", "IBAN",
      // New free-tier local detectors (7 types)
      "OPENAI_KEY", "ANTHROPIC_KEY", "GOOGLE_AI_KEY", "SLACK_TOKEN",
      "PRIVATE_KEY", "JWT_TOKEN", "CRYPTO_WALLET",
      // Pro-tier backend-only types (13 types)
      "PASSPORT_US", "DRIVERS_LICENSE", "ZIP_CODE", "DATE_OF_BIRTH",
      "STREET_ADDRESS", "PERSON_NAME", "ORGANIZATION", "LOCATION",
      "MEDICAL_TERM", "NATIONAL_ID", "BANK_ACCOUNT", "VIN",
      "MEDICAL_LICENSE",
    ].map((key) => [key, true]),
  ),
  enabledProviders: Object.fromEntries(
    [
      "CHATGPT", "CLAUDE", "GEMINI", "DEEPSEEK",
      "PERPLEXITY", "GROK", "COPILOT", "META_AI",
    ].map((key) => [key, true]),
  ),
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
};

// ---------------------------------------------------------------------------
// Install handler
// ---------------------------------------------------------------------------

/**
 * Runs once when the extension is first installed or updated.
 * Sets default settings, registers alarms, and clears the onboarding
 * flag so the welcome flow triggers.
 *
 * @param details - Chrome install/update event details.
 */
async function onInstalled(
  details: chrome.runtime.InstalledDetails,
): Promise<void> {
  try {
    if (details.reason === "install") {
      log.info("Extension installed — applying defaults");

      const installData: Record<string, unknown> = {
        [CONFIG_KEYS.SETTINGS]: DEFAULT_SETTINGS,
        [CONFIG_KEYS.ONBOARDING_COMPLETE]: false,
        [CONFIG_KEYS.INSTALL_DATE]: new Date().toISOString(),
      };

      // During the launch promotion, generate an install ID immediately so
      // the NER client can use it for token exchange without requiring
      // telemetry opt-in.
      if (PRO_BUILD && PROMO_ACTIVE) {
        installData[CONFIG_KEYS.TELEMETRY_INSTALL_ID] = generateInstallId();
      }

      await chrome.storage.local.set(installData);
      // Set initial Pro status for content scripts
      await chrome.storage.sync.set({ isProUser: PROMO_ACTIVE });
    }

    await registerAlarms();
    log.info("Install handler complete", { reason: details.reason });
  } catch {
    log.error("Install handler failed");
  }
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

/**
 * Initialises all background subsystems.  Called at module-load time
 * (i.e. when the service worker script is first evaluated).
 */
function bootstrap(): void {
  initMessageRouter();
  initAlarmHandler();

  // During the launch promotion, ensure an install ID exists for existing
  // users who installed before the promo (they won't re-trigger onInstalled).
  if (PRO_BUILD && PROMO_ACTIVE) {
    chrome.storage.local.get(CONFIG_KEYS.TELEMETRY_INSTALL_ID, (items) => {
      if (!items[CONFIG_KEYS.TELEMETRY_INSTALL_ID]) {
        chrome.storage.local.set({
          [CONFIG_KEYS.TELEMETRY_INSTALL_ID]: generateInstallId(),
        });
      }
    });
  }

  chrome.alarms.create("cleanup-mappings", { periodInMinutes: 60 })

  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === "cleanup-mappings") {
      try {
        const { EncryptedMappingStore } = await import("~src/anonymization/encrypted-store")
        const store = new EncryptedMappingStore()
        await store.init()
        await store.cleanup()
      } catch { /* non-critical */ }
    }
  })

  chrome.runtime.onInstalled.addListener((details) => {
    onInstalled(details).catch(() => {
      log.error("onInstalled listener threw unexpectedly");
    });
  });

  // Plasmo's auto-generated main-world-scripts module calls
  // chrome.scripting.registerContentScripts without error handling.
  // On service worker restart the call fails with "Duplicate script ID".
  // This safeguard catches that rejection and re-registers if needed.
  ensureMainWorldScripts();

  log.info("PromptGnome service worker loaded");
}

/**
 * Resolves a Parcel `url:` import (which may be an absolute extension URL
 * or a bare path) to a relative path suitable for chrome.scripting.
 */
function toScriptingPath(scriptUrl: string): string {
  try {
    // Strip extension origin so chrome.scripting receives a path relative
    // to the extension root, e.g. "interceptor.21ce37bd.js".
    const u = new URL(scriptUrl);
    return u.pathname.replace(/^\//, "");
  } catch {
    return scriptUrl.replace(/^\//, "");
  }
}

/**
 * Ensures MAIN world content scripts (interceptor + highlighter) are
 * properly registered. Plasmo's auto-generated registration silently
 * swallows errors via `.catch(()=>{})`, so on any failure (most commonly
 * a duplicate-id collision after a service worker restart) the scripts
 * stay unregistered and every provider — including DeepSeek — loses
 * fetch interception until the user reinstalls the extension.
 *
 * This function takes ownership of registration: it unregisters any
 * existing entries with the well-known IDs, then registers fresh ones
 * using the bundled, content-hashed file URLs imported via Parcel's
 * `url:` scheme.
 */
async function ensureMainWorldScripts(): Promise<void> {
  const INTERCEPTOR_ID = "srcContentsInterceptor";
  const HIGHLIGHTER_ID = "srcContentsHighlighter";

  try {
    const existing = await chrome.scripting.getRegisteredContentScripts();
    const idsToRemove = existing
      .filter((s) => s.id === INTERCEPTOR_ID || s.id === HIGHLIGHTER_ID)
      .map((s) => s.id);

    if (idsToRemove.length > 0) {
      try {
        await chrome.scripting.unregisterContentScripts({ ids: idsToRemove });
      } catch {
        // Best-effort cleanup — registration below will surface any real error.
      }
    }

    const interceptorPath = toScriptingPath(String(interceptorScriptUrl));
    const highlighterPath = toScriptingPath(String(highlighterScriptUrl));

    await chrome.scripting.registerContentScripts([
      {
        id: HIGHLIGHTER_ID,
        js: [highlighterPath],
        matches: PROVIDER_MATCHES,
        world: "MAIN",
        runAt: "document_idle",
      },
      {
        id: INTERCEPTOR_ID,
        js: [interceptorPath],
        matches: PROVIDER_MATCHES,
        world: "MAIN",
        runAt: "document_start",
        allFrames: true,
      },
    ]);

    log.info("MAIN world scripts registered", {
      interceptor: interceptorPath,
      highlighter: highlighterPath,
    });
  } catch (err) {
    log.error("ensureMainWorldScripts: registration failed", {
      error: err instanceof Error ? err.message : "unknown-error",
    });
  }
}

bootstrap();
