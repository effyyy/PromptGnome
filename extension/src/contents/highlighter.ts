/**
 * Plasmo MAIN-world content script for real-time PII highlighting.
 *
 * Runs at document_idle on all supported AI chatbot pages. Detects the
 * provider, locates the chat composer element, injects CSS Custom Highlight
 * rules, and starts the highlighting pipeline. Runs alongside interceptor.ts
 * — interceptor handles send-time interception, this script handles live
 * as-you-type highlighting.
 *
 * Architecture layer: Content script entry point (MAIN world)
 * Dependencies: highlighting/index, utils/provider-input, utils/logger
 */

import type { PlasmoCSConfig } from "plasmo"
import { createElement } from "react"
import { createRoot, type Root } from "react-dom/client"

import { createHighlightingPipeline, type HighlightingPipelineHandle } from "~src/highlighting/index"
import { PIIBadgeOverlay } from "~src/highlighting/pii-badge"
import type { BadgePosition, FeedbackVerdict } from "~src/highlighting/types"
import type { PIITypeId } from "~src/detection/types"
import { PROMO_ACTIVE, HOSTNAME_TO_PROVIDER } from "~src/shared/constants"
import { findProviderInput } from "~src/utils/provider-input"
import { createLogger } from "~src/utils/logger"
import { PRO_BUILD } from "~src/shared/build-flags"

const log = createLogger("highlighter")

/** Marker used to identify PromptGnome cross-world postMessage payloads. */
const MSG_NAMESPACE = "__piiShield"
/** Settings sync channel emitted by isolated-world scripts. */
const CHANNEL_SETTINGS_SYNC = "pii-shield:settings-sync"
/** Settings snapshot request channel sent from MAIN world. */
const CHANNEL_SETTINGS_REQUEST = "pii-shield:settings-request"
/** Time to wait for first settings snapshot before fail-open defaults apply. */
const SETTINGS_BOOTSTRAP_TIMEOUT_MS = 1_200

/** Minimal settings shape needed by the highlighter runtime gate. */
interface HighlighterSettingsSnapshot {
  readonly protectionEnabled?: boolean
  readonly highlightingEnabled?: boolean
  readonly enabledProviders?: Record<string, boolean>
}

// ---------------------------------------------------------------------------
// Plasmo config
// ---------------------------------------------------------------------------

export const config: PlasmoCSConfig = {
  matches: [
    "https://chatgpt.com/*",
    "https://chat.openai.com/*",
    "https://claude.ai/*",
    "https://gemini.google.com/*",
    "https://chat.deepseek.com/*",
    "https://www.perplexity.ai/*",
    "https://grok.com/*",
    "https://x.com/i/grok*",
    "https://copilot.microsoft.com/*",
    "https://www.meta.ai/*",
    "https://meta.ai/*",
  ],
  world: "MAIN",
  run_at: "document_idle",
}

// ---------------------------------------------------------------------------
// Provider detection
// ---------------------------------------------------------------------------

/**
 * Maps the current page's hostname to a provider identifier string.
 * Uses the canonical HOSTNAME_TO_PROVIDER map from shared/constants.
 *
 * @returns The provider key (e.g. "CHATGPT") or `null` if unrecognised.
 *
 * @example
 * ```ts
 * // On chatgpt.com:
 * detectProvider() // => "CHATGPT"
 * ```
 */
function detectProvider(): string | null {
  const hostname = window.location.hostname
  return HOSTNAME_TO_PROVIDER.get(hostname) ?? null
}

// ---------------------------------------------------------------------------
// Input element discovery
// ---------------------------------------------------------------------------

/**
 * Locates the chat composer element for the given provider.
 * Delegates to the shared `findProviderInput` from `utils/provider-input`
 * which handles provider-specific selectors, generic fallbacks, and
 * drilling into nested contenteditable elements.
 *
 * @param provider - Provider key from {@link detectProvider}.
 * @returns The first matching HTMLElement, or `null` if none found.
 *
 * @example
 * ```ts
 * const el = findInputElement("CHATGPT")
 * if (el) startPipeline(el, "CHATGPT")
 * ```
 */
function findInputElement(provider: string): HTMLElement | null {
  return findProviderInput(provider)
}

// ---------------------------------------------------------------------------
// Shadow DOM badge host
// ---------------------------------------------------------------------------

