/**
 * PII warning panel component — floating panel with gradient borders, glow
 * effects, and smooth animations. Shows detected PII items with colored type
 * tags, message preview, action buttons, and a close button. Includes a
 * semi-transparent backdrop; clicking outside or pressing the close button
 * triggers the configurable dismiss behavior.
 * Architecture layer: UI (composite component)
 */

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react"

import type { PIIMatch } from "~src/detection/types"
import { PII_TYPES } from "~src/shared/constants"

import PIIHighlight from "./PIIHighlight"

interface MissedPIIReportDraft {
  entityType: string
  description: string
}

/** Props for the PIIWarning component */
interface PIIWarningProps {
  /** Original message text containing PII */
  text: string
  /** Array of detected PII matches */
  matches: PIIMatch[]
  /** Called when user chooses to send the message */
  onSendAnyway: () => void
  /** Called when user chooses to edit the message */
  onEditMessage: () => void
  /** Called when user chooses to auto-anonymize */
  onAutoAnonymize: () => void
  /** Called when the user confirms or rejects a specific detection. */
  onRecordFeedback?: (match: PIIMatch, correct: boolean) => Promise<boolean>
  /** Called when the user reports PII that the detector missed. */
  onReportMissedPII?: (report: MissedPIIReportDraft) => Promise<boolean>
  /** Whether the user has a Pro subscription */
  isProUser?: boolean
  /** Called to dismiss the overlay (close button / outside click) */
  onDismiss: () => void
  /** Optional file name when warning originates from a file scan */
  fileName?: string
  /** What happens on dismiss: "block" blocks the message, "send" sends it. */
  dismissBehavior?: "block" | "send"
}

/** Demo-matching color map for PII type tags in the warning panel. */
const TAG_COLORS: Record<string, { bg: string; text: string }> = {
  EMAIL: { bg: "rgba(99, 102, 241, 0.15)", text: "#818cf8" },
  SSN: { bg: "rgba(255, 107, 107, 0.15)", text: "#ff6b6b" },
  CREDIT_CARD: { bg: "rgba(255, 107, 107, 0.15)", text: "#ff6b6b" },
  PHONE_US: { bg: "rgba(251, 191, 36, 0.15)", text: "#fbbf24" },
  PHONE_INTL: { bg: "rgba(251, 191, 36, 0.15)", text: "#fbbf24" },
  IPV4: { bg: "rgba(100, 181, 246, 0.15)", text: "#64b5f6" },
  IPV6: { bg: "rgba(100, 181, 246, 0.15)", text: "#64b5f6" },
  AWS_ACCESS_KEY: { bg: "rgba(255, 87, 34, 0.15)", text: "#ff5722" },
  AWS_SECRET_KEY: { bg: "rgba(255, 87, 34, 0.15)", text: "#ff5722" },
  GITHUB_TOKEN: { bg: "rgba(255, 87, 34, 0.15)", text: "#ff5722" },
  STRIPE_KEY: { bg: "rgba(255, 87, 34, 0.15)", text: "#ff5722" },
  GENERIC_API_KEY: { bg: "rgba(255, 87, 34, 0.15)", text: "#ff5722" },
  OPENAI_KEY: { bg: "rgba(255, 87, 34, 0.15)", text: "#ff5722" },
  ANTHROPIC_KEY: { bg: "rgba(255, 87, 34, 0.15)", text: "#ff5722" },
  GOOGLE_AI_KEY: { bg: "rgba(255, 87, 34, 0.15)", text: "#ff5722" },
  SLACK_TOKEN: { bg: "rgba(255, 87, 34, 0.15)", text: "#ff5722" },
  PRIVATE_KEY: { bg: "rgba(255, 87, 34, 0.15)", text: "#ff5722" },
  JWT_TOKEN: { bg: "rgba(255, 87, 34, 0.15)", text: "#ff5722" },
  IBAN: { bg: "rgba(255, 165, 0, 0.15)", text: "#ffa500" },
  PASSPORT_US: { bg: "rgba(255, 165, 0, 0.15)", text: "#ffa500" },
  DRIVERS_LICENSE: { bg: "rgba(255, 165, 0, 0.15)", text: "#ffa500" },
  ZIP_CODE: { bg: "rgba(100, 181, 246, 0.15)", text: "#64b5f6" },
  DATE_OF_BIRTH: { bg: "rgba(255, 165, 0, 0.15)", text: "#ffa500" },
  STREET_ADDRESS: { bg: "rgba(100, 181, 246, 0.15)", text: "#64b5f6" },
  PERSON_NAME: { bg: "rgba(171, 71, 188, 0.15)", text: "#ab47bc" },
  ORGANIZATION: { bg: "rgba(171, 71, 188, 0.15)", text: "#ab47bc" },
  LOCATION: { bg: "rgba(100, 181, 246, 0.15)", text: "#64b5f6" },
  MEDICAL_TERM: { bg: "rgba(244, 67, 54, 0.15)", text: "#f44336" },
}

