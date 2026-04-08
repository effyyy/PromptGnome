/**
 * Audit log tab for the side panel.
 * Shows filterable log of PII detection events (privacy-safe — no PII values).
 * Architecture layer: UI (side panel tab)
 */

import { useCallback, useEffect, useState } from "react"

import { getRecentLogs, clearLogs, exportLogs } from "~src/services/audit-logger"
import type { AuditLogEntry } from "~src/shared/schemas"

/**
 * Audit log tab with filterable event list and export.
 * @returns React element with audit log display
 */
function AuditLogTab() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [filter, setFilter] = useState("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getRecentLogs(1000)
      .then((entries) => setLogs(entries))
      .catch(() => { /* non-critical */ })
      .finally(() => setLoading(false))
  }, [])

  const filteredLogs = filter
    ? logs.filter(
        (l) =>
          l.provider.toLowerCase().includes(filter.toLowerCase()) ||
          l.entityType.toLowerCase().includes(filter.toLowerCase()) ||
          l.action.toLowerCase().includes(filter.toLowerCase())
      )
    : logs

  const handleExport = useCallback(() => {
    exportLogs().then((json) => {
      const blob = new Blob([json], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `pii-shield-audit-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    })
  }, [])

  const handleClear = useCallback(() => {
    clearLogs().then(() => setLogs([]))
  }, [])

  const actionBadge = (action: string) => {
    const styles: Record<string, string> = {
      warned: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
      blocked: "bg-[var(--danger-soft)] text-[var(--danger)] border border-[var(--danger)]/20",
      anonymized: "bg-cyber/10 text-cyber border border-cyber/20",
      dismissed: "bg-white/5 text-[var(--text-muted)] border border-white/10",
    }
    return styles[action] ?? "bg-white/5 text-[var(--text-muted)]"
  }

  if (loading) {
    return (
      <div className="text-center text-sm text-[var(--text-muted)] py-8">Loading...</div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Filter logs..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="flex-1 text-sm font-sans px-3 py-1.5 bg-void border border-cyber-soft rounded-md text-[var(--text-secondary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-cyber focus:ring-1 focus:ring-cyber"
        />
        <button
          onClick={handleExport}
          className="text-xs font-mono px-3 py-1.5 border border-white/[0.08] rounded-md text-[var(--text-secondary)] hover:bg-white/[0.04] transition-colors"
        >
          Export
        </button>
        <button
          onClick={handleClear}
          className="text-xs font-mono px-3 py-1.5 text-[var(--danger)] border border-[var(--danger)]/20 rounded-md hover:bg-[var(--danger-soft)] transition-colors"
        >
          Clear
        </button>
      </div>

      {/* Summary */}
      <div className="text-[10px] font-mono text-[var(--text-muted)]">
        {filteredLogs.length} event{filteredLogs.length !== 1 ? "s" : ""}
        {filter ? " (filtered)" : ""}
      </div>

      {/* Log entries */}
      {filteredLogs.length === 0 ? (
        <div className="text-center text-sm font-sans text-[var(--text-muted)] py-8">
          No audit log entries yet
        </div>
      ) : (
        <div className="space-y-0.5 max-h-96 overflow-y-auto">
          {filteredLogs
            .slice()
            .reverse()
            .map((entry, i) => (
              <div
                key={i}
                className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-cyber/[0.03] text-xs transition-colors"
              >
                <span className="font-mono text-[var(--text-muted)] w-16 shrink-0">
                  {new Date(entry.timestamp).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit"
                  })}
                </span>
                <span className="font-sans text-[var(--text-muted)] w-16 shrink-0">
                  {entry.provider}
                </span>
                <span className="font-sans text-[var(--text-secondary)] flex-1">
                  {entry.entityType.replace(/_/g, " ")}
                </span>
                <span className={`px-1.5 py-0.5 rounded font-mono text-[9px] font-medium ${actionBadge(entry.action)}`}>
                  {entry.action.replace(/_/g, " ")}
                </span>
              </div>
            ))}
        </div>
      )}
    </div>
  )
}

export default AuditLogTab
