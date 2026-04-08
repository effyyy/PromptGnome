/**
 * Model download progress indicator for the extension popup.
 * Listens for MODEL_DOWNLOAD_PROGRESS messages from the offscreen NER worker
 * and renders a progress bar with ETA while a model is downloading.
 * Auto-hides when the download completes (progress == 100 or status == "done").
 * Architecture layer: UI (popup component)
 */

import { useEffect, useRef, useState } from "react"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Shape of the data payload inside a MODEL_DOWNLOAD_PROGRESS message. */
interface DownloadProgressData {
  readonly status: string
  readonly progress: number
  readonly file: string
  readonly loaded: number
  readonly total: number
  readonly model: string
  readonly timestamp: number
}

/** Internal state for the rolling ETA calculation. */
interface ProgressSample {
  readonly bytesLoaded: number
  readonly timestamp: number
}

/** Per-file byte tracking for cumulative progress. */
interface FileProgress {
  loaded: number
  total: number
}

/** Number of samples used for the rolling-average ETA calculation. */
const ETA_WINDOW_SIZE = 5

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/** Props for the ModelDownloadProgress component. */
interface ModelDownloadProgressProps {
  /** Additional Tailwind classes applied to the outer card. */
  className?: string
}

/**
 * Displays model download progress while an NER model is being fetched.
 *
 * Renders null when no download is in progress. When active, shows a dark card
 * containing a label, progress bar, percentage, and estimated time remaining.
 *
 * @param props - Component props.
 * @returns A progress card element, or null when no download is active.
 *
 * @example
 * ```tsx
 * <ModelDownloadProgress />
 * ```
 */
