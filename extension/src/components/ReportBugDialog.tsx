/**
 * Quick bug-report dialog.
 * Captures a one-line title + description and opens a prefilled GitHub issue
 * in a new tab. Used by the popup, side panel, and the on-page CSUI button.
 * Architecture layer: UI (shared component)
 */

import { useCallback, useEffect, useRef, useState } from "react"

import {
  buildBugReportUrl,
  collectBugReportContext,
  type BugReportKind,
} from "~src/utils/bug-report"

/** Props for {@link ReportBugDialog}. */
interface ReportBugDialogProps {
  /** Whether the dialog is visible. */
  open: boolean
  /** Called when the user dismisses the dialog. */
  onClose: () => void
  /** Optional provider hostname to attach to the report. */
  providerHost?: string
}

/**
 * Modal-style dialog rendered inline by its parent. The parent controls
 * visibility via the `open` prop.
 */
export function ReportBugDialog({ open, onClose, providerHost }: ReportBugDialogProps) {
  const [kind, setKind] = useState<BugReportKind>("bug")
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setKind("bug")
      setTitle("")
      setDescription("")
      // Defer focus until after the element renders.
      setTimeout(() => titleRef.current?.focus(), 0)
    }
  }, [open])

  const handleSubmit = useCallback(() => {
    // Title is only required for public bug reports. Security reports route
    // straight to GitHub's private advisory form, where users fill in details.
    if (kind === "bug" && !title.trim()) {
      titleRef.current?.focus()
      return
    }
    const url = buildBugReportUrl(
      { kind, title, description, providerHost },
      collectBugReportContext()
    )
    try {
      window.open(url, "_blank", "noopener,noreferrer")
    } catch {
      // Best effort — popup blockers will surface their own UI.
    }
    onClose()
  }, [kind, title, description, providerHost, onClose])

  const isSecurity = kind === "security"

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}>
      <div
        className="w-[320px] max-w-[90vw] rounded-xl border border-white/[0.08] bg-void p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-sans text-sm font-bold text-[var(--text-primary)]">
            Report an issue
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            ×
          </button>
        </div>

        <div
          className="mb-3 grid grid-cols-2 gap-1 rounded-md border border-white/[0.08] bg-white/[0.02] p-1"
          role="tablist"
          aria-label="Report type">
          <button
            type="button"
            role="tab"
            aria-selected={!isSecurity}
            onClick={() => setKind("bug")}
            className={`rounded px-2 py-1 font-sans text-[11px] font-semibold transition-colors ${
              !isSecurity
                ? "bg-cyber text-void"
                : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            }`}>
            General bug
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={isSecurity}
            onClick={() => setKind("security")}
            className={`rounded px-2 py-1 font-sans text-[11px] font-semibold transition-colors ${
              isSecurity
                ? "bg-cyber text-void"
                : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            }`}>
            Security issue
          </button>
        </div>

        {isSecurity ? (
          <p className="mb-3 font-mono text-[10px] leading-snug text-[var(--text-muted)]">
            Security reports are filed privately through GitHub's vulnerability
            reporting form. Only the maintainers can read them. Clicking
            continue will open the private form in a new tab — please do not
            share security details in public issues.
          </p>
        ) : (
          <p className="mb-3 font-mono text-[10px] leading-snug text-[var(--text-muted)]">
            Opens the public GitHub bug-report template in a new tab with your
            details prefilled. No logs or message contents are attached.
          </p>
        )}

        {!isSecurity && (
          <>
            <label className="mb-2 block">
              <span className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                Title
              </span>
              <input
                ref={titleRef}
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Short summary"
                maxLength={120}
                className="w-full rounded-md border border-white/[0.08] bg-white/[0.04] px-2 py-1.5 font-sans text-xs text-[var(--text-primary)] focus:border-cyber focus:outline-none"
              />
            </label>

            <label className="mb-3 block">
              <span className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                What happened?
              </span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Steps to reproduce, expected vs actual..."
                rows={4}
                maxLength={2000}
                className="w-full resize-none rounded-md border border-white/[0.08] bg-white/[0.04] px-2 py-1.5 font-sans text-xs text-[var(--text-primary)] focus:border-cyber focus:outline-none"
              />
            </label>
          </>
        )}

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 font-sans text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!isSecurity && !title.trim()}
            className="rounded-md bg-cyber px-3 py-1.5 font-sans text-xs font-semibold text-void disabled:opacity-40">
            {isSecurity ? "Open private form" : "Open in GitHub"}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Compact "Report a bug" trigger that opens {@link ReportBugDialog}. */
export function ReportBugButton({
  className = "",
  providerHost,
}: {
  className?: string
  providerHost?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`font-mono text-[10px] text-[var(--text-muted)] hover:text-cyber transition-colors ${className}`.trim()}>
        Report an issue
      </button>
      <ReportBugDialog
        open={open}
        onClose={() => setOpen(false)}
        providerHost={providerHost}
      />
    </>
  )
}