/** Unique ID for the badge-host element to prevent duplicate injection. */
const BADGE_HOST_ID = "pii-shield-highlight-badge-host"

/**
 * Creates (or re-uses) a zero-size shadow DOM host appended to
 * `document.documentElement`. The shadow root is returned as the badge
 * container so badge overlay elements are isolated from host-page CSS.
 *
 * @returns The shadow root's inner container element used as `badgeContainer`.
 *
 * @example
 * ```ts
 * const badgeContainer = createBadgeHost()
 * await createHighlightingPipeline({ ..., badgeContainer })
 * ```
 */
function createBadgeHost(): HTMLElement {
  const existingHost = document.getElementById(BADGE_HOST_ID)
  if (existingHost?.shadowRoot) {
    const inner = existingHost.shadowRoot.getElementById(
      "pii-shield-badge-root",
    )
    if (inner !== null) return inner
  }

  const host = document.createElement("div")
  host.id = BADGE_HOST_ID
  // Zero-size, fixed, pointer-events:none so it never affects layout or clicks.
  host.style.cssText =
    "position:fixed;top:0;left:0;width:0;height:0;pointer-events:none;z-index:2147483647;"

  const shadow = host.attachShadow({ mode: "open" })

  const badgeRoot = document.createElement("div")
  badgeRoot.id = "pii-shield-badge-root"
  shadow.appendChild(badgeRoot)

  document.documentElement.appendChild(host)

  return badgeRoot
}

// ---------------------------------------------------------------------------
// CSS Custom Highlight injection
// ---------------------------------------------------------------------------

/** ID of the injected <style> element to prevent duplicate injection. */
const HIGHLIGHT_STYLE_ID = "pii-shield-highlight-styles"

/**
 * Injects `::highlight()` CSS rules into `document.head` as a `<style>`
 * element so the CSS Custom Highlight API can paint them.
 *
 * These rules MUST live in the main document (not shadow DOM) because the
 * CSS Custom Highlight API applies highlights to ranges within the
 * document's own text nodes.
 *
 * @example
 * ```ts
 * injectHighlightStyles()
 * // After: document.head contains <style id="pii-shield-highlight-styles">
 * ```
 */
function injectHighlightStyles(): void {
  if (document.getElementById(HIGHLIGHT_STYLE_ID) !== null) return

  // Inline duplication of src/highlighting/highlight-styles.css.
  // Kept in sync manually — ::highlight() rules cannot be loaded from shadow DOM.
  // All types use uniform danger-red matching the landing page demo.
  const css = `
/* PromptGnome — CSS Custom Highlight rules */
/* Uniform danger-red: red bg tint + solid red underline (matches demo) */

::highlight(pii-email),
::highlight(pii-ssn),
::highlight(pii-credit-card),
::highlight(pii-phone),
::highlight(pii-ip),
::highlight(pii-api-key),
::highlight(pii-iban),
::highlight(pii-passport),
::highlight(pii-license),
::highlight(pii-zip),
::highlight(pii-dob),
::highlight(pii-address),
::highlight(pii-name),
::highlight(pii-organization),
::highlight(pii-location),
::highlight(pii-medical),
::highlight(pii-generic) {
  background-color: rgba(255, 107, 107, 0.15);
  color: #ff6b6b;
  /* Some editors (e.g. Grok / x.com) paint text via -webkit-text-fill-color
     which overrides plain color on ::highlight() — set both so the red
     foreground is actually visible. */
  -webkit-text-fill-color: #ff6b6b;
  -webkit-text-stroke-color: #ff6b6b;
  text-decoration: underline solid rgba(255, 107, 107, 0.8);
  text-decoration-thickness: 2px;
}
`.trim()

  const styleEl = document.createElement("style")
  styleEl.id = HIGHLIGHT_STYLE_ID
  styleEl.textContent = css
  document.head.appendChild(styleEl)
}

// ---------------------------------------------------------------------------
// Pipeline startup
// ---------------------------------------------------------------------------

/**
 * Wires the highlighting pipeline to the located input element and registers
 * cleanup on page unload.
 *
 * @param inputElement - The resolved chat composer element.
 * @param provider     - Provider key from {@link detectProvider}.
 * @returns A promise that resolves once the pipeline is initialised.
 *
 * @example
 * ```ts
 * const el = findInputElement("CLAUDE")
 * if (el) await startPipeline(el, "CLAUDE")
 * ```
 */
