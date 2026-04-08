/**
 * React hook for accessing detection statistics.
 * Reads from chrome.storage.local with daily bucketing.
 * Architecture layer: UI (hooks)
 */

import { useCallback, useEffect, useState } from "react"

/** Stats entry for a single day */
export interface StatsEntry {
  messagesScanned: number
  piiDetected: Record<string, number>
  messagesBlocked: number
  messagesSentAnyway: number
}

const EMPTY_STATS: StatsEntry = {
  messagesScanned: 0,
  piiDetected: {},
  messagesBlocked: 0,
  messagesSentAnyway: 0
}

/**
 * Gets today's date as a storage key string.
 * @returns Date string in YYYY-MM-DD format
 */
function todayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Hook to read today's detection statistics.
 * @returns Object with stats, loading state, and refresh function
 */
export function useStats() {
  const [stats, setStats] = useState<StatsEntry>(EMPTY_STATS)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(() => {
    try {
      const key = `stats:${todayKey()}`
      chrome.storage.local.get(key, (result) => {
        if (chrome.runtime.lastError) {
          setLoading(false)
          return
        }
        setStats(result[key] ?? EMPTY_STATS)
        setLoading(false)
      })
    } catch {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { stats, loading, refresh }
}
