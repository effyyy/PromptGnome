/**
 * React hook for triggering PII detection via the background service worker.
 * Sends text to the service worker and receives detection results.
 * Architecture layer: UI (hooks)
 */

import { useCallback, useState } from "react"

import type { DetectionResult, PIIMatch } from "~src/detection/types"

/** Detection hook state */
interface DetectionState {
  matches: PIIMatch[]
  loading: boolean
  error: string | null
  processingTimeMs: number
}

/**
 * Hook to scan text for PII via the background service worker.
 * @returns Object with scan function, matches, loading state, and error
 */
export function useDetection() {
  const [state, setState] = useState<DetectionState>({
    matches: [],
    loading: false,
    error: null,
    processingTimeMs: 0
  })

  /**
   * Scans text for PII by sending a message to the service worker.
   * @param text - Text to scan
   * @param provider - Provider name for context
   * @returns Detection result or null on failure
   */
  const scan = useCallback(
    async (text: string, provider: string): Promise<DetectionResult | null> => {
      setState((prev) => ({ ...prev, loading: true, error: null }))
      try {
        const result = await chrome.runtime.sendMessage({
          type: "SCAN_REQUEST",
          text,
          provider
        })
        if (result?.success && result.data) {
          const detection = result.data as DetectionResult
          setState({
            matches: [...detection.matches],
            loading: false,
            error: null,
            processingTimeMs: detection.processingTimeMs
          })
          return detection
        }
        setState((prev) => ({
          ...prev,
          loading: false,
          error: result?.error ?? "Detection failed"
        }))
        return null
      } catch {
        setState((prev) => ({
          ...prev,
          loading: false,
          error: "Failed to communicate with background"
        }))
        return null
      }
    },
    []
  )

  const clear = useCallback(() => {
    setState({ matches: [], loading: false, error: null, processingTimeMs: 0 })
  }, [])

  return { ...state, scan, clear }
}
