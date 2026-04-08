/**
 * Plasmo CSUI overlay for the PII warning modal.
 * Listens for pii-shield:outbound events from the interceptor and shows
 * the PIIWarning component when PII is detected.
 * Architecture layer: UI (content script CSUI)
 *
 * The window message listener is registered at module level (outside the React
 * lifecycle) so the interceptor always receives a response even when the CSUI
 * framework fails to mount (e.g. after an extension context invalidation).
 *
 * All CSS (Tailwind utilities, design tokens, animations, fonts) is injected
 * into a shadow DOM so it never leaks into the host page. This prevents
 * conflicts with host-page CSS and avoids breaking chat UI buttons.
 */

import type { PlasmoCSConfig, PlasmoGetRootContainer } from "plasmo"
import { useCallback, useEffect, useState } from "react"

import cssText from "data-text:../content-style.css"

import type { PIIMatch } from "~src/detection/types"

import PIIWarning from "~src/components/PIIWarning"
import ScanningIndicator from "~src/components/ScanningIndicator"
import { CONFIG_KEYS } from "~src/shared/constants"
import { createLogger } from "~src/utils/logger"
import {
  restoreInputFocus,
  fillProviderDraft,
  triggerProviderEditButton,
  replaceLatestUserBubbleText,
  isInsideUserBubble,
} from "~src/utils/provider-input"

const log = createLogger("overlay")

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
    "https://meta.ai/*"
  ]
}

/**
 * Provides a shadow-DOM-isolated container for the overlay React root.
 *
 * A shadow DOM boundary encapsulates all CSS (Tailwind utilities, design
 * tokens, animations, font-faces) so they never leak into the host page.
 * This prevents the extension from breaking the host chat UI's copy/edit
 * buttons, fonts, and layout.
 *
 * The host element is appended to documentElement (not body) so it is
 * present even if the page replaces body contents (e.g. SPA navigations).
 *
 * The host is zero-size with pointer-events:none so it never interferes
 * with page layout or click handling. The overlay's own backdrop sets
 * pointer-events:auto when visible to re-enable interaction.
 */
export const getRootContainer: PlasmoGetRootContainer = () =>
  new Promise((resolve) => {
    const hostId = "pii-shield-overlay-host"
    const existingHost = document.getElementById(hostId)
    if (existingHost?.shadowRoot) {
      const inner = existingHost.shadowRoot.getElementById("pii-shield-render-root")
      if (inner) {
        resolve(inner)
        return
      }
    }

    const host = document.createElement("div")
    host.id = hostId
    // z-index on the host is required: providers like Gemini wrap their app
    // shell in a stacking context that would otherwise trap the modal behind
    // the chat UI even though the modal itself uses zIndex 2147483647.
    host.style.cssText = "position:fixed;top:0;left:0;width:0;height:0;pointer-events:none;z-index:2147483647;"

    const shadow = host.attachShadow({ mode: "open" })

    // Inject compiled CSS (Tailwind utilities, design tokens, animations,
    // fonts) into the shadow DOM. This is the ONLY place the extension CSS
    // lives — nothing leaks to the host page.
    const style = document.createElement("style")
    style.textContent = cssText
    shadow.appendChild(style)

    // The .pii-shield-root class activates the design-token CSS variables
    // defined in content-style.css.
    const renderRoot = document.createElement("div")
    renderRoot.id = "pii-shield-render-root"
    renderRoot.className = "pii-shield-root"
    shadow.appendChild(renderRoot)

    document.documentElement.appendChild(host)
    resolve(renderRoot)
  })

// ---------------------------------------------------------------------------
// Module-level messaging (independent of React lifecycle)
// ---------------------------------------------------------------------------

/** State for a pending interception */
interface PendingInterception {
  text: string
  provider: string
  matches: PIIMatch[]
  detectedTypes: string[]
  originalBody: string
  resolve: (response: { action: string; modifiedBody?: string; matchCount?: number }) => void
  /** Present when the warning originates from a file scan rather than a typed message. */
  fileName?: string
}