const DEFAULT_TAG_COLOR = { bg: "rgba(158, 158, 158, 0.15)", text: "#9e9e9e" }

function getTagColor(type: string): { bg: string; text: string } {
  return TAG_COLORS[type] ?? DEFAULT_TAG_COLOR
}

function getTagLabel(type: string): string {
  const labels: Record<string, string> = {
    EMAIL: "EMAIL",
    SSN: "SSN",
    CREDIT_CARD: "CARD",
    PHONE_US: "PHONE",
    PHONE_INTL: "PHONE",
    IPV4: "IP",
    IPV6: "IP",
    AWS_ACCESS_KEY: "API KEY",
    AWS_SECRET_KEY: "API KEY",
    GITHUB_TOKEN: "TOKEN",
    STRIPE_KEY: "API KEY",
    GENERIC_API_KEY: "API KEY",
    OPENAI_KEY: "API KEY",
    ANTHROPIC_KEY: "API KEY",
    GOOGLE_AI_KEY: "API KEY",
    SLACK_TOKEN: "TOKEN",
    PRIVATE_KEY: "KEY",
    JWT_TOKEN: "TOKEN",
    IBAN: "IBAN",
    PASSPORT_US: "PASSPORT",
    DRIVERS_LICENSE: "LICENSE",
    ZIP_CODE: "ZIP",
    DATE_OF_BIRTH: "DOB",
    STREET_ADDRESS: "ADDRESS",
    PERSON_NAME: "NAME",
    ORGANIZATION: "ORG",
    LOCATION: "LOCATION",
    MEDICAL_TERM: "MEDICAL",
  }
  return labels[type] ?? type
}

/**
 * PII warning panel with gradient glow, backdrop, close button, and animations.
 * @param props - Component props
 * @returns React element showing the warning panel
 */
