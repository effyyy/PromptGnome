/**
 * Compact scanning-in-progress toast shown while the PII detection
 * pipeline analyzes an outbound message. Renders in the bottom-right
 * corner with the PromptGnome brand, a rotating shield loader, and
 * a cycling status message. The user's fetch is held until the scan
 * completes, so this provides visual feedback that work is happening.
 * Architecture layer: UI (composite component)
 */

import { useEffect, useState } from "react"

import { ShieldIcon } from "~src/components/ui/ShieldIcon"

/** Rotating status messages displayed beneath the brand name. */
const STATUS_MESSAGES = [
  "Scanning for secrets...",
  "Guarding your privacy...",
  "Checking for sensitive data...",
  "Keeping you safe...",
] as const

/** Milliseconds between status message rotations. */
const ROTATE_INTERVAL_MS = 2_000

/**
 * Compact scanning indicator toast.
 * @returns A fixed-position toast element in the bottom-right corner.
 */
function ScanningIndicator() {
  const [msgIndex, setMsgIndex] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setMsgIndex((i) => (i + 1) % STATUS_MESSAGES.length)
    }, ROTATE_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [])

  return (
    <div
      className="fixed z-[2147483647] animate-modal-enter"
      style={{
        bottom: "24px",
        right: "24px",
        pointerEvents: "auto",
      }}
    >
      <div
        className="flex items-center gap-3 rounded-xl px-4 py-3"
        style={{
          backgroundColor: "rgba(6, 10, 20, 0.95)",
          border: "1px solid rgba(0, 229, 160, 0.25)",
          boxShadow:
            "0 0 24px rgba(0, 229, 160, 0.12), 0 4px 20px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.04)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
        }}
      >
        {/* Animated shield icon with spinning ring */}
        <div className="relative shrink-0">
          <ShieldIcon size={36} animate />
          {/* Orbiting ring loader */}
          <svg
            className="absolute inset-0 w-full h-full"
            viewBox="0 0 36 36"
            aria-hidden="true"
          >
            <circle
              cx="18"
              cy="18"
              r="16"
              fill="none"
              stroke="rgba(0, 229, 160, 0.15)"
              strokeWidth="1.5"
            />
            <circle
              cx="18"
              cy="18"
              r="16"
              fill="none"
              stroke="#00e5a0"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeDasharray="25 75"
              style={{ animation: "pii-scan-spin 1.2s linear infinite" }}
            />
          </svg>
        </div>

        {/* Brand + status text */}
        <div className="min-w-0">
          <div
            className="text-sm font-sans font-bold tracking-tight leading-tight"
            style={{
              background: "linear-gradient(135deg, #00e5a0, #ffb347)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            PromptGnome
          </div>
          <div
            className="text-xs font-sans leading-tight mt-0.5 transition-opacity duration-300"
            style={{ color: "#8a94a8" }}
            key={msgIndex}
          >
            {STATUS_MESSAGES[msgIndex]}
          </div>
        </div>

        {/* Pulsing dot indicator */}
        <div className="flex gap-1 ml-1 shrink-0">
          <span
            className="block w-1.5 h-1.5 rounded-full bg-cyber"
            style={{ animation: "pii-dot-pulse 1.4s ease-in-out infinite" }}
          />
          <span
            className="block w-1.5 h-1.5 rounded-full bg-cyber"
            style={{ animation: "pii-dot-pulse 1.4s ease-in-out 0.2s infinite" }}
          />
          <span
            className="block w-1.5 h-1.5 rounded-full bg-cyber"
            style={{ animation: "pii-dot-pulse 1.4s ease-in-out 0.4s infinite" }}
          />
        </div>
      </div>
    </div>
  )
}

export default ScanningIndicator
