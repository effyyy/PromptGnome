/**
 * Quick statistics display for the extension popup.
 * Shows today's scan and detection counts.
 * Architecture layer: UI (presentation component)
 */
import type { StatsEntry } from "~src/hooks/useStats"
import { StatCard } from "~src/components/ui/StatCard"

/** Props for the QuickStats component */
interface QuickStatsProps {
  /** Today's statistics */
  stats: StatsEntry
  /** Whether stats are still loading */
  loading: boolean
}

/**
 * Displays today's PII detection statistics in a compact format.
 * @param props - Component props
 * @returns React element with stats display
 */
function QuickStats({ stats, loading }: QuickStatsProps) {
  const totalDetected = Object.values(stats.piiDetected).reduce(
    (sum, n) => sum + n,
    0
  )

  if (loading) {
    return (
      <div className="py-3 text-center text-xs text-[var(--text-muted)]">Loading...</div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-2 py-2">
      <StatCard value={stats.messagesScanned} label="Scanned" />
      <StatCard value={totalDetected} label="PII Detected" variant="danger" />
    </div>
  )
}

export default QuickStats
