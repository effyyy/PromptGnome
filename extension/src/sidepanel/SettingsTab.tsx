/**
 * Settings tab for the side panel.
 * Per-type toggles grouped by category, per-provider toggles, behavior mode.
 * Architecture layer: UI (side panel tab)
 */

import { useEffect, useRef, useState } from "react"

// Pro feature imports — hidden until Pro tier goes live
// import { NerConsentToggle } from "~src/components/NerConsentToggle"
// import { OcrConsentToggle } from "~src/components/OcrConsentToggle"
import { CyanToggle } from "~src/components/ui/CyanToggle"
import { GlassCard } from "~src/components/ui/GlassCard"
import { MonoLabel } from "~src/components/ui/MonoLabel"
import { useSettings, type Settings } from "~src/hooks/useSettings"
import { PII_CATEGORIES, PII_TYPES, PROMO_ACTIVE } from "~src/shared/constants"
import ProUpgradeCard from "~src/popup/components/ProUpgradeCard-port"

/** PII types grouped by category, derived from the canonical PII_CATEGORIES */
const TYPE_GROUPS = Object.entries(PII_CATEGORIES).map(([category, typeIds]) => ({
  category,
  types: typeIds.map((id) => ({
    id,
    label: PII_TYPES[id as keyof typeof PII_TYPES]?.label ?? id,
  })),
}))

const PROVIDERS = [
  { id: "CHATGPT", label: "ChatGPT" },
  { id: "CLAUDE", label: "Claude" },
  { id: "GEMINI", label: "Gemini" },
  { id: "DEEPSEEK", label: "DeepSeek" },
  { id: "PERPLEXITY", label: "Perplexity" },
  { id: "GROK", label: "Grok" },
  { id: "COPILOT", label: "Copilot" },
  { id: "META_AI", label: "Meta AI" },
] as const

const DISMISS_BEHAVIORS = [
  { value: "block" as const, label: "Block message (safe default)", desc: "Closing the warning prevents the message from sending" },
  { value: "send" as const, label: "Send anyway", desc: "Closing the warning sends the message despite detected PII" },
] as const

const DETECTION_MODES = [
  { value: "speed" as const, label: "Speed", desc: "Regex-only detection. Fastest runtime." },
  { value: "balanced" as const, label: "Balanced", desc: "Regex + local NER model. Best quality for free." },
  { value: "maximum" as const, label: "Maximum", desc: "3-engine server ensemble. Highest accuracy." },
] as const

/** Model detail metadata per detection mode. */
interface ModelInfo {
  readonly name: string
  readonly source: string
  readonly storage: string
  readonly size: string
}

const MODE_MODELS: Record<"balanced", readonly ModelInfo[]> = {
  balanced: [
    { name: "Xenova/distilbert-base-multilingual-cased-ner-hrl", source: "Hugging Face", storage: "Browser cache (local only)", size: "~110 MB" },
  ],
}

// Pro feature — hidden until Pro tier goes live
// const OCR_SCAN_OPTIONS = [
//   { key: "ocrScanImages" as const, label: "Scan image uploads" },
//   { key: "ocrScanPdfs" as const, label: "Scan PDF uploads" },
//   { key: "ocrScanDocuments" as const, label: "Scan Office documents" },
// ] as const

/**
 * Settings tab component for the side panel.
 * @returns React element with full settings interface
 */
/** Model readiness state for the settings panel. */
type ModelStatus = "not_needed" | "not_downloaded" | "downloading" | "ready" | "error"

