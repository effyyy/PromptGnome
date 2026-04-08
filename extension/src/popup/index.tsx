/**
 * Extension popup entry point.
 * Shows protection status, quick stats, category toggles, and upgrade CTA.
 * Width: 280px as required by Chrome extension popup guidelines.
 * Architecture layer: UI (popup)
 */

import "~src/style.css"

import { useCallback, useEffect, useState } from "react"

import CategoryToggles from "~src/components/CategoryToggles"
import { ReportBugButton } from "~src/components/ReportBugDialog"
import ProtectionToggle from "~src/components/ProtectionToggle"
import QuickStats from "~src/components/QuickStats"
import { CircuitBackground } from "~src/components/ui/CircuitBackground"
import { GlassCard } from "~src/components/ui/GlassCard"
import { ShieldIcon } from "~src/components/ui/ShieldIcon"
import { useSettings } from "~src/hooks/useSettings"
import { useStats } from "~src/hooks/useStats"
import AccuracySlider, { type DetectionMode } from "~src/popup/components/AccuracySlider"
import ModelDownloadProgress from "~src/popup/components/ModelDownloadProgress"
import { PRO_BUILD } from "~src/shared/build-flags"
import { trackSessionStart, trackDailyActive } from "~src/services/analytics-port"
import SubscriptionStatus from "~src/components/SubscriptionStatus-port"
import { PROMO_ACTIVE } from "~src/shared/constants"

/**
 * Main popup component rendered when the extension icon is clicked.
 */
function IndexPopup() {
  const { settings, loading: settingsLoading, updateSettings } = useSettings()
  const { stats, loading: statsLoading } = useStats()
  const [passthroughProviders, setPassthroughProviders] = useState<string[]>([])
  const [detectionMode, setDetectionMode] = useState<DetectionMode>("speed")
  const [isPro, setIsPro] = useState(false)

  useEffect(() => {
    chrome.storage.session.get(null).then(items => {
      const providers = Object.keys(items)
        .filter(k => k.startsWith("passthrough_"))
        .map(k => k.replace("passthrough_", ""))
      setPassthroughProviders(providers)
    }).catch(() => {})
  }, [])

  // Sync detectionMode state from loaded settings
  useEffect(() => {
    if (!settingsLoading && settings.detectionMode) {
      setDetectionMode(settings.detectionMode as DetectionMode)
    }
  }, [settingsLoading, settings.detectionMode])

  // Detect PRO status from storage (or promo flag)
  useEffect(() => {
    chrome.storage.local.get("paddleCustomerId", (result) => {
      setIsPro(result["paddleCustomerId"] != null || PROMO_ACTIVE)
    })
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === "local" && "paddleCustomerId" in changes) {
        setIsPro(changes["paddleCustomerId"]?.newValue != null || PROMO_ACTIVE)
      }
    }
    try { chrome.storage.onChanged.addListener(listener) } catch {}
    return () => { try { chrome.storage.onChanged.removeListener(listener) } catch {} }
  }, [])

  useEffect(() => {
    if (PRO_BUILD) {
      void trackSessionStart("popup");
      void trackDailyActive();
    }
  }, [])

  const handleToggleProtection = useCallback(
    (enabled: boolean) => {
      updateSettings({ protectionEnabled: enabled })
    },
    [updateSettings]
  )

  const handleToggleCategory = useCallback(
    (types: readonly string[], enabled: boolean) => {
      updateSettings((current) => {
        const updated: Record<string, boolean> = { ...current.enabledTypes }
        for (const type of types) {
          updated[type] = enabled
        }
        return { enabledTypes: updated as typeof current.enabledTypes }
      })
    },
    [updateSettings]
  )

  const handleDetectionModeChange = useCallback(
    (mode: DetectionMode) => {
      setDetectionMode(mode)
      updateSettings({ detectionMode: mode })
    },
    [updateSettings]
  )

  const openSidePanel = useCallback(async () => {
    try {
      // Call chrome.sidePanel.open() directly from the popup to preserve
      // the user-gesture context (lost when routing through the service worker).
      if (chrome.sidePanel?.open) {
        const win = await chrome.windows.getCurrent()
        await chrome.sidePanel.open({ windowId: win.id })
        return
      }
    } catch {
      // Fallback to message-based approach
    }
    try {
      chrome.runtime.sendMessage({ type: "OPEN_SIDE_PANEL" })
    } catch {
      // Side panel may not be available
    }
  }, [])

  if (settingsLoading) {
    return (
      <div className="w-[360px] px-5 py-4 bg-void text-center text-sm text-[var(--text-muted)]">
        Loading...
      </div>
    )
  }

  return (
    <div className="relative w-[360px] bg-void overflow-hidden">
      <CircuitBackground variant="popup" />
      <div className="relative z-10 px-5 py-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldIcon size={32} animate={settings.protectionEnabled} />
            <h1
              className="text-sm font-sans font-extrabold tracking-tight"
              style={{
                background: "linear-gradient(135deg, #00e5a0, #ffb347)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                letterSpacing: "-0.02em",
              }}
            >
              PromptGnome
            </h1>
          </div>
          {PRO_BUILD && <SubscriptionStatus />}
        </div>

        {/* Detection accuracy mode slider */}
        <AccuracySlider
          value={detectionMode}
          onChange={handleDetectionModeChange}
          isPro={isPro}
        />

        {/* Protection toggle */}
        <ProtectionToggle
          enabled={settings.protectionEnabled}
          onToggle={handleToggleProtection}
        />

        {/* Passthrough warning banner — shown when a provider's API has changed */}
        {passthroughProviders.length > 0 && (
          <div className="bg-yellow-900/30 border border-yellow-600/50 rounded-lg px-3 py-2 text-xs text-yellow-200 mb-2">
            Detection paused for {passthroughProviders.join(", ")} — API change detected. Your chats are unaffected.
          </div>
        )}

        {/* Model download progress — auto-hides when no download is active */}
        <ModelDownloadProgress />

        {/* Stats */}
        <QuickStats stats={stats} loading={statsLoading} />

        {/* Category toggles */}
        <GlassCard className="py-1">
          <CategoryToggles
            enabledTypes={settings.enabledTypes}
            onToggleCategory={handleToggleCategory}
          />
        </GlassCard>

        {/* Full settings link */}
        <button
          onClick={openSidePanel}
          className="w-full text-xs font-mono text-cyber-dim hover:text-cyber py-1 transition-colors"
        >
          Open Full Settings →
        </button>

        {/* Branded footer */}
        <div className="pt-1 border-t border-white/[0.04]">
          <div className="flex items-center justify-center gap-2">
            <span className="text-[9px] font-mono text-[var(--text-muted)]">
              Your AI privacy shield
            </span>
            <span className="text-[9px] text-[var(--text-muted)]">·</span>
            <ReportBugButton className="text-[9px]" />
          </div>
        </div>
      </div>
    </div>
  )
}

export default IndexPopup
