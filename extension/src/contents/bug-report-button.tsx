/**
 * Floating "Report a bug" button injected on AI provider pages.
 * Lives bottom-right where toast notifications usually appear, opens the
 * shared ReportBugDialog, and ultimately routes the user to a prefilled
 * GitHub issue. No data is transmitted from the extension itself.
 * Architecture layer: UI (content script CSUI)
 */

import type { PlasmoCSConfig, PlasmoGetRootContainer } from "plasmo"
import { useState } from "react"

import cssText from "data-text:../content-style.css"

import { ReportBugDialog } from "~src/components/ReportBugDialog"

export const config: PlasmoCSConfig = {
  matches: [
    "https://chatgpt.com/*",
    "https://chat.openai.com/*",
    "https://claude.ai/*",
    "https://gemini.google.com/*",
    "https://chat.deepseek.com/*",
    "https://www.perplexity.ai/*",
    "https://grok.com/*",
    "https://copilot.microsoft.com/*",
    "https://www.meta.ai/*",
  ],
  run_at: "document_idle",
}

/** Inject the Tailwind/design-token CSS into the shadow DOM. */
export const getStyle = () => {
  const style = document.createElement("style")
  style.textContent = cssText
  return style
}

/** Mount inside an isolated shadow DOM container. */
export const getRootContainer: PlasmoGetRootContainer = () => {
  const host = document.createElement("div")
  host.id = "promptgnome-bug-report-host"
  document.body.appendChild(host)
  const shadow = host.attachShadow({ mode: "open" })
  const root = document.createElement("div")
  shadow.appendChild(root)
  // Plasmo expects getStyle's <style> to be appended to the same shadow root.
  shadow.appendChild(getStyle())
  return root
}

/** Floating launcher rendered bottom-right on AI provider pages. */
function BugReportFloatingButton() {
  const [open, setOpen] = useState(false)
  const providerHost =
    typeof location !== "undefined" ? location.hostname : undefined

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Report a PromptGnome issue"
        aria-label="Report a PromptGnome issue"
        className="fixed bottom-4 right-4 z-[2147483646] rounded-full border border-white/[0.1] bg-void/90 px-3 py-2 font-mono text-[11px] font-semibold text-cyber shadow-lg backdrop-blur-md hover:bg-void hover:text-[var(--text-primary)] transition-colors">
        Report issue
      </button>
      <ReportBugDialog
        open={open}
        onClose={() => setOpen(false)}
        providerHost={providerHost}
      />
    </>
  )
}

export default BugReportFloatingButton
