/**
 * Live PII detection demo for the onboarding flow.
 * Runs a real scan via the background service worker, falling back to
 * static matches if the background is unavailable.
 * Architecture layer: UI (presentation component)
 */

import { useEffect } from "react"

import type { PIIMatch } from "~src/detection/types"
import { useDetection } from "~src/hooks/useDetection"
import { summarizeDetections } from "~src/detection/confidence"

import PIIHighlight from "./PIIHighlight"

const DEMO_TEXT =
  "Hi, my name is Jane Testperson, my email is jane@example.com and my SSN is 123-45-6789. Please call me at (555) 234-5678."

/** Static fallback matches when the background service is unavailable */
const FALLBACK_MATCHES: PIIMatch[] = [
  {
    type: "EMAIL",
    value: "jane@example.com",
    start: DEMO_TEXT.indexOf("jane@example.com"),
    end: DEMO_TEXT.indexOf("jane@example.com") + "jane@example.com".length,
    confidence: 0.95,
    source: "regex"
  },
  {
    type: "SSN",
    value: "123-45-6789",
    start: DEMO_TEXT.indexOf("123-45-6789"),
    end: DEMO_TEXT.indexOf("123-45-6789") + "123-45-6789".length,
    confidence: 0.97,
    source: "regex"
  },
  {
    type: "PHONE_US",
    value: "(555) 234-5678",
    start: DEMO_TEXT.indexOf("(555) 234-5678"),
    end: DEMO_TEXT.indexOf("(555) 234-5678") + "(555) 234-5678".length,
    confidence: 0.90,
    source: "regex"
  }
]

/**
 * Displays a demo message with PII highlighted using live detection.
 * Falls back to static matches when the background service worker
 * is unavailable (e.g. during development or unit tests).
 * @returns React element with demo PII highlight
 */
function PIIDemo() {
  const { matches, scan, loading } = useDetection()

  useEffect(() => {
    void scan(DEMO_TEXT, "DEMO")
  }, [scan])

  const displayMatches = matches.length > 0 ? matches : FALLBACK_MATCHES
  const summary = summarizeDetections(displayMatches)

  return (
    <div className="bg-cyber/[0.02] rounded-lg p-4 border border-cyber-soft">
      <div className="font-mono text-[9px] font-medium text-cyber-dim mb-2 uppercase tracking-widest">
        {loading ? "Scanning..." : "Live Detection Demo"}
      </div>
      <div className="text-sm leading-relaxed">
        <PIIHighlight text={DEMO_TEXT} matches={displayMatches} />
      </div>
      <div className="mt-3 font-mono text-[10px] text-[var(--text-muted)]">
        {summary}
      </div>
    </div>
  )
}

export default PIIDemo