function PIIWarning({
  text,
  matches,
  onSendAnyway,
  onEditMessage,
  onAutoAnonymize,
  onRecordFeedback,
  onReportMissedPII,
  isProUser: _isProUser = false,
  onDismiss,
  fileName,
  dismissBehavior = "block",
}: PIIWarningProps) {
  const [feedbackExpanded, setFeedbackExpanded] = useState(false)
  const [feedbackVotes, setFeedbackVotes] = useState<Record<string, "correct" | "incorrect">>({})
  const [reportOpen, setReportOpen] = useState(false)
  const [reportStatus, setReportStatus] = useState<"idle" | "saved" | "error">("idle")
  const [reportDraft, setReportDraft] = useState<MissedPIIReportDraft>({
    entityType: "EMAIL",
    description: ""
  })
  const [exiting, setExiting] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setFeedbackVotes({})
    setFeedbackExpanded(false)
    setReportOpen(false)
    setReportStatus("idle")
    setReportDraft({ entityType: "EMAIL", description: "" })
    setExiting(false)
  }, [text, matches])

  // Focus first focusable element on mount
  useEffect(() => {
    const el = dialogRef.current?.querySelector<HTMLElement>("button, [tabindex]")
    el?.focus()
  }, [])

  /** Triggers exit animation then calls appropriate handler. */
  const handleClose = useCallback(() => {
    setExiting(true)
    setTimeout(() => {
      if (dismissBehavior === "send") {
        onSendAnyway()
      } else {
        onDismiss()
      }
    }, 200)
  }, [dismissBehavior, onDismiss, onSendAnyway])

  // Escape key dismisses
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose()
    }
    document.addEventListener("keydown", handleKey)
    return () => document.removeEventListener("keydown", handleKey)
  }, [handleClose])

  /** Clicking the backdrop (outside the panel) triggers close. */
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        handleClose()
      }
    },
    [handleClose],
  )

  async function handleFeedback(
    key: string,
    match: PIIMatch,
    correct: boolean
  ): Promise<void> {
    if (!onRecordFeedback) return
    const saved = await onRecordFeedback(match, correct)
    if (saved) {
      setFeedbackVotes((current) => ({
        ...current,
        [key]: correct ? "correct" : "incorrect"
      }))
    }
  }

  async function handleReportSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (!onReportMissedPII) return

    const description = reportDraft.description.trim()
    if (description.length < 4) {
      setReportStatus("error")
      return
    }

    const saved = await onReportMissedPII({
      entityType: reportDraft.entityType,
      description
    })

    if (saved) {
      setReportDraft({ entityType: "EMAIL", description: "" })
      setReportStatus("saved")
      setReportOpen(false)
    } else {
      setReportStatus("error")
    }
  }

  // Deduplicated PII items for the warning list
  const uniqueItems: Array<{ type: string; value: string }> = []
  const seenValues = new Set<string>()
  for (const match of matches) {
    const key = `${match.type}:${match.value}`
    if (!seenValues.has(key)) {
      seenValues.add(key)
      uniqueItems.push({ type: match.type, value: match.value })
    }
  }

  const reportTypeInputId = "pii-warning-missed-type"
  const reportDescriptionInputId = "pii-warning-missed-description"

  return (
    <>
      {/* Backdrop — click outside to dismiss */}
      <div
        onClick={handleBackdropClick}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 2147483646,
          background: "radial-gradient(ellipse at center bottom, rgba(255, 179, 71, 0.04) 0%, rgba(0, 0, 0, 0.55) 100%)",
          backdropFilter: "blur(3px)",
          WebkitBackdropFilter: "blur(3px)",
          pointerEvents: "auto",
          animation: exiting ? "backdrop-exit 0.2s ease-out forwards" : "backdrop-enter 0.3s ease-out forwards",
        }}
      />

      {/* Main panel container */}
      <div
        style={{
          position: "fixed",
          bottom: "80px",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 2147483647,
          pointerEvents: "auto",
          width: "100%",
          maxWidth: "480px",
          maxHeight: "calc(100vh - 120px)",
          padding: "0 16px",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          animation: exiting ? "modal-exit 0.2s ease-out forwards" : "modal-enter 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        }}
      >
        {/* Gradient border wrapper */}
        <div
          style={{
            borderRadius: "18px",
            padding: "1px",
            background: "linear-gradient(135deg, rgba(255, 179, 71, 0.4), rgba(0, 229, 160, 0.2), rgba(99, 102, 241, 0.3), rgba(255, 179, 71, 0.4))",
            backgroundSize: "300% 300%",
            animation: "gradient-border-rotate 6s ease infinite, warning-glow-pulse 3s ease-in-out infinite",
            boxShadow: "0 0 24px rgba(255, 179, 71, 0.1), 0 8px 32px rgba(0, 0, 0, 0.4)",
          }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="shield-title"
            aria-describedby="shield-desc"
            style={{
              background: "linear-gradient(180deg, rgba(14, 18, 30, 0.97) 0%, rgba(10, 14, 24, 0.98) 100%)",
              borderRadius: "17px",
              padding: "20px",
              fontFamily: "'DM Sans', system-ui, sans-serif",
              overflowY: "auto",
              overflowX: "hidden",
              maxHeight: "calc(100vh - 160px)",
            }}
          >
            {/* Header — warning icon + title + close button */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
              {/* Glowing warning icon */}
              <div
                style={{
                  width: "34px",
                  height: "34px",
                  borderRadius: "10px",
                  background: "linear-gradient(135deg, rgba(255, 179, 71, 0.2), rgba(255, 107, 107, 0.1))",
                  display: "grid",
                  placeItems: "center",
                  flexShrink: 0,
                  boxShadow: "0 0 16px rgba(255, 179, 71, 0.15), inset 0 0 8px rgba(255, 179, 71, 0.05)",
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M12 9v4m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"
                    stroke="#ffb347"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
              <div style={{ flex: 1 }}>
                <h2
                  id="shield-title"
                  style={{
                    fontFamily: "'Bricolage Grotesque', 'DM Sans', system-ui, sans-serif",
                    fontWeight: 700,
                    fontSize: "1rem",
                    background: "linear-gradient(135deg, #ffb347, #ff6b6b)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    margin: 0,
                    lineHeight: 1.3,
                  }}
                >
                  Sensitive information detected
                </h2>
                <p
                  id="shield-desc"
                  style={{
                    fontSize: "0.78rem",
                    color: "#8a94a8",
                    margin: "2px 0 0",
                    lineHeight: 1.3,
                  }}
                >
                  {matches.length} item{matches.length !== 1 ? "s" : ""} found in your message
                </p>
              </div>

              {/* Close button */}
              <button
                type="button"
                onClick={handleClose}
                aria-label="Close warning"
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "8px",
                  border: "1px solid rgba(255, 107, 107, 0.2)",
                  background: "rgba(255, 107, 107, 0.06)",
                  color: "#ff6b6b",
                  cursor: "pointer",
                  display: "grid",
                  placeItems: "center",
                  flexShrink: 0,
                  transition: "all 0.2s ease",
                  padding: 0,
                }}
                onMouseEnter={(e) => {
                  const btn = e.currentTarget
                  btn.style.background = "rgba(255, 107, 107, 0.15)"
                  btn.style.borderColor = "rgba(255, 107, 107, 0.4)"
                  btn.style.boxShadow = "0 0 12px rgba(255, 107, 107, 0.2)"
                  btn.style.transform = "scale(1.05)"
                }}
                onMouseLeave={(e) => {
                  const btn = e.currentTarget
                  btn.style.background = "rgba(255, 107, 107, 0.06)"
                  btn.style.borderColor = "rgba(255, 107, 107, 0.2)"
                  btn.style.boxShadow = "none"
                  btn.style.transform = "scale(1)"
                }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {/* File name if applicable */}
            {fileName ? (
              <div style={{ fontSize: "0.85rem", color: "#8a94a8", marginBottom: "10px" }}>
                <span style={{ fontWeight: 500 }}>File:</span> {fileName}
              </div>
            ) : null}

            {/* Detected PII items list */}
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "16px", maxHeight: "200px", overflowY: "auto", paddingRight: uniqueItems.length > 4 ? "4px" : undefined }}>
              {uniqueItems.map((item, idx) => {
                const tagColor = getTagColor(item.type)
                return (
                  <div
                    key={`${item.type}-${idx}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      padding: "10px 14px",
                      borderRadius: "10px",
                      background: "linear-gradient(135deg, rgba(255, 255, 255, 0.03), rgba(255, 255, 255, 0.01))",
                      border: "1px solid rgba(255, 255, 255, 0.04)",
                      fontSize: "0.88rem",
                      transition: "all 0.2s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "linear-gradient(135deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.02))"
                      e.currentTarget.style.borderColor = "rgba(255, 179, 71, 0.12)"
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "linear-gradient(135deg, rgba(255, 255, 255, 0.03), rgba(255, 255, 255, 0.01))"
                      e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.04)"
                    }}
                  >
                    <span
                      style={{
                        padding: "3px 8px",
                        borderRadius: "6px",
                        fontSize: "0.72rem",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        background: tagColor.bg,
                        color: tagColor.text,
                        whiteSpace: "nowrap",
                        flexShrink: 0,
                      }}
                    >
                      {getTagLabel(item.type)}
                    </span>
                    <span
                      style={{
                        color: "#e8edf5",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {item.value}
                    </span>
                  </div>
                )
              })}
            </div>

            {/* Collapsible message preview */}
            {!fileName && uniqueItems.length < matches.length && (
              <div style={{ marginBottom: "14px" }}>
                <div
                  style={{
                    borderRadius: "10px",
                    padding: "12px 14px",
                    maxHeight: "120px",
                    overflowY: "auto",
                    background: "rgba(255, 255, 255, 0.03)",
                    border: "1px solid rgba(255, 255, 255, 0.04)",
                    fontSize: "0.82rem",
                    lineHeight: 1.6,
                  }}
                >
                  <PIIHighlight text={text} matches={matches} />
                </div>
              </div>
            )}

            {/* Action buttons with glow effects */}
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                onClick={onEditMessage}
                style={{
                  flex: 1,
                  padding: "10px 16px",
                  borderRadius: "10px",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  background: "linear-gradient(135deg, rgba(0, 229, 160, 0.12), rgba(0, 229, 160, 0.06))",
                  border: "1px solid rgba(0, 229, 160, 0.25)",
                  color: "#00e5a0",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  transition: "all 0.25s ease",
                  boxShadow: "0 0 0 rgba(0, 229, 160, 0)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "linear-gradient(135deg, rgba(0, 229, 160, 0.2), rgba(0, 229, 160, 0.1))"
                  e.currentTarget.style.boxShadow = "0 0 20px rgba(0, 229, 160, 0.15)"
                  e.currentTarget.style.borderColor = "rgba(0, 229, 160, 0.4)"
                  e.currentTarget.style.transform = "translateY(-1px)"
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "linear-gradient(135deg, rgba(0, 229, 160, 0.12), rgba(0, 229, 160, 0.06))"
                  e.currentTarget.style.boxShadow = "0 0 0 rgba(0, 229, 160, 0)"
                  e.currentTarget.style.borderColor = "rgba(0, 229, 160, 0.25)"
                  e.currentTarget.style.transform = "translateY(0)"
                }}
              >
                Edit Message
              </button>
              <button
                type="button"
                onClick={onAutoAnonymize}
                style={{
                  flex: 1,
                  padding: "10px 16px",
                  borderRadius: "10px",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  background: "linear-gradient(135deg, rgba(99, 102, 241, 0.12), rgba(99, 102, 241, 0.06))",
                  border: "1px solid rgba(99, 102, 241, 0.25)",
                  color: "#818cf8",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  transition: "all 0.25s ease",
                  boxShadow: "0 0 0 rgba(99, 102, 241, 0)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(99, 102, 241, 0.1))"
                  e.currentTarget.style.boxShadow = "0 0 20px rgba(99, 102, 241, 0.15)"
                  e.currentTarget.style.borderColor = "rgba(99, 102, 241, 0.4)"
                  e.currentTarget.style.transform = "translateY(-1px)"
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "linear-gradient(135deg, rgba(99, 102, 241, 0.12), rgba(99, 102, 241, 0.06))"
                  e.currentTarget.style.boxShadow = "0 0 0 rgba(99, 102, 241, 0)"
                  e.currentTarget.style.borderColor = "rgba(99, 102, 241, 0.25)"
                  e.currentTarget.style.transform = "translateY(0)"
                }}
              >
                Auto-Anonymize
              </button>
              <button
                type="button"
                onClick={onSendAnyway}
                style={{
                  flex: 1,
                  padding: "10px 16px",
                  borderRadius: "10px",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  background: "rgba(255, 255, 255, 0.04)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  color: "#8a94a8",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  transition: "all 0.25s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(255, 255, 255, 0.08)"
                  e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.15)"
                  e.currentTarget.style.color = "#c8d6e0"
                  e.currentTarget.style.transform = "translateY(-1px)"
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(255, 255, 255, 0.04)"
                  e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.08)"
                  e.currentTarget.style.color = "#8a94a8"
                  e.currentTarget.style.transform = "translateY(0)"
                }}
              >
                Send Anyway
              </button>
            </div>

            {/* Dismiss hint */}
            <div style={{
              marginTop: "10px",
              textAlign: "center",
              fontSize: "0.68rem",
              fontFamily: "'JetBrains Mono', monospace",
              color: "#5a6478",
              letterSpacing: "0.03em",
            }}>
              {dismissBehavior === "send"
                ? "Close or click outside to send anyway"
                : "Close or click outside to block sending"}
              {" "}&middot; Press <kbd style={{
                padding: "1px 5px",
                borderRadius: "4px",
                background: "rgba(255, 255, 255, 0.06)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                fontSize: "0.65rem",
              }}>Esc</kbd>
            </div>

            {/* Collapsible feedback section */}
            <div style={{ marginTop: "10px", borderTop: "1px solid rgba(255, 179, 71, 0.08)", paddingTop: "8px" }}>
              <button
                type="button"
                onClick={() => setFeedbackExpanded((v) => !v)}
                style={{
                  width: "100%",
                  padding: "6px 0",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: "0.65rem",
                  color: "#8a94a8",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                <span>Detection feedback</span>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  style={{
                    transition: "transform 0.2s",
                    transform: feedbackExpanded ? "rotate(180deg)" : "none",
                  }}
                >
                  <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>

              {feedbackExpanded && (
                <div style={{ paddingTop: "8px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", marginBottom: "10px" }}>
                    <p style={{ fontSize: "0.72rem", color: "#8a94a8", margin: 0, fontFamily: "'DM Sans', system-ui, sans-serif" }}>
                      Feedback stays local and helps tune the detector.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setReportOpen((current) => !current)
                        setReportStatus("idle")
                      }}
                      style={{
                        flexShrink: 0,
                        fontSize: "0.68rem",
                        fontFamily: "'JetBrains Mono', monospace",
                        fontWeight: 500,
                        color: "#00e5a0",
                        border: "1px solid rgba(0, 229, 160, 0.2)",
                        background: "rgba(0, 229, 160, 0.08)",
                        borderRadius: "6px",
                        padding: "4px 10px",
                        cursor: "pointer",
                      }}
                    >
                      Report missed PII
                    </button>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    {matches.map((match, index) => {
                      const key = `${match.type}:${match.start}:${match.end}:${index}`
                      const vote = feedbackVotes[key]
                      const label = PII_TYPES[match.type as keyof typeof PII_TYPES]?.label ?? match.type

                      return (
                        <div
                          key={key}
                          style={{
                            borderRadius: "8px",
                            border: "1px solid rgba(255, 255, 255, 0.06)",
                            background: "rgba(255, 255, 255, 0.02)",
                            padding: "8px 10px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: "8px",
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.08em", color: "#8a94a8" }}>
                              {label}
                            </div>
                            <div style={{ fontSize: "0.78rem", color: "#8a94a8", wordBreak: "break-all", marginTop: "2px" }}>
                              {match.value}
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: "4px", flexShrink: 0 }}>
                            <button
                              type="button"
                              onClick={() => void handleFeedback(key, match, true)}
                              style={{
                                borderRadius: "5px",
                                padding: "3px 8px",
                                fontSize: "0.68rem",
                                fontFamily: "'JetBrains Mono', monospace",
                                border: "none",
                                cursor: "pointer",
                                background: vote === "correct" ? "rgba(34, 197, 94, 0.1)" : "rgba(255, 255, 255, 0.06)",
                                color: vote === "correct" ? "#4ade80" : "#8a94a8",
                              }}
                            >
                              Correct
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleFeedback(key, match, false)}
                              style={{
                                borderRadius: "5px",
                                padding: "3px 8px",
                                fontSize: "0.68rem",
                                fontFamily: "'JetBrains Mono', monospace",
                                border: "none",
                                cursor: "pointer",
                                background: vote === "incorrect" ? "rgba(255, 107, 107, 0.1)" : "rgba(255, 255, 255, 0.06)",
                                color: vote === "incorrect" ? "#ff6b6b" : "#8a94a8",
                              }}
                            >
                              False Positive
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {reportOpen && (
                    <form
                      style={{
                        marginTop: "10px",
                        borderRadius: "8px",
                        border: "1px solid rgba(0, 229, 160, 0.15)",
                        background: "rgba(0, 229, 160, 0.02)",
                        padding: "10px",
                      }}
                      onSubmit={(event) => void handleReportSubmit(event)}
                    >
                      <div style={{ marginBottom: "8px" }}>
                        <label
                          htmlFor={reportTypeInputId}
                          style={{ display: "block", fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.08em", color: "#8a94a8", marginBottom: "4px" }}
                        >
                          Missed PII type
                        </label>
                        <select
                          id={reportTypeInputId}
                          value={reportDraft.entityType}
                          onChange={(event) =>
                            setReportDraft((current) => ({
                              ...current,
                              entityType: event.target.value
                            }))
                          }
                          style={{
                            width: "100%",
                            borderRadius: "6px",
                            border: "1px solid rgba(0, 229, 160, 0.3)",
                            background: "rgba(0, 229, 160, 0.06)",
                            padding: "6px 8px",
                            fontSize: "0.78rem",
                            color: "#e8edf5",
                            fontFamily: "'DM Sans', system-ui, sans-serif",
                          }}
                        >
                          {Object.entries(PII_TYPES)
                            .filter(([, type]) => type.tier === "free")
                            .map(([type, descriptor]) => (
                              <option key={type} value={type}>
                                {descriptor.label}
                              </option>
                            ))}
                        </select>
                      </div>

                      <div style={{ marginBottom: "8px" }}>
                        <label
                          htmlFor={reportDescriptionInputId}
                          style={{ display: "block", fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.08em", color: "#8a94a8", marginBottom: "4px" }}
                        >
                          Describe the missed format
                        </label>
                        <textarea
                          id={reportDescriptionInputId}
                          value={reportDraft.description}
                          onChange={(event) =>
                            setReportDraft((current) => ({
                              ...current,
                              description: event.target.value
                            }))
                          }
                          placeholder="Example: phone number in XXX.XXX.XXXX format."
                          rows={2}
                          style={{
                            width: "100%",
                            borderRadius: "6px",
                            border: "1px solid rgba(0, 229, 160, 0.3)",
                            background: "rgba(0, 229, 160, 0.06)",
                            padding: "6px 8px",
                            fontSize: "0.78rem",
                            color: "#e8edf5",
                            fontFamily: "'DM Sans', system-ui, sans-serif",
                            resize: "none",
                          }}
                        />
                      </div>

                      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "6px" }}>
                        <button
                          type="button"
                          onClick={() => {
                            setReportOpen(false)
                            setReportStatus("idle")
                          }}
                          style={{
                            borderRadius: "5px",
                            padding: "4px 10px",
                            fontSize: "0.68rem",
                            fontFamily: "'JetBrains Mono', monospace",
                            color: "#8a94a8",
                            background: "rgba(255, 255, 255, 0.04)",
                            border: "1px solid rgba(255, 255, 255, 0.08)",
                            cursor: "pointer",
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          style={{
                            borderRadius: "5px",
                            padding: "4px 10px",
                            fontSize: "0.68rem",
                            fontFamily: "'JetBrains Mono', monospace",
                            color: "#00e5a0",
                            border: "1px solid rgba(0, 229, 160, 0.2)",
                            background: "rgba(0, 229, 160, 0.08)",
                            cursor: "pointer",
                          }}
                        >
                          Save Report
                        </button>
                      </div>
                    </form>
                  )}

                  {reportStatus === "saved" && (
                    <p style={{ marginTop: "6px", fontSize: "0.68rem", fontFamily: "'JetBrains Mono', monospace", color: "#4ade80" }}>
                      Missed-pattern report saved locally.
                    </p>
                  )}

                  {reportStatus === "error" && (
                    <p style={{ marginTop: "6px", fontSize: "0.68rem", fontFamily: "'JetBrains Mono', monospace", color: "#ff6b6b" }}>
                      Add a short privacy-safe description before saving.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

export default PIIWarning
