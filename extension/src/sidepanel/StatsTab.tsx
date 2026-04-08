/**
 * Statistics tab for the side panel.
 * Shows daily, weekly, and all-time detection statistics.
 * Architecture layer: UI (side panel tab)
 */

import { useEffect, useState } from "react"

import { getTodayStats, getWeekStats, getAllTimeStats } from "~src/services/stats-tracker"
import type { StatsEntry } from "~src/shared/schemas"
import { StatCard } from "~src/components/ui/StatCard"
import { MonoLabel } from "~src/components/ui/MonoLabel"
import { GlassCard } from "~src/components/ui/GlassCard"

const EMPTY_STATS: StatsEntry = {
  messagesScanned: 0,
  piiDetected: {},
  messagesBlocked: 0,
  messagesSentAnyway: 0
} as StatsEntry

/**
 * Statistics tab showing detection data across time periods.
 * @returns React element with stats dashboard
 */
function StatsTab() {
  const [period, setPeriod] = useState<"today" | "week" | "all">("today")
  const [stats, setStats] = useState<StatsEntry>(EMPTY_STATS)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const fetcher =
      period === "today" ? getTodayStats :
      period === "week" ? getWeekStats :
      getAllTimeStats
    fetcher()
      .then((s) => setStats(s))
      .catch(() => setStats(EMPTY_STATS))
      .finally(() => setLoading(false))
  }, [period])

  const totalDetected = (Object.values(stats.piiDetected) as number[]).reduce(
    (sum, n) => sum + n,
    0
  )

  return (
    <div className="space-y-4">
      {/* Period selector */}
      <GlassCard noBorder className="p-1.5 flex gap-1">
        {(["today", "week", "all"] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`flex-1 py-1.5 font-mono text-[10px] font-medium rounded-md transition-colors ${
              period === p
                ? "bg-cyber/10 text-cyber shadow-cyber-sm"
                : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            }`}
          >
            {p === "today" ? "Today" : p === "week" ? "This Week" : "All Time"}
          </button>
        ))}
      </GlassCard>

      {loading ? (
        <div className="text-center text-sm text-[var(--text-muted)] py-8">Loading...</div>
      ) : (
        <>
          {/* Hero number */}
          <div className="text-center py-2">
            <div
              className="font-mono text-[32px] font-bold text-cyber leading-none"
              style={{ textShadow: "0 0 20px rgba(0,229,160,0.25)" }}
            >
              {totalDetected}
            </div>
            <div className="font-mono text-[9px] uppercase tracking-widest text-[var(--text-muted)] mt-1">
              PII Detected
            </div>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Messages Scanned" value={stats.messagesScanned} />
            <StatCard label="PII Detected" value={totalDetected} variant="danger" />
            <StatCard label="Blocked" value={stats.messagesBlocked} />
            <StatCard label="Sent Anyway" value={stats.messagesSentAnyway} />
          </div>

          {/* Per-type breakdown */}
          {totalDetected > 0 && (
            <GlassCard>
              <MonoLabel className="mb-3">By Type</MonoLabel>
              <div className="space-y-1">
                {(Object.entries(stats.piiDetected) as [string, number][])
                  .sort(([, a], [, b]) => b - a)
                  .map(([type, count], i) => (
                    <div
                      key={type}
                      className={`flex items-center justify-between py-1.5 px-2 rounded ${
                        i % 2 === 0 ? "bg-cyber/[0.02]" : ""
                      }`}
                    >
                      <span className="text-sm font-sans text-[var(--text-secondary)]">
                        {type.replace(/_/g, " ")}
                      </span>
                      <span className="font-mono text-sm font-medium text-[#5dffc1]">{count}</span>
                    </div>
                  ))}
              </div>
            </GlassCard>
          )}
        </>
      )}
    </div>
  )
}

export default StatsTab
