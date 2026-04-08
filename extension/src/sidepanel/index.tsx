/**
 * Side panel entry point.
 * Tabbed interface with Settings, Stats, Audit Log, Feedback, and Sharing views.
 * Architecture layer: UI (side panel)
 */

import "~src/style.css"

import { useEffect, useState } from "react"

import AuditLogTab from "./AuditLogTab"
import FeedbackTab from "./FeedbackTab"
import SettingsTab from "./SettingsTab"
import StatsTab from "./StatsTab"
import { ReportBugButton } from "~src/components/ReportBugDialog"
import { CircuitBackground } from "~src/components/ui/CircuitBackground"
import { ShieldIcon } from "~src/components/ui/ShieldIcon"
import { PRO_BUILD } from "~src/shared/build-flags"
import TelemetryTransparency from "./TelemetryTransparency-port"
import { trackSessionStart } from "~src/services/analytics-port"

type TabId = "settings" | "stats" | "feedback" | "audit" | "sharing"

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "settings", label: "Settings" },
  { id: "stats", label: "Stats" },
  { id: "feedback", label: "Feedback" },
  { id: "audit", label: "Audit Log" },
  ...(PRO_BUILD ? [{ id: "sharing" as TabId, label: "What We Share" }] : []),
]

/**
 * Main side panel component with tabbed navigation.
 */
function SidePanel() {
  const [activeTab, setActiveTab] = useState<TabId>("settings")

  useEffect(() => {
    if (PRO_BUILD) {
      void trackSessionStart("sidepanel");
    }
  }, [])

  return (
    <div className="relative min-h-screen bg-void">
      <CircuitBackground variant="sidepanel" />
      <div className="relative z-10">
        {/* Header */}
        <div className="px-4 pt-4 pb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldIcon size={28} animate />
            <h1
              className="text-base font-sans font-extrabold tracking-tight"
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
          <ReportBugButton className="text-[10px]" />
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-white/[0.06] px-4">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-2 px-3 font-mono text-[11px] font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-cyber text-cyber"
                  : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="p-4">
          {activeTab === "settings" && <SettingsTab />}
          {activeTab === "stats" && <StatsTab />}
          {activeTab === "feedback" && <FeedbackTab />}
          {activeTab === "audit" && <AuditLogTab />}
          {PRO_BUILD && activeTab === "sharing" && <TelemetryTransparency />}
        </div>

        {/* Branded footer */}
        <div className="px-4 pb-4 pt-2 border-t border-white/[0.04]">
          <div className="flex items-center justify-center gap-1.5">
            <ShieldIcon size={14} />
            <span
              className="text-[10px] font-sans font-semibold"
              style={{
                background: "linear-gradient(135deg, #00e5a0, #ffb347)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              PromptGnome
            </span>
            <span className="text-[9px] font-mono text-[var(--text-muted)]">
              — Your AI privacy shield
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SidePanel