function ModelDownloadProgress({ className = "" }: ModelDownloadProgressProps) {
  const [isActive, setIsActive] = useState(false)
  const [progress, setProgress] = useState(0)
  const [currentFile, setCurrentFile] = useState("")
  const [etaSeconds, setEtaSeconds] = useState<number | null>(null)
  const [hasError, setHasError] = useState(false)

  /** Per-file byte tracking keyed by filename for cumulative progress. */
  const filesRef = useRef<Map<string, FileProgress>>(new Map())

  /** Rolling window of (bytesLoaded, timestamp) samples for ETA calculation. */
  const samplesRef = useRef<ProgressSample[]>([])

  /** Timer ref used to auto-hide the card a moment after completion. */
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    /**
     * Calculates overall download percentage from cumulative bytes.
     *
     * @returns Overall progress 0–100.
     */
    function computeOverallProgress(): number {
      let totalLoaded = 0
      let totalSize = 0
      for (const fp of filesRef.current.values()) {
        totalLoaded += fp.loaded
        totalSize += fp.total
      }
      if (totalSize <= 0) return 0
      return Math.min(99, Math.round((totalLoaded / totalSize) * 100))
    }

    /**
     * Calculates ETA in seconds from the rolling byte-based sample window.
     *
     * @param currentBytes - Total bytes loaded so far.
     * @param totalBytes   - Total bytes expected.
     * @param now          - Current timestamp in milliseconds.
     * @returns Estimated seconds remaining, or null.
     */
    function computeEta(currentBytes: number, totalBytes: number, now: number): number | null {
      const samples = samplesRef.current
      if (samples.length < 2 || totalBytes <= 0) return null

      const oldest = samples[0]
      const elapsed = now - oldest.timestamp
      const gained = currentBytes - oldest.bytesLoaded

      if (gained <= 0 || elapsed <= 0) return null

      const remaining = totalBytes - currentBytes
      const msPerByte = elapsed / gained
      return Math.max(1, Math.round((remaining * msPerByte) / 1000))
    }

    function handleMessage(message: Record<string, unknown>): void {
      const msgType = message["type"] as string

      if (msgType === "MODEL_DOWNLOAD_PROGRESS") {
        const data = message["data"] as DownloadProgressData | undefined
        if (!data) return

        const { status, file, loaded, total, timestamp } = data

        // Per-file "done" just means one file finished — not the whole model
        if (status === "done") return

        // Track per-file byte counts for cumulative progress
        if (file && total > 0) {
          filesRef.current.set(file, { loaded, total })
        }

        // Only show for actual progress updates (not initiate/done/ready)
        if (status === "progress" || status === "download") {
          setIsActive(true)
          setHasError(false)
          if (file) setCurrentFile(file)

          const overall = computeOverallProgress()
          setProgress(overall)

          // Compute ETA from cumulative bytes
          let totalLoaded = 0
          let totalSize = 0
          for (const fp of filesRef.current.values()) {
            totalLoaded += fp.loaded
            totalSize += fp.total
          }

          const samples = samplesRef.current
          samples.push({ bytesLoaded: totalLoaded, timestamp })
          if (samples.length > ETA_WINDOW_SIZE) {
            samples.shift()
          }

          setEtaSeconds(computeEta(totalLoaded, totalSize, timestamp))
        }
      } else if (msgType === "MODEL_DOWNLOAD_COMPLETE") {
        const data = message["data"] as { loaded?: boolean } | undefined
        setProgress(100)
        setEtaSeconds(null)

        if (hideTimerRef.current !== null) {
          clearTimeout(hideTimerRef.current)
        }
        hideTimerRef.current = setTimeout(() => {
          setIsActive(false)
          setProgress(0)
          setCurrentFile("")
          setHasError(data?.loaded !== true)
          samplesRef.current = []
          filesRef.current.clear()
          hideTimerRef.current = null
        }, 1200)
      } else if (msgType === "MODEL_DOWNLOAD_ERROR") {
        setHasError(true)
        setProgress(0)
        setEtaSeconds(null)

        if (hideTimerRef.current !== null) {
          clearTimeout(hideTimerRef.current)
        }
        hideTimerRef.current = setTimeout(() => {
          setIsActive(false)
          samplesRef.current = []
          filesRef.current.clear()
          hideTimerRef.current = null
        }, 3000)
      }
    }

    try {
      chrome.runtime.onMessage.addListener(handleMessage)
    } catch {
      // Extension context may not be available in test environments
    }

    return () => {
      try {
        chrome.runtime.onMessage.removeListener(handleMessage)
      } catch {}
      if (hideTimerRef.current !== null) {
        clearTimeout(hideTimerRef.current)
      }
    }
  }, [])

  if (!isActive) return null

  // Truncate the file name to avoid overflow
  const fileLabel =
    currentFile.length > 30 ? `…${currentFile.slice(-28)}` : currentFile

  const barColor = hasError ? "bg-red-400" : "bg-[#00e5a0]"
  const percentColor = hasError ? "text-red-400" : "text-[#00e5a0]"

  return (
    <div
      className={`rounded-xl border border-[#1a2040] bg-[#0e1628] px-4 py-3 space-y-2 ${className}`}
    >
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-mono font-semibold text-[#e8edf5] truncate">
          {hasError ? "Download failed" : "Downloading detection model"}
        </span>
        <span className={`text-xs font-mono tabular-nums shrink-0 ${percentColor}`}>
          {hasError ? "Error" : `${progress}%`}
        </span>
      </div>

      {/* Progress bar */}
      {!hasError && (
        <div className="h-1.5 w-full rounded-full bg-[#1a2040] overflow-hidden">
          <div
            className={`h-full rounded-full ${barColor} transition-all duration-300`}
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* Footer row */}
      <div className="flex items-center justify-between gap-2">
        {fileLabel ? (
          <span className="text-[10px] font-mono text-[#5a6478] truncate max-w-[160px]">
            {fileLabel}
          </span>
        ) : (
          <span />
        )}
        {etaSeconds !== null && etaSeconds > 0 && (
          <span className="text-[10px] font-mono text-[#5a6478] tabular-nums shrink-0">
            ~{etaSeconds}s left
          </span>
        )}
      </div>
    </div>
  )
}

export default ModelDownloadProgress