/** Marker used to identify postMessage payloads belonging to PromptGnome. */
const MSG_NAMESPACE = "__piiShield"
/** Cross-world channel for pushing settings snapshots to MAIN-world scripts. */
const CHANNEL_SETTINGS_SYNC = "pii-shield:settings-sync"
/** Cross-world channel for MAIN-world scripts requesting current settings. */
const CHANNEL_SETTINGS_REQUEST = "pii-shield:settings-request"

/** Maximum time to wait for the service worker to respond to a scan request.
 *  Must exceed the NER worst-case chain: service worker wake-up (~1-3s) +
 *  local NER timeout (5.5s) + backend NER fallback (800ms) ≈ 9.3s.
 *  Previous value of 5s caused silent proceed on first scan in balanced mode. */
const SCAN_TIMEOUT_MS = 12_000

/** Maximum time a buffered request waits for React to mount before auto-proceeding. */
const QUEUE_TIMEOUT_MS = 4_000

/** A queued outbound request that arrived before React mounted. */
interface QueuedRequest {
  messageText: string
  provider: string
  requestId: string
  originalBody: string
}

/**
 * Requests that arrived before the React component registered its handler.
 * Flushed in FIFO order once `activeOutboundHandler` is set on mount.
 */
let requestQueue: QueuedRequest[] = []

/**
 * Set to `true` when the component unmounts so that new messages receive an
 * immediate "proceed" rather than being buffered forever.
 * Reset to `false` when the component mounts (supports HMR / SPA remount).
 */
let isPermanentlyUnmounted = false

/**
 * Callback registered by the React component when it mounts.
 * Null when the component has not mounted or has unmounted.
 */
type OutboundHandler = (text: string, provider: string, requestId: string, originalBody: string) => void
let activeOutboundHandler: OutboundHandler | null = null

/**
 * Callback registered by the React component for file-based PII warnings.
 * Receives a fully-constructed PendingInterception (no fetch to hold).
 * Null when the component has not mounted or has unmounted.
 */
type FileWarningHandler = (pending: PendingInterception) => void
let activeFileWarningHandler: FileWarningHandler | null = null

/**
 * Callback registered by the React component to show the missed-PII toast.
 * Called when a `pii-shield:scan-complete` event arrives with `matchCount === 0`.
 */
type ScanCompleteHandler = (matchCount: number) => void
let activeScanCompleteHandler: ScanCompleteHandler | null = null

/** Latest settings snapshot mirrored from chrome.storage.local. */
let latestSettingsSnapshot: Record<string, unknown> | null = null

/** Type guard for generic object records. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

/** Broadcasts a settings snapshot to MAIN-world scripts (highlighter/interceptor). */
function postSettingsSync(settings: unknown): void {
  if (!isRecord(settings)) return
  latestSettingsSnapshot = settings
  window.postMessage(
    {
      [MSG_NAMESPACE]: true,
      channel: CHANNEL_SETTINGS_SYNC,
      settings,
    },
    "*",
  )
}

/** Loads settings from storage and immediately broadcasts the snapshot. */
function loadAndBroadcastSettings(): void {
  try {
    if (!chrome.storage?.local?.get) return
    chrome.storage.local.get(CONFIG_KEYS.SETTINGS, (result) => {
      if (chrome.runtime?.lastError) return
      postSettingsSync(result?.[CONFIG_KEYS.SETTINGS])
    })
  } catch {
    // Fail-open in non-extension test/runtime contexts.
  }
}

/** Registers storage listeners so settings changes broadcast in real-time. */
function registerSettingsBridge(): void {
  loadAndBroadcastSettings()
  try {
    if (!chrome.storage?.onChanged?.addListener) return
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") return
      const change = changes[CONFIG_KEYS.SETTINGS]
      if (!change) return
      postSettingsSync(change.newValue)
    })
  } catch {
    // Non-critical when storage APIs are unavailable.
  }
}

/**
 * Resets module-level state between Vitest test runs.
 * Do NOT call this in production code.
 * @internal
 */
export function __resetModuleStateForTesting(): void {
  activeOutboundHandler = null
  activeFileWarningHandler = null
  activeScanCompleteHandler = null
  requestQueue = []
  isPermanentlyUnmounted = false
}