function SettingsTab() {
  const { settings, updateSettings } = useSettings()
  const [modelStatus, setModelStatus] = useState<ModelStatus>("not_needed")
  const [downloadProgress, setDownloadProgress] = useState(0)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [isPro, setIsPro] = useState(false)
  const [showMaxUpgrade, setShowMaxUpgrade] = useState(false)

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

  // Check model status when detection mode changes
  useEffect(() => {
    if (settings.detectionMode === "speed") {
      setModelStatus("not_needed")
      setDownloadProgress(0)
      return
    }
    try {
      chrome.runtime.sendMessage(
        { type: "GET_MODEL_STATUS", mode: settings.detectionMode },
        (response?: { success?: boolean; data?: { ready?: boolean; loading?: boolean; cached?: boolean } }) => {
          if (chrome.runtime.lastError) {
            setModelStatus("not_downloaded")
            return
          }
          const data = response?.data
          if (data?.ready) {
            setModelStatus("ready")
          } else if (data?.loading) {
            setModelStatus("downloading")
          } else {
            setModelStatus("not_downloaded")
          }
        }
      )
    } catch {
      setModelStatus("not_downloaded")
    }
  }, [settings.detectionMode])

  /** Per-file byte tracking for cumulative progress in sidepanel. */
  const filesRef = useRef<Map<string, { loaded: number; total: number }>>(new Map())

  // Listen for download progress, completion, and error messages
  useEffect(() => {
    function handleMessage(message: Record<string, unknown>): void {
      const msgType = message["type"] as string

      if (msgType === "MODEL_DOWNLOAD_PROGRESS") {
        const data = message["data"] as { status?: string; progress?: number; file?: string; loaded?: number; total?: number } | undefined
        if (!data) return

        // Per-file "done" just means one file finished, not the whole model
        if (data.status === "done") return

        // Track per-file byte counts
        if (data.file && (data.total ?? 0) > 0) {
          filesRef.current.set(data.file, { loaded: data.loaded ?? 0, total: data.total ?? 0 })
        }

        if (data.status === "progress" || data.status === "download") {
          setModelStatus("downloading")

          // Compute cumulative progress across all files
          let totalLoaded = 0
          let totalSize = 0
          for (const fp of filesRef.current.values()) {
            totalLoaded += fp.loaded
            totalSize += fp.total
          }
          setDownloadProgress(totalSize > 0 ? Math.min(99, Math.round((totalLoaded / totalSize) * 100)) : 0)
        }
      } else if (msgType === "MODEL_DOWNLOAD_COMPLETE") {
        const data = message["data"] as { loaded?: boolean } | undefined
        setDownloadProgress(100)
        if (hideTimerRef.current !== null) clearTimeout(hideTimerRef.current)
        hideTimerRef.current = setTimeout(() => {
          setModelStatus(data?.loaded ? "ready" : "error")
          setDownloadProgress(0)
          filesRef.current.clear()
          hideTimerRef.current = null
        }, 800)
      } else if (msgType === "MODEL_DOWNLOAD_ERROR") {
        setModelStatus("error")
        setDownloadProgress(0)
        filesRef.current.clear()
      }
    }
    try { chrome.runtime.onMessage.addListener(handleMessage) } catch { /* noop */ }
    return () => {
      try { chrome.runtime.onMessage.removeListener(handleMessage) } catch { /* noop */ }
      if (hideTimerRef.current !== null) clearTimeout(hideTimerRef.current)
    }
  }, [])

  const toggleType = (typeId: string, enabled: boolean) => {
    updateSettings((current) => ({
      enabledTypes: { ...current.enabledTypes, [typeId]: enabled }
    }))
  }

  const toggleProvider = (providerId: string, enabled: boolean) => {
    updateSettings((current) => ({
      enabledProviders: { ...current.enabledProviders, [providerId]: enabled }
    }))
  }

  const setDismissBehavior = (mode: Settings["dismissBehavior"]) => {
    updateSettings({ dismissBehavior: mode })
  }

  const setDetectionMode = (mode: Settings["detectionMode"]) => {
    updateSettings({ detectionMode: mode })
  }

  const triggerModelDownload = () => {
    if (settings.detectionMode === "speed" || modelStatus === "ready" || modelStatus === "downloading") return
    setModelStatus("downloading")
    try {
      chrome.runtime.sendMessage(
        { type: "DOWNLOAD_MODEL", mode: settings.detectionMode },
        (response?: { data?: { started?: boolean } }) => {
          if (chrome.runtime.lastError || !response?.data?.started) {
            setModelStatus("error")
          }
        }
      )
    } catch {
      setModelStatus("error")
    }
  }

  const setConfidenceThreshold = (value: number) => {
    const clamped = Math.max(0, Math.min(1, value))
    updateSettings({ confidenceThreshold: Number(clamped.toFixed(2)) })
  }

  // Pro feature handlers — hidden until Pro tier goes live
  // const toggleNerBackendEnabled = (enabled: boolean) => { ... }
  // const toggleNerConsent = (enabled: boolean) => { ... }
  // const toggleOcrConsent = (enabled: boolean) => { ... }

  return (
    <div className="space-y-4">
      {/* Detection mode + threshold */}
      <GlassCard className="transition-shadow hover:shadow-cyber-sm">
        <MonoLabel className="mb-3">Detection Accuracy</MonoLabel>
        <div className="space-y-2">
          {DETECTION_MODES.map((mode) => {
            const isLocked = mode.value === "maximum" && !isPro
            return (
              <label key={mode.value} className={`flex items-start gap-3 py-1 cursor-pointer ${isLocked ? "opacity-80" : ""}`}>
                <input
                  type="radio"
                  name="detection-mode"
                  checked={settings.detectionMode === mode.value}
                  onChange={() => {
                    if (isLocked) {
                      setShowMaxUpgrade(true)
                      return
                    }
                    setShowMaxUpgrade(false)
                    setDetectionMode(mode.value)
                  }}
                  className="mt-0.5 w-4 h-4 accent-cyan-400"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-sans text-[var(--text-secondary)] font-medium">{mode.label}</span>
                    {mode.value === "maximum" && !isPro && (
                      <span className="text-[8px] font-mono font-bold tracking-wider uppercase text-amber bg-amber-glow px-1.5 py-0.5 rounded border border-amber/15">
                        PRO
                      </span>
                    )}
                    {isLocked && (
                      <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="#ffb347" strokeWidth="1.5" className="opacity-60">
                        <rect x="3" y="7" width="10" height="7" rx="1.5" />
                        <path d="M5 7V5a3 3 0 016 0v2" />
                      </svg>
                    )}
                  </div>
                  <div className="text-xs font-sans text-[var(--text-muted)]">{mode.desc}</div>
                </div>
              </label>
            )
          })}
        </div>

        {/* Pro waitlist card — shown when user picks Maximum mode (Pro is locked) */}
        <ProUpgradeCard
          visible={(showMaxUpgrade || settings.detectionMode === "maximum") && !isPro}
          onUpgradeComplete={() => {
            setShowMaxUpgrade(false)
            setDetectionMode("maximum")
          }}
        />

        {/* Model status + download button */}
        {settings.detectionMode === "balanced" && (
          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${
                  modelStatus === "ready" ? "bg-green-400" :
                  modelStatus === "downloading" ? "bg-cyan-400 animate-pulse" :
                  modelStatus === "error" ? "bg-red-400" :
                  "bg-amber-400"
                }`} />
                <span className={`text-xs font-mono ${
                  modelStatus === "ready" ? "text-green-400" :
                  modelStatus === "downloading" ? "text-cyan-400" :
                  modelStatus === "error" ? "text-red-400" :
                  "text-amber-400"
                }`}>
                  {modelStatus === "ready" ? "Model ready" :
                   modelStatus === "downloading" ? "Downloading model..." :
                   modelStatus === "error" ? "Download failed" :
                   "Model not downloaded"}
                </span>
              </div>
              {(modelStatus === "not_downloaded" || modelStatus === "error") && (
                <button
                  onClick={triggerModelDownload}
                  className="px-3 py-1 text-xs font-mono font-semibold rounded-md bg-cyan-400/10 text-cyan-400 hover:bg-cyan-400/20 transition-colors"
                >
                  {modelStatus === "error" ? "Retry" : "Download"}
                </button>
              )}
            </div>
            {modelStatus === "downloading" && (
              <div className="space-y-1">
                <div className="h-1.5 w-full rounded-full bg-[var(--card-border)] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-cyan-400 transition-all duration-300"
                    style={{ width: `${downloadProgress}%` }}
                  />
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-mono text-[var(--text-muted)] tabular-nums">
                    {downloadProgress}%
                  </span>
                </div>
              </div>
            )}

            {/* Model details — visible in balanced mode */}
            {settings.detectionMode === "balanced" && (() => {
              return (
              <div className="mt-1 space-y-2">
                {MODE_MODELS["balanced"].map((model: ModelInfo) => (
                  <div
                    key={model.name}
                    className="rounded-lg border border-[var(--card-border)] bg-[var(--bg-primary)]/40 px-3 py-2 space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-mono text-cyan-300 font-medium truncate">
                        {model.name}
                      </span>
                      <span className="text-[10px] font-mono text-[var(--text-muted)] shrink-0">
                        {model.size}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] font-mono text-[var(--text-muted)]">Source:</span>
                        <span className="text-[10px] font-mono text-[var(--text-secondary)]">{model.source}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] font-mono text-[var(--text-muted)]">Stored:</span>
                        <span className="text-[10px] font-mono text-[var(--text-secondary)]">{model.storage}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              )
            })()}
          </div>
        )}

        <div className="mt-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-mono text-[var(--text-secondary)] uppercase tracking-wider">
              Confidence Threshold
            </span>
            <span className="text-xs font-mono text-cyan-300">
              {Math.round(settings.confidenceThreshold * 100)}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={settings.confidenceThreshold}
            onChange={(event) => setConfidenceThreshold(Number(event.target.value))}
            className="w-full accent-cyan-400"
          />
          <div className="mt-1 text-xs font-sans text-[var(--text-muted)]">
            Lower catches more potential PII. Higher reduces false positives.
          </div>
        </div>
      </GlassCard>

      {/* Master protection */}
      <GlassCard className="transition-shadow hover:shadow-cyber-sm">
        <MonoLabel className="mb-3">Protection</MonoLabel>
        <div className="flex items-center justify-between py-1.5">
          <div className="flex-1 min-w-0 mr-3">
            <div className="text-sm font-sans text-[var(--text-secondary)] font-medium">
              Master protection
            </div>
            <div className="text-xs font-sans text-[var(--text-muted)] mt-0.5">
              Turns all message and file scanning on or off immediately.
            </div>
          </div>
          <CyanToggle
            checked={settings.protectionEnabled}
            onChange={(enabled) => updateSettings({ protectionEnabled: enabled })}
          />
        </div>
      </GlassCard>

      {/* Detection types by category */}
      <GlassCard className="transition-shadow hover:shadow-cyber-sm">
        <MonoLabel className="mb-3">Detection Types</MonoLabel>
        {TYPE_GROUPS.map((group) => (
          <div key={group.category} className="mb-4 last:mb-0">
            <div className="text-[9px] font-mono font-medium text-[var(--text-muted)] uppercase tracking-widest mb-2">
              {group.category}
            </div>
            <div className="space-y-1">
              {group.types.map((type) => (
                <div key={type.id} className="flex items-center justify-between py-1.5">
                  <span className="text-sm font-sans text-[var(--text-secondary)]">{type.label}</span>
                  <CyanToggle
                    checked={settings.enabledTypes[type.id] !== false}
                    onChange={(enabled) => toggleType(type.id, enabled)}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </GlassCard>

      {/* Provider toggles */}
      <GlassCard className="transition-shadow hover:shadow-cyber-sm">
        <MonoLabel className="mb-3">Providers</MonoLabel>
        <div className="space-y-1">
          {PROVIDERS.map((provider) => (
            <div key={provider.id} className="flex items-center justify-between py-1.5">
              <span className="text-sm font-sans text-[var(--text-secondary)]">{provider.label}</span>
              <CyanToggle
                checked={settings.enabledProviders[provider.id] !== false}
                onChange={(enabled) => toggleProvider(provider.id, enabled)}
              />
            </div>
          ))}
        </div>
      </GlassCard>

      {/* Dismiss behavior — what happens when user closes the warning */}
      <GlassCard className="transition-shadow hover:shadow-cyber-sm">
        <MonoLabel className="mb-3">Warning Dismiss Behavior</MonoLabel>
        <div className="text-xs font-sans text-[var(--text-muted)] mb-3">
          Controls what happens when you close the warning panel or click outside it.
        </div>
        <div className="space-y-2">
          {DISMISS_BEHAVIORS.map((mode) => (
            <label key={mode.value} className="flex items-start gap-3 py-1 cursor-pointer">
              <input
                type="radio"
                name="dismiss-behavior"
                checked={settings.dismissBehavior === mode.value}
                onChange={() => setDismissBehavior(mode.value)}
                className="mt-0.5 w-4 h-4 accent-cyan-400"
              />
              <div>
                <div className="text-sm font-sans text-[var(--text-secondary)] font-medium">{mode.label}</div>
                <div className="text-xs font-sans text-[var(--text-muted)]">{mode.desc}</div>
              </div>
            </label>
          ))}
        </div>
      </GlassCard>

      {/* Pro features hidden until Pro tier goes live */}
      {/* Advanced NER and File Scanning (OCR) cards will be re-enabled
          once payment gating is in place. */}
    </div>
  )
}

export default SettingsTab
