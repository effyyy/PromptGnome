/**
 * Detection accuracy mode slider for the extension popup.
 * Presents a 3-position range input (Speed / Balanced / Maximum) that lets
 * the user trade inference latency for detection quality.
 * Maximum mode is PRO-gated; free users see a lock icon and upgrade card.
 * Architecture layer: UI (popup component)
 */

import { useEffect, useState } from "react"

import { PRO_BUILD } from "~src/shared/build-flags"
import ProUpgradeCard from "~src/popup/components/ProUpgradeCard-port"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The three user-selectable detection accuracy modes. */
export type DetectionMode = "speed" | "balanced" | "maximum"

/** Model readiness state. */
type ModelStatus = "not_needed" | "not_downloaded" | "downloading" | "ready" | "error"

/** Props for the AccuracySlider component. */
interface AccuracySliderProps {
  /** Currently active detection mode. */
  value: DetectionMode
  /** Called with the new mode when the slider changes. */
  onChange: (mode: DetectionMode) => void
  /** Whether the current user has a PRO subscription. */
  isPro: boolean
  /** Additional Tailwind classes applied to the outer card. */
  className?: string
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Ordered tuple mapping slider integer positions to mode keys. */
const MODES: readonly DetectionMode[] = ["speed", "balanced", "maximum"] as const

/** Human-readable label for each mode. */
const MODE_LABELS: Record<DetectionMode, string> = {
  speed: "Speed",
  balanced: "Balanced",
  maximum: "Maximum",
}

/** Timing estimate shown beneath the label for each mode. */
const MODE_TIMING: Record<DetectionMode, string> = {
  speed: "Regex only · <10 ms",
  balanced: "Regex + Multilingual NER · ~300 ms",
  maximum: "3-engine server ensemble · ~200 ms",
}

/** Download size description for each mode. */
const MODE_SIZE: Record<DetectionMode, string> = {
  speed: "No model download required",
  balanced: "~110 MB model (downloaded once)",
  maximum: "Runs on PromptGnome servers (PRO)",
}

/** Accent color class for each mode. */
const MODE_COLOR: Record<DetectionMode, string> = {
  speed: "text-amber",
  balanced: "text-cyber",
  maximum: "text-[#00e5a0]",
}

/** Status display config per model status. */
const STATUS_DISPLAY: Record<ModelStatus, { label: string; color: string; dot: string }> = {
  not_needed: { label: "No model needed", color: "text-[#5a6478]", dot: "bg-[#5a6478]" },
  not_downloaded: { label: "Model not downloaded", color: "text-amber", dot: "bg-amber" },
  downloading: { label: "Downloading model...", color: "text-cyber", dot: "bg-cyber animate-pulse" },
  ready: { label: "Model ready", color: "text-[var(--success)]", dot: "bg-[var(--success)]" },
  error: { label: "Download failed", color: "text-red-400", dot: "bg-red-400" },
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Converts a numeric slider position to its corresponding mode key.
 *
 * @param position - Integer slider value (0, 1, or 2).
 * @returns The matching DetectionMode string.
 */
function positionToMode(position: number): DetectionMode {
  return MODES[Math.max(0, Math.min(2, position))] ?? "speed"
}

/**
 * Converts a mode key to its integer slider position.
 *
 * @param mode - The DetectionMode string.
 * @returns Integer slider position (0, 1, or 2).
 */
function modeToPosition(mode: DetectionMode): number {
  return MODES.indexOf(mode)
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Three-position accuracy slider (Speed / Balanced / Maximum).
 *
 * Renders a dark card containing a labelled range input that lets the user
 * select the detection quality level. Maximum mode is PRO-gated — free users
 * see a lock icon on the tick label and an upgrade card when they select it.
 *
 * @param props - Component props.
 * @returns A slider card element.
 *
 * @example
 * ```tsx
 * <AccuracySlider
 *   value={detectionMode}
 *   onChange={(mode) => updateSettings({ detectionMode: mode })}
 *   isPro={isPro}
 * />
 * ```
 */
function AccuracySlider({ value, onChange, isPro, className = "" }: AccuracySliderProps) {
  const position = modeToPosition(value)
  const [modelStatus, setModelStatus] = useState<ModelStatus>(
    value === "speed" ? "not_needed" : "not_downloaded"
  )
  const [showUpgrade, setShowUpgrade] = useState(false)

  // Check model readiness on mount and mode change (balanced only — maximum uses backend)
  useEffect(() => {
    if (value === "speed" || value === "maximum") {
      setModelStatus("not_needed")
      return
    }

    // Ask background for model status (balanced mode only)
    try {
      chrome.runtime.sendMessage(
        { type: "GET_MODEL_STATUS", mode: value },
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
  }, [value])

  // Listen for download progress, completion, and error messages
  useEffect(() => {
    function handleMessage(message: Record<string, unknown>): void {
      const type = message["type"] as string

      if (type === "MODEL_DOWNLOAD_PROGRESS") {
        const data = message["data"] as { status?: string } | undefined
        if (!data) return
        // Per-file progress — just confirm we're downloading, never mark as ready
        if (data.status !== "done") {
          setModelStatus("downloading")
        }
      } else if (type === "MODEL_DOWNLOAD_COMPLETE") {
        const data = message["data"] as { loaded?: boolean } | undefined
        setModelStatus(data?.loaded ? "ready" : "error")
      } else if (type === "MODEL_DOWNLOAD_ERROR") {
        setModelStatus("error")
      }
    }

    try {
      chrome.runtime.onMessage.addListener(handleMessage)
    } catch {
      // Extension context may not be available
    }

    return () => {
      try {
        chrome.runtime.onMessage.removeListener(handleMessage)
      } catch {}
    }
  }, [])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const newMode = positionToMode(parseInt(e.target.value, 10))
    if (newMode === "maximum" && !isPro) {
      setShowUpgrade(true)
      return
    }
    setShowUpgrade(false)
    onChange(newMode)
  }

  /**
   * Explicitly triggers model download for balanced mode.
   */
  function triggerDownload(): void {
    if (value === "speed" || value === "maximum" || modelStatus === "ready" || modelStatus === "downloading") return
    setModelStatus("downloading")
    try {
      chrome.runtime.sendMessage(
        { type: "DOWNLOAD_MODEL", mode: value },
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

  const status = STATUS_DISPLAY[modelStatus]

  return (
    <>
      <div
        className={`rounded-xl border border-[#1a2040] bg-[#0e1628] px-4 py-3 space-y-3 ${className}`}
      >
        {/* Header row */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-mono font-semibold text-[#e8edf5]">
            Detection Accuracy
          </span>
          <span className={`text-xs font-mono font-bold ${MODE_COLOR[value]}`}>
            {MODE_LABELS[value]}
          </span>
        </div>

        {/* Range slider — 3 positions: 0=speed, 1=balanced, 2=maximum */}
        <div className="relative">
          <input
            type="range"
            min={0}
            max={2}
            step={1}
            value={position}
            onChange={handleChange}
            aria-label="Detection accuracy mode"
            aria-valuetext={MODE_LABELS[value]}
            className={[
              "w-full h-1.5 appearance-none rounded-full cursor-pointer",
              "bg-[#1a2040]",
              "[&::-webkit-slider-thumb]:appearance-none",
              "[&::-webkit-slider-thumb]:w-4",
              "[&::-webkit-slider-thumb]:h-4",
              "[&::-webkit-slider-thumb]:rounded-full",
              "[&::-webkit-slider-thumb]:bg-[#00e5a0]",
              "[&::-webkit-slider-thumb]:cursor-pointer",
              "[&::-webkit-slider-thumb]:transition-colors",
              "[&::-webkit-slider-thumb]:hover:bg-[#00e5a0]",
              "[&::-moz-range-thumb]:w-4",
              "[&::-moz-range-thumb]:h-4",
              "[&::-moz-range-thumb]:rounded-full",
              "[&::-moz-range-thumb]:border-0",
              "[&::-moz-range-thumb]:bg-[#00e5a0]",
              "[&::-moz-range-thumb]:cursor-pointer",
            ].join(" ")}
          />

          {/* Tick labels below the slider */}
          <div className="flex justify-between mt-1">
            {MODES.map((mode) => (
              <span
                key={mode}
                className={`text-[9px] font-mono transition-colors flex items-center gap-0.5 ${
                  value === mode || (mode === "maximum" && showUpgrade) ? MODE_COLOR[mode] : "text-[#5a6478]"
                }`}
              >
                {mode === "maximum" && !isPro && (
                  <svg width="7" height="7" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="opacity-70">
                    <rect x="3" y="7" width="10" height="7" rx="1.5" />
                    <path d="M5 7V5a3 3 0 016 0v2" />
                  </svg>
                )}
                {MODE_LABELS[mode]}
              </span>
            ))}
          </div>
        </div>

        {/* Info rows */}
        <div className="space-y-1 border-t border-[#1a2040] pt-2">
          <div className="flex items-start gap-2">
            <span className="text-[10px] font-mono text-[#5a6478] leading-tight shrink-0 w-10">
              Speed
            </span>
            <span className="text-[10px] font-mono text-[#8a94a8] leading-tight">
              {MODE_TIMING[value]}
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-[10px] font-mono text-[#5a6478] leading-tight shrink-0 w-10">
              Model
            </span>
            <span className="text-[10px] font-mono text-[#8a94a8] leading-tight">
              {MODE_SIZE[value]}
            </span>
          </div>
          {value === "balanced" && (
            <>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-[#5a6478] leading-tight shrink-0 w-10">
                  Status
                </span>
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${status.dot}`} />
                  <span className={`text-[10px] font-mono leading-tight ${status.color}`}>
                    {status.label}
                  </span>
                </div>
                {(modelStatus === "not_downloaded" || modelStatus === "error") && (
                  <button
                    onClick={triggerDownload}
                    className="shrink-0 px-2 py-0.5 text-[9px] font-mono font-semibold rounded-md bg-cyber/15 text-cyber hover:bg-cyber/25 transition-colors"
                  >
                    {modelStatus === "error" ? "Retry" : "Download"}
                  </button>
                )}
              </div>
              {modelStatus === "ready" && (
                <p className="text-[9px] font-mono text-[#5a6478] leading-snug pl-12">
                  BERT-based detection model — runs 100% locally in your browser. Never uploaded.
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {PRO_BUILD && !isPro && (
        <ProUpgradeCard
          visible={showUpgrade}
          onUpgradeComplete={() => {
            setShowUpgrade(false)
            onChange("maximum")
          }}
        />
      )}
    </>
  )
}

export default AccuracySlider