/** Sends a response back to the MAIN-world interceptor via postMessage. */
function sendShieldResponse(payload: Record<string, unknown>): void {
  window.postMessage(
    { [MSG_NAMESPACE]: true, channel: "pii-shield:response", ...payload },
    "*"
  )
}

/**
 * Returns true when the extension context is still valid.
 * Used to avoid calling chrome APIs after context invalidation.
 */
function isContextValid(): boolean {
  try {
    return !!chrome.runtime?.id
  } catch {
    return false
  }
}

/**
 * Module-level window message handler.
 * Registered once at load time so the interceptor never hangs waiting for
 * a response even when the CSUI component fails to mount.
 */
function handleWindowMessage(event: MessageEvent): void {
  const data = event.data as Record<string, unknown>
  if (typeof data !== "object" || data === null || data[MSG_NAMESPACE] !== true) {
    return
  }

  // If the extension context is dead, immediately proceed and clean up.
  if (!isContextValid()) {
    const channel = data.channel as string | undefined
    if (channel === "pii-shield:outbound" && data.requestId) {
      sendShieldResponse({ requestId: data.requestId, action: "proceed" })
    }
    cleanupStaleListener()
    return
  }

  const channel = data.channel as string | undefined

  if (channel === "pii-shield:outbound") {
    const { messageText, provider, requestId, originalBody } = data
    if (!messageText || typeof messageText !== "string") return
    const safeOriginalBody = typeof originalBody === "string" ? originalBody : ""

    if (activeOutboundHandler) {
      // Handler ready — process immediately.
      activeOutboundHandler(messageText, provider as string, requestId as string, safeOriginalBody)
    } else if (!isPermanentlyUnmounted) {
      // React not yet mounted — buffer the request for FIFO flush on mount.
      const rid = requestId as string
      log.info("Outbound message buffered (React not yet mounted)", {
        provider: provider as string,
        requestId: rid?.slice(0, 8),
        queueDepth: requestQueue.length + 1,
      })
      requestQueue.push({
        messageText,
        provider: provider as string,
        requestId: rid,
        originalBody: safeOriginalBody,
      })
      // Auto-proceed if React still hasn't mounted after QUEUE_TIMEOUT_MS.
      setTimeout(() => {
        const idx = requestQueue.findIndex((r) => r.requestId === rid)
        if (idx !== -1) {
          requestQueue.splice(idx, 1)
          log.warn("Buffered request timed out waiting for React mount — proceeding", {
            requestId: rid?.slice(0, 8),
          })
          sendShieldResponse({ requestId: rid, action: "proceed" })
        }
      }, QUEUE_TIMEOUT_MS)
    } else {
      // Component has permanently unmounted — fail-open immediately.
      log.warn("Outbound message received after permanent unmount — proceeding without scan", {
        provider: provider as string,
        requestId: (requestId as string)?.slice(0, 8),
      })
      sendShieldResponse({ requestId, action: "proceed" })
    }
  } else if (channel === "pii-shield:restore-draft") {
    const provider = data.provider as string | undefined
    const messageText = data.messageText as string | undefined
    if (provider) {
      // Delay to let the host page process the blocked response and re-render
      setTimeout(() => {
        const editTriggered = triggerProviderEditButton(provider)
        if (!editTriggered && messageText) {
          fillProviderDraft(provider, messageText)
        } else if (!editTriggered) {
          restoreInputFocus(provider)
        }
      }, 500)
    }
  } else if (channel === "pii-shield:scan-complete") {
    const matchCount = typeof data.matchCount === "number" ? data.matchCount : 0
    // Increment telemetry nudge counter (fire-and-forget)
    chrome.runtime.sendMessage({ type: "INCREMENT_SCAN_COUNT" }).catch(() => {})
    if (activeScanCompleteHandler) {
      activeScanCompleteHandler(matchCount)
    }
  } else if (channel === "pii-shield:file-outbound") {
    const { fileName, matches, matchCount } = data
    if (!matches || !Array.isArray(matches) || !matchCount) return

    // File warnings use a synthetic PendingInterception — there is no fetch
    // to hold, so resolve is a no-op. The overlay is dismissed via setPending(null).
    const fileMatches = matches as PIIMatch[]
    const detectedTypes = fileMatches.map((m: PIIMatch) => m.type)
    const pending: PendingInterception = {
      text: `PII detected in file: ${String(fileName ?? "unknown")}`,
      provider: "unknown",
      matches: fileMatches,
      detectedTypes,
      originalBody: "",
      fileName: String(fileName ?? ""),
      resolve: () => {
        // No fetch to unblock for file warnings; dismiss is handled by the component.
      },
    }

    if (activeFileWarningHandler) {
      activeFileWarningHandler(pending)
    }
  } else if (channel === CHANNEL_SETTINGS_REQUEST) {
    if (latestSettingsSnapshot !== null) {
      postSettingsSync(latestSettingsSnapshot)
    } else {
      loadAndBroadcastSettings()
    }
  }
}