async function startPipeline(
  inputElement: HTMLElement,
  provider: string,
): Promise<(() => void) | null> {
  try {
    const badgeContainer = createBadgeHost()

    // Determine Pro status via chrome.storage — fall back to promo status on
    // any error (chrome.storage is unavailable in MAIN world).
    let isProUser = PROMO_ACTIVE
    try {
      const stored = await chrome.storage.sync.get("isProUser")
      isProUser = stored["isProUser"] === true || PROMO_ACTIVE
    } catch {
      // chrome.storage unavailable (MAIN world) — use promo status
    }

    let badgeRoot: Root | null = null
    let pipelineHandle: HighlightingPipelineHandle | null = null

    const pipeline = await createHighlightingPipeline({
      provider,
      inputElement,
      badgeContainer,
      isProUser,
      feedbackEnabled: isProUser,
      ...(PRO_BUILD ? { feedbackEndpoint: "https://api.promptgnome.com/v1/detection-feedback" } : {}),
      onBadgesUpdate: (badges) => {
        try {
          if (!badgeRoot) {
            badgeRoot = createRoot(badgeContainer)
          }
          badgeRoot.render(
            createElement(PIIBadgeOverlay, {
              badges: badges as BadgePosition[],
              onDismiss: (matchIndex: number, verdict: FeedbackVerdict, correctedType?: PIITypeId) => {
                if (pipelineHandle) {
                  void pipelineHandle.handleDismiss(matchIndex, verdict, correctedType)
                }
              },
            }),
          )
        } catch (err) {
          log.error("Badge rendering failed", {
            error: err instanceof Error ? err.message : String(err),
          })
        }
      },
    })
    pipelineHandle = pipeline

    log.info("Highlighting pipeline active", { provider })
    return () => {
      try {
        pipeline.cleanup()
        if (badgeRoot) {
          badgeRoot.unmount()
          badgeRoot = null
        }
      } catch {
        // Fail-open cleanup.
      }
    }
  } catch (err) {
    // Fail-open: log the error but never interrupt the user's workflow.
    log.error("startPipeline: pipeline failed to initialise — highlighting disabled", {
      provider,
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

// ---------------------------------------------------------------------------
// Runtime settings helpers
// ---------------------------------------------------------------------------

/** Polling interval in milliseconds while waiting for the composer element. */
const POLL_INTERVAL_MS = 500

/** Maximum total polling time before relying on mutation observer fallback. */
const POLL_MAX_MS = 10_000

/**
 * Parses a postMessage settings payload into the minimal shape needed by
 * the highlighter runtime gate.
 */
function parseSettingsSnapshot(value: unknown): HighlighterSettingsSnapshot {
  if (typeof value !== "object" || value === null) {
    return {}
  }

  const raw = value as Record<string, unknown>
  const providers =
    typeof raw.enabledProviders === "object" &&
    raw.enabledProviders !== null
      ? (raw.enabledProviders as Record<string, boolean>)
      : undefined

  return {
    protectionEnabled:
      typeof raw.protectionEnabled === "boolean"
        ? raw.protectionEnabled
        : undefined,
    highlightingEnabled:
      typeof raw.highlightingEnabled === "boolean"
        ? raw.highlightingEnabled
        : undefined,
    enabledProviders: providers,
  }
}

/**
 * Returns whether highlighting should run for the active provider under the
 * current settings snapshot.
 */
function isHighlightingEnabledForProvider(
  provider: string,
  settings: HighlighterSettingsSnapshot,
): boolean {
  if (settings.protectionEnabled === false) return false
  if (settings.highlightingEnabled === false) return false
  if (settings.enabledProviders?.[provider] === false) return false
  return true
}

// ---------------------------------------------------------------------------
// init IIFE
// ---------------------------------------------------------------------------

/**
 * Entry point — detects the provider, verifies API availability, injects
 * highlight CSS, then polls for the chat composer element before starting
 * the pipeline.
 */
;(function init(): void {
  // Bail if the CSS Custom Highlight API is unavailable (Firefox < 117, etc.).
  // The highlighting feature is an enhancement — fail-open without it.
  if (typeof CSS === "undefined" || typeof CSS.highlights === "undefined") {
    log.warn("CSS Custom Highlight API unavailable — highlighting disabled")
    return
  }

  const provider = detectProvider()
  if (provider === null) {
    log.warn("Unknown provider — highlighting disabled", {
      hostname: window.location.hostname,
    })
    return
  }

  log.info("Highlighter init", { provider })
  const activeProvider = provider

  // Inject ::highlight() CSS into the main document immediately.
  try {
    injectHighlightStyles()
  } catch (err) {
    log.error("Failed to inject highlight styles — highlighting disabled", {
      error: err instanceof Error ? err.message : String(err),
    })
    return
  }

  let settingsBootstrapped = false
  let currentSettings: HighlighterSettingsSnapshot = {}
  let discoveredInput: HTMLElement | null = null
  let stopActivePipeline: (() => void) | null = null
  let startInFlight: Promise<void> | null = null
  let startGeneration = 0
  let pollIntervalId: ReturnType<typeof setInterval> | null = null
  let mutationObserver: MutationObserver | null = null

  function stopPipeline(reason: string): void {
    // Invalidate any pending async start.
    startGeneration += 1
    if (stopActivePipeline === null) return
    try {
      stopActivePipeline()
    } catch {
      // Fail-open: cleanup should never break host page behavior.
    }
    stopActivePipeline = null
    pipelineInputElement = null
    log.info("Highlighting pipeline stopped", { provider: activeProvider, reason })
  }

  function shouldRun(): boolean {
    if (!settingsBootstrapped) return false
    return isHighlightingEnabledForProvider(activeProvider, currentSettings)
  }

  /** The input element currently monitored by the active pipeline. */
  let pipelineInputElement: HTMLElement | null = null

  function reconcile(trigger: string): void {
    // Detect stale pipeline: the monitored element was disconnected (SPA chat
    // switch) or a different input element appeared.  Stop the orphaned
    // pipeline so a fresh one can start for the new element.
    if (discoveredInput !== null && !discoveredInput.isConnected) {
      stopPipeline("element-disconnected")
      discoveredInput = findInputElement(activeProvider)
    } else if (
      stopActivePipeline !== null &&
      pipelineInputElement !== null &&
      !pipelineInputElement.isConnected
    ) {
      // The pipeline's element was disconnected even if discoveredInput was
      // already updated by a previous handlePotentialInput call.
      stopPipeline("pipeline-element-disconnected")
    }

    if (!shouldRun()) {
      stopPipeline(`disabled:${trigger}`)
      return
    }

    if (discoveredInput === null) return
    if (stopActivePipeline !== null) {
      // Pipeline is running.  If the input element changed (e.g. new chat
      // opened, editor re-mounted), restart with the new element.
      if (pipelineInputElement !== discoveredInput) {
        stopPipeline("element-changed")
      } else {
        return
      }
    }
    if (startInFlight !== null) return

    const targetElement = discoveredInput
    const thisStart = ++startGeneration
    startInFlight = (async () => {
      const cleanup = await startPipeline(targetElement, activeProvider)
      // Ignore stale starts if settings changed while startup was in-flight.
      if (thisStart !== startGeneration || !shouldRun()) {
        cleanup?.()
        return
      }
      if (cleanup !== null) {
        stopActivePipeline = cleanup
        pipelineInputElement = targetElement
      }
    })()
      .catch((err: unknown) => {
        log.error("Failed to start highlighting pipeline", {
          provider: activeProvider,
          trigger,
          error: err instanceof Error ? err.message : String(err),
        })
      })
      .finally(() => {
        startInFlight = null
        // Post-start verification: the target element may have been replaced
        // during the async startup (e.g. React hydration on ChatGPT).
        // Re-check immediately so we don't wait for the next heartbeat.
        handlePotentialInput("post-start")
      })
  }

  function handlePotentialInput(trigger: string): void {
    const needsScan =
      discoveredInput === null ||
      !discoveredInput.isConnected ||
      // Re-scan when no pipeline is active so a re-mounted editor is found.
      stopActivePipeline === null ||
      // Always re-verify on heartbeat: catches element replacement during
      // React hydration / SPA transitions where the old element may stay
      // connected but a new editor was mounted (e.g. ChatGPT SSR→hydration).
      trigger === "heartbeat"

    if (needsScan) {
      const next = findInputElement(activeProvider)
      if (next !== null && next !== discoveredInput) {
        discoveredInput = next
        log.info("Input element discovered", { provider: activeProvider, trigger })
      }
    }
    reconcile(trigger)
  }

  /** Interval that periodically verifies the pipeline is healthy. */
  let heartbeatId: ReturnType<typeof setInterval> | null = null

  /** How often the heartbeat runs (ms). */
  const HEARTBEAT_INTERVAL_MS = 1_000

  function ensureInputWatchers(): void {
    if (pollIntervalId === null) {
      let elapsed = 0
      pollIntervalId = setInterval(() => {
        handlePotentialInput("poll")
        if (discoveredInput !== null && stopActivePipeline !== null) {
          // Element found AND pipeline running — stop fast polling.
          if (pollIntervalId !== null) {
            clearInterval(pollIntervalId)
            pollIntervalId = null
          }
          return
        }

        elapsed += POLL_INTERVAL_MS
        if (elapsed >= POLL_MAX_MS && pollIntervalId !== null) {
          clearInterval(pollIntervalId)
          pollIntervalId = null
          if (discoveredInput === null) {
            log.warn("Input element not found after polling window", {
              provider: activeProvider,
              elapsedMs: elapsed,
            })
          }
        }
      }, POLL_INTERVAL_MS)
    }

    if (mutationObserver === null && document.body) {
      mutationObserver = new MutationObserver(() => {
        handlePotentialInput("mutation")
      })
      mutationObserver.observe(document.body, {
        childList: true,
        subtree: true,
      })
    }

    // Heartbeat: periodically verify the pipeline is healthy and the
    // monitored element is still valid. This catches cases where the SPA
    // replaced the editor element after the initial polling window closed
    // and no mutation observer event fired (e.g. React reconciliation
    // during initial hydration, or the pipeline failed to start because
    // settings were not bootstrapped when the element was first found).
    if (heartbeatId === null) {
      heartbeatId = setInterval(() => {
        handlePotentialInput("heartbeat")
      }, HEARTBEAT_INTERVAL_MS)
    }
  }

  function handleSettingsMessage(event: MessageEvent): void {
    const data = event.data as Record<string, unknown>
    if (typeof data !== "object" || data === null) return
    if (data[MSG_NAMESPACE] !== true) return
    if (data.channel !== CHANNEL_SETTINGS_SYNC) return

    currentSettings = parseSettingsSnapshot(data.settings)
    settingsBootstrapped = true
    reconcile("settings-sync")
  }

  /**
   * Handles `pii-shield:request-sent` — the interceptor has forwarded the
   * fetch request to the provider (proceed or modify). The provider will
   * clear the input field imminently, so tear down the current pipeline to
   * remove all inline highlights and badges immediately rather than waiting
   * for the DOM/textarea change to propagate.
   */
  function handleRequestSent(event: MessageEvent): void {
    const data = event.data as Record<string, unknown>
    if (typeof data !== "object" || data === null) return
    if (data[MSG_NAMESPACE] !== true) return
    if (data.channel !== "pii-shield:request-sent") return

    stopPipeline("request-sent")
    // Allow the pipeline to restart once the provider clears the input.
    setTimeout(() => {
      handlePotentialInput("post-send")
    }, 500)
  }

  window.addEventListener("message", handleSettingsMessage)
  window.addEventListener("message", handleRequestSent)
  ensureInputWatchers()
  handlePotentialInput("init")

  // Request an immediate settings snapshot from the isolated-world overlay.
  window.postMessage(
    { [MSG_NAMESPACE]: true, channel: CHANNEL_SETTINGS_REQUEST },
    "*",
  )

  // Fail-open fallback: if no settings snapshot arrives, proceed with defaults.
  window.setTimeout(() => {
    if (settingsBootstrapped) return
    settingsBootstrapped = true
    log.warn("Settings sync bootstrap timed out — using fail-open defaults", {
      provider: activeProvider,
      timeoutMs: SETTINGS_BOOTSTRAP_TIMEOUT_MS,
    })
    reconcile("settings-timeout")
  }, SETTINGS_BOOTSTRAP_TIMEOUT_MS)

  window.addEventListener(
    "beforeunload",
    () => {
      window.removeEventListener("message", handleSettingsMessage)
      window.removeEventListener("message", handleRequestSent)
      if (pollIntervalId !== null) {
        clearInterval(pollIntervalId)
        pollIntervalId = null
      }
      if (heartbeatId !== null) {
        clearInterval(heartbeatId)
        heartbeatId = null
      }
      mutationObserver?.disconnect()
      mutationObserver = null
      stopPipeline("beforeunload")
    },
    { once: true },
  )
})()