/** Removes the stale window listener after extension context invalidation. */
function cleanupStaleListener(): void {
  window.removeEventListener("message", handleWindowMessage)
  // Drain any buffered requests so the interceptor is never left waiting.
  const remaining = requestQueue
  requestQueue = []
  for (const req of remaining) {
    sendShieldResponse({ requestId: req.requestId, action: "proceed" })
  }
  isPermanentlyUnmounted = true
  activeOutboundHandler = null
  activeFileWarningHandler = null
}

// Register at module load — this runs regardless of whether React mounts.
window.addEventListener("message", handleWindowMessage)
registerSettingsBridge()

// ---------------------------------------------------------------------------
// React components
// ---------------------------------------------------------------------------

/** Props for the MissedPIIToast component. */
interface MissedPIIToastProps {
  onReport: () => void
  onDismiss: () => void
}

/**
 * Floating toast shown after a clean scan to invite the user to report
 * PII that PromptGnome may have missed.
 *
 * Uses inline styles (not Tailwind) because the shadow-DOM host element
 * for this component is zero-size and the toast must escape it via
 * `position:fixed`. Tailwind utilities work inside the render root but
 * this toast intentionally floats over the full viewport.
 */
function MissedPIIToast({ onReport, onDismiss }: MissedPIIToastProps) {
  return (
    <div style={{ position: 'fixed', bottom: '16px', right: '16px', background: '#1f2937', color: '#fff', padding: '8px 16px', borderRadius: '8px', fontSize: '13px', zIndex: 2147483647, display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>
      <span>Did we miss something?</span>
      <button
        onClick={onReport}
        style={{ color: '#00e5a0', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
      >
        Report
      </button>
      <button
        onClick={onDismiss}
        style={{ color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer' }}
      >
        ×
      </button>
    </div>
  )
}

/**
 * Main overlay component that manages PII detection and warning display.
 */
function PIIOverlay() {
  const [pending, setPending] = useState<PendingInterception | null>(null)
  const [scanning, setScanning] = useState(false)
  const [showMissedToast, setShowMissedToast] = useState(false)
  const [dismissBehavior, setDismissBehavior] = useState<"block" | "send">("block")

  // Load dismissBehavior from settings on mount and keep it synced.
  useEffect(() => {
    try {
      if (!chrome.storage?.local?.get) return
      chrome.storage.local.get(CONFIG_KEYS.SETTINGS, (result) => {
        if (chrome.runtime?.lastError) return
        const raw = result?.[CONFIG_KEYS.SETTINGS]
        if (raw && typeof raw === "object" && "dismissBehavior" in raw) {
          const val = (raw as Record<string, unknown>).dismissBehavior
          if (val === "send" || val === "block") setDismissBehavior(val)
        }
      })
    } catch { /* non-critical */ }

    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== "local") return
      const change = changes[CONFIG_KEYS.SETTINGS]
      if (!change?.newValue) return
      const val = (change.newValue as Record<string, unknown>).dismissBehavior
      if (val === "send" || val === "block") setDismissBehavior(val)
    }
    try { chrome.storage?.onChanged?.addListener(onChanged) } catch { /* non-critical */ }
    return () => { try { chrome.storage?.onChanged?.removeListener(onChanged) } catch { /* non-critical */ } }
  }, [])

  const handleRecordFeedback = useCallback(
    async (match: PIIMatch, correct: boolean): Promise<boolean> => {
      try {
        const result = await chrome.runtime.sendMessage({
          type: "RECORD_FEEDBACK",
          entityType: match.type,
          correct,
        })
        return result?.success !== false
      } catch {
        return false
      }
    },
    []
  )

  const handleReportMissedPII = useCallback(
    async (report: { entityType: string; description: string }): Promise<boolean> => {
      if (!pending) return false
      try {
        const result = await chrome.runtime.sendMessage({
          type: "REPORT_MISSED_PII",
          provider: pending.provider,
          entityType: report.entityType,
          description: report.description,
        })
        return result?.success !== false
      } catch {
        return false
      }
    },
    [pending]
  )

  useEffect(() => {
    /**
     * Called by the module-level handler when the React component is mounted.
     * Runs the full PII scan pipeline and either shows the overlay or proceeds.
     */
    const handleOutbound = async (
      messageText: string,
      provider: string,
      requestId: string,
      originalBody: string,
    ) => {
      log.info("Outbound message received — starting PII scan", {
        provider,
        requestId: requestId.slice(0, 8),
        messageLen: messageText.length,
      })

      if (!isContextValid()) {
        log.warn("Extension context invalid — proceeding without scan", { provider })
        sendShieldResponse({ requestId, action: "proceed" })
        return
      }

      // Show scanning indicator while the pipeline runs — the user's
      // fetch is already deferred (held by the interceptor) so we give
      // visual feedback that PromptGnome is actively working.
      setScanning(true)

      try {
        log.info("Sending SCAN_REQUEST to service worker", { provider, messageLen: messageText.length })
        const result = await Promise.race([
          chrome.runtime.sendMessage({
            type: "SCAN_REQUEST",
            text: messageText,
            provider,
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Scan timeout")), SCAN_TIMEOUT_MS)
          ),
        ])

        if (!result?.success || !result.data?.matches?.length) {
          log.info("Scan result: no PII detected — proceeding", {
            provider,
            success: result?.success,
            matchCount: result?.data?.matches?.length ?? 0,
          })
          setScanning(false)
          sendShieldResponse({ requestId, action: "proceed", matchCount: 0 })
          return
        }

        const matches = result.data.matches as PIIMatch[]
        const behaviorMode: string = result.data.behaviorMode ?? "warn"
        const detectedTypes = matches.map((m: PIIMatch) => m.type)

        log.info("Scan result: PII DETECTED", {
          provider,
          matchCount: matches.length,
          types: detectedTypes.join(", "),
          behaviorMode,
          avgConfidence: (
            matches.reduce((sum, m) => sum + m.confidence, 0) / matches.length
          ).toFixed(2),
        })

        // Dismiss the scanning toast before showing a follow-up overlay
        // or proceeding transparently.
        setScanning(false)

        if (behaviorMode === "silent") {
          log.info("Behavior mode is silent — proceeding without overlay", { provider })
          sendShieldResponse({ requestId, action: "proceed", matchCount: matches.length })
          return
        }

        if (behaviorMode === "block") {
          log.info("Behavior mode is block — auto-blocking request", { provider, types: detectedTypes.join(", ") })
          try {
            chrome.runtime.sendMessage({ type: "STATS_UPDATE", messagesBlocked: 1 })
            chrome.runtime.sendMessage({
              type: "LOG_USER_DECISION",
              provider,
              detectedTypes,
              action: "blocked",
            })
          } catch { /* non-critical */ }
          sendShieldResponse({ requestId, action: "block", matchCount: matches.length })
          return
        }

        log.info("Showing PII warning overlay to user", { provider, matchCount: matches.length, types: detectedTypes.join(", ") })
        setPending({
          text: messageText,
          provider,
          matches,
          detectedTypes,
          originalBody,
          resolve: (response) => {
            log.info("User decision recorded", { provider, action: response.action, hasModifiedBody: !!response.modifiedBody })
            sendShieldResponse({ requestId, ...response, matchCount: matches.length })
            setPending(null)
          },
        })
      } catch (err) {
        setScanning(false)
        log.error("Scan pipeline error — proceeding with original request", {
          provider,
          error: err instanceof Error ? err.name : "unknown-error",
        })
        sendShieldResponse({ requestId, action: "proceed" })
      }
    }

    // Reset permanent-unmount flag on every mount (supports HMR and SPA remount).
    isPermanentlyUnmounted = false
    activeOutboundHandler = handleOutbound
    activeFileWarningHandler = (filePending: PendingInterception) => {
      log.info("File PII warning received", {
        fileName: filePending.fileName ?? "unknown",
        matchCount: filePending.matches.length,
      })
      setPending(filePending)
    }
    activeScanCompleteHandler = (matchCount: number) => {
      if (matchCount === 0) {
        setShowMissedToast(true)
        setTimeout(() => setShowMissedToast(false), 5000)
      }
    }

    // Flush any requests that arrived before this component mounted, in FIFO order.
    if (requestQueue.length > 0) {
      const queued = requestQueue
      requestQueue = []
      log.info("Flushing pre-mount request queue", { count: queued.length })
      for (const req of queued) {
        handleOutbound(req.messageText, req.provider, req.requestId, req.originalBody)
      }
    }

    return () => {
      activeOutboundHandler = null
      activeFileWarningHandler = null
      activeScanCompleteHandler = null
      isPermanentlyUnmounted = true
      // Drain buffered requests so the interceptor is never left waiting.
      const remaining = requestQueue
      requestQueue = []
      for (const req of remaining) {
        log.warn("Component unmounting — sending proceed for buffered request", {
          requestId: req.requestId.slice(0, 8),
        })
        sendShieldResponse({ requestId: req.requestId, action: "proceed" })
      }
    }
  }, [])

  const handleSendAnyway = useCallback(() => {
    if (pending) {
      if (pending.fileName !== undefined) {
        // File warning — no fetch to unblock; simply close the overlay.
        setPending(null)
        return
      }
      try {
        chrome.runtime.sendMessage({ type: "STATS_UPDATE", messagesSentAnyway: 1 })
        chrome.runtime.sendMessage({
          type: "LOG_USER_DECISION",
          provider: pending.provider,
          detectedTypes: pending.detectedTypes,
          action: "dismissed",
        })
      } catch { /* non-critical */ }
      pending.resolve({ action: "proceed" })
    }
  }, [pending])

  const handleEditMessage = useCallback(() => {
    if (pending) {
      try {
        chrome.runtime.sendMessage({ type: "STATS_UPDATE", messagesBlocked: 1 })
        chrome.runtime.sendMessage({
          type: "LOG_USER_DECISION",
          provider: pending.provider,
          detectedTypes: pending.detectedTypes,
          action: "blocked",
        })
      } catch { /* non-critical */ }
      pending.resolve({ action: "block" })
    }
  }, [pending])

  const handleAutoAnonymize = useCallback(async () => {
    if (!pending) return
    const t0 = performance.now()
    log.group("Auto-Anonymize pipeline")
    log.info("Pipeline started", {
      provider: pending.provider,
      matchCount: pending.matches.length,
      detectedTypes: pending.detectedTypes,
      textLength: pending.text.length,
    })
    try {
      // Step 1: Delegate anonymization + encrypted storage to the background
      // service worker. The overlay cannot safely import the provider registry
      // or encrypted store modules in the CSUI context.
      log.info("Step 1/3: Sending ANONYMIZE_REQUEST to background…")
      const response = await chrome.runtime.sendMessage({
        type: "ANONYMIZE_REQUEST",
        text: pending.text,
        matches: pending.matches,
        provider: pending.provider,
        hostname: window.location.hostname,
        originalBody: pending.originalBody,
      })

      if (!response?.success || !response.data?.modifiedBody) {
        log.warn("Background anonymization failed", {
          provider: pending.provider,
        })
        log.groupEnd()
        pending.resolve({ action: "proceed" })
        return
      }

      const modifiedBody = response.data.modifiedBody as string
      const mapperSnapshot = response.data.mapperSnapshot as Record<string, string>
      const anonymizedText = (response.data.anonymizedText as string | undefined) ?? ""
      log.info("Step 1/3: Background returned modified body", {
        modifiedBodyLength: modifiedBody.length,
        placeholderCount: Object.keys(mapperSnapshot).filter((k: string) => !k.startsWith("__counter:")).length,
      })

      // Step 1b: Rewrite the optimistic user bubble in the host transcript
      // BEFORE releasing the held network request. Providers like Claude
      // render the user bubble synchronously from the textarea, so without
      // this step the original PII flashes briefly in the user's own bubble
      // before any rehydration runs. The held fetch only releases via
      // pending.resolve() below, so this rewrite is guaranteed to land
      // before the wire payload (also anonymized) is sent.
      if (anonymizedText.length > 0 && anonymizedText !== pending.text) {
        const rewrote = replaceLatestUserBubbleText(
          pending.provider,
          pending.text,
          anonymizedText,
        )
        log.info("Step 1b: User-bubble rewrite", {
          provider: pending.provider,
          rewrote,
        })
      }

      // Step 2: Log the user decision and update stats
      try {
        chrome.runtime.sendMessage({ type: "LOG_USER_DECISION", provider: pending.provider, detectedTypes: pending.detectedTypes, action: "anonymized" })
        chrome.runtime.sendMessage({ type: "STATS_UPDATE", messagesAnonymized: 1 })
      } catch { /* non-critical */ }

      // Step 3: Set up DOM rehydration by watching for the AI response.
      // Build a lightweight placeholder→value lookup from the mapper snapshot
      // returned by the background. No heavy module imports needed.
      log.info("Step 2/3: Setting up DOM rehydration observer…")
      const placeholderToValue = new Map<string, string>()
      for (const [key, value] of Object.entries(mapperSnapshot)) {
        if (!key.startsWith("__counter:")) {
          placeholderToValue.set(key, value)
        }
      }
      log.info("Step 2/3: Rehydration map built", {
        entries: placeholderToValue.size,
      })

      // Build a regex from the placeholder keys for DOM scanning
      const placeholderKeys = [...placeholderToValue.keys()]
      if (placeholderKeys.length > 0) {
        const escaped = placeholderKeys.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        const regex = new RegExp(escaped.join("|"), "g")
        const targetNode = document.querySelector("main") ?? document.body
        const HIGHLIGHT = "background: rgba(0, 255, 200, 0.12); border-radius: 2px; padding: 0 2px;"

        const onResponseComplete = (event: MessageEvent) => {
          try {
            const d = event.data
            if (
              typeof d === "object" && d !== null &&
              d["__piiShield"] === true &&
              d["channel"] === "pii-shield:response-complete"
            ) {
              log.info("Step 3/3: Response-complete signal — rehydrating DOM")
              const rehydrateT0 = performance.now()
              // Skip user-message bubbles entirely — auto-anonymize and
              // rehydration are independent features. Rehydration is meant
              // to restore originals only inside the AI's reply.
              const providerKey = pending?.provider ?? ""
              const walker = document.createTreeWalker(
                targetNode,
                NodeFilter.SHOW_TEXT,
                {
                  acceptNode: (n) =>
                    isInsideUserBubble(n, providerKey)
                      ? NodeFilter.FILTER_REJECT
                      : NodeFilter.FILTER_ACCEPT,
                },
              )
              let node: Text | null
              let replaced = 0
              const textNodes: Text[] = []
              while ((node = walker.nextNode() as Text | null) !== null) {
                textNodes.push(node)
              }
              for (const textNode of textNodes) {
                const text = textNode.textContent
                if (!text) continue
                regex.lastIndex = 0
                if (!regex.test(text)) continue
                regex.lastIndex = 0

                const fragment = document.createDocumentFragment()
                let lastIdx = 0
                let m: RegExpExecArray | null
                while ((m = regex.exec(text)) !== null) {
                  if (m.index > lastIdx) {
                    fragment.appendChild(document.createTextNode(text.slice(lastIdx, m.index)))
                  }
                  const original = placeholderToValue.get(m[0])
                  if (original !== null && original !== undefined) {
                    const span = document.createElement("span")
                    span.textContent = original
                    span.setAttribute("style", HIGHLIGHT)
                    span.setAttribute("data-pii-rehydrated", "true")
                    fragment.appendChild(span)
                    replaced++
                  } else {
                    fragment.appendChild(document.createTextNode(m[0]))
                  }
                  lastIdx = m.index + m[0].length
                }
                if (lastIdx < text.length) {
                  fragment.appendChild(document.createTextNode(text.slice(lastIdx)))
                }
                textNode.parentNode?.replaceChild(fragment, textNode)
              }
              log.info("Rehydration complete", {
                placeholdersReplaced: replaced,
                textNodesScanned: textNodes.length,
                elapsedMs: (performance.now() - rehydrateT0).toFixed(2),
              })
              window.removeEventListener("message", onResponseComplete)
            }
          } catch {
            // Never break the host page.
          }
        }
        window.addEventListener("message", onResponseComplete)
      }

      const totalMs = (performance.now() - t0).toFixed(2)
      log.info("Pipeline complete — resolving with MODIFY action", {
        totalElapsedMs: totalMs,
        provider: pending.provider,
        matchCount: pending.matches.length,
      })
      log.groupEnd()
      pending.resolve({ action: "modify", modifiedBody })
    } catch (err) {
      log.error("Pipeline failed — falling through to proceed", {
        provider: pending?.provider,
        elapsedMs: (performance.now() - t0).toFixed(2),
        error: err instanceof Error ? err.name : "unknown-error",
      })
      log.groupEnd()
      if (pending) pending.resolve({ action: "proceed" })
    }
  }, [pending])

  const handleDismiss = useCallback(() => {
    if (pending) {
      if (pending.fileName !== undefined) {
        // File warning — no fetch to block; simply close the overlay.
        setPending(null)
        return
      }

      if (dismissBehavior === "send") {
        // User configured dismiss to send the message anyway.
        try {
          chrome.runtime.sendMessage({ type: "STATS_UPDATE", messagesSentAnyway: 1 })
          chrome.runtime.sendMessage({
            type: "LOG_USER_DECISION",
            provider: pending.provider,
            detectedTypes: pending.detectedTypes,
            action: "dismissed",
          })
        } catch { /* non-critical */ }
        pending.resolve({ action: "proceed" })
      } else {
        // Default: block the message on dismiss.
        try {
          chrome.runtime.sendMessage({ type: "STATS_UPDATE", messagesBlocked: 1 })
          chrome.runtime.sendMessage({
            type: "LOG_USER_DECISION",
            provider: pending.provider,
            detectedTypes: pending.detectedTypes,
            action: "blocked",
          })
        } catch { /* non-critical */ }
        pending.resolve({ action: "block" })
      }
    }
  }, [pending, dismissBehavior])

  // Show scanning indicator while the pipeline is running, then
  // transition to the full PII warning if threats are found.
  if (scanning) return <ScanningIndicator />

  if (!pending) {
    if (!showMissedToast) return null
    return (
      <MissedPIIToast
        onReport={() => {
          setShowMissedToast(false)
          // TODO: trigger missed PII report flow
        }}
        onDismiss={() => setShowMissedToast(false)}
      />
    )
  }

  return (
    <>
      <PIIWarning
        text={pending.text}
        matches={pending.matches}
        onSendAnyway={handleSendAnyway}
        onEditMessage={handleEditMessage}
        onAutoAnonymize={handleAutoAnonymize}
        onRecordFeedback={handleRecordFeedback}
        onReportMissedPII={handleReportMissedPII}
        onDismiss={handleDismiss}
        fileName={pending.fileName}
        dismissBehavior={dismissBehavior}
      />
      {showMissedToast && (
        <MissedPIIToast
          onReport={() => {
            setShowMissedToast(false)
          }}
          onDismiss={() => setShowMissedToast(false)}
        />
      )}
    </>
  )
}

export default PIIOverlay
