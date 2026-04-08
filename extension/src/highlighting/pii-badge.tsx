/**
 * PIIBadge and PIIBadgeOverlay — small type-label tooltips rendered inside a
 * shadow DOM overlay above the AI chatbot textarea. Each label sits centered
 * above its corresponding PII highlight, styled to match the landing page demo
 * (red capsule, white text, PII type name).
 *
 * Clicking a label opens a compact feedback popover so users can dismiss
 * false positives.
 *
 * IMPORTANT: Uses inline styles throughout, not Tailwind, because this
 * component is rendered inside a shadow DOM where Tailwind class names are not
 * injected.
 *
 * Architecture layer: highlighting UI — consumed by the content script overlay.
 * Depends on: src/highlighting/types.ts, src/detection/types.ts
 */

import React, { useCallback, useEffect, useRef, useState } from "react"

import type { PIITypeId } from "~src/detection/types"
import type { BadgePosition, FeedbackVerdict } from "./types"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Short display labels for PII types shown in the tooltip. */
const TYPE_LABELS: Record<string, string> = {
  EMAIL: "EMAIL",
  SSN: "SSN",
  CREDIT_CARD: "CARD",
  PHONE_US: "PHONE",
  PHONE_INTL: "PHONE",
  IPV4: "IP",
  IPV6: "IP",
  AWS_ACCESS_KEY: "KEY",
  AWS_SECRET_KEY: "KEY",
  GITHUB_TOKEN: "KEY",
  STRIPE_KEY: "KEY",
  GENERIC_API_KEY: "KEY",
  OPENAI_KEY: "KEY",
  ANTHROPIC_KEY: "KEY",
  GOOGLE_AI_KEY: "KEY",
  SLACK_TOKEN: "KEY",
  PRIVATE_KEY: "KEY",
  JWT_TOKEN: "KEY",
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

/**
 * Ordered list of PII types shown in the "Wrong type" picker.
 */
const COMMON_PII_TYPES: PIITypeId[] = [
  "EMAIL",
  "SSN",
  "CREDIT_CARD",
  "PHONE_US",
  "PHONE_INTL",
  "IPV4",
  "IPV6",
  "PERSON_NAME",
  "ORGANIZATION",
  "LOCATION",
  "MEDICAL_TERM",
  "AWS_ACCESS_KEY",
  "GITHUB_TOKEN",
  "STRIPE_KEY",
  "GENERIC_API_KEY",
  "IBAN",
  "DATE_OF_BIRTH",
  "STREET_ADDRESS",
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the short display label for a PII type.
 *
 * @param type - The PII entity type identifier.
 * @returns A short uppercase label string.
 */
function getTypeLabel(type: PIITypeId): string {
  return TYPE_LABELS[type] ?? type
}

// ---------------------------------------------------------------------------
// Props interfaces
// ---------------------------------------------------------------------------

/**
 * Props for the {@link PIIBadge} component.
 */
export interface PIIBadgeProps {
  /** The detected PII entity type. */
  readonly type: PIITypeId
  /** Detection confidence in `[0, 1]`. */
  readonly confidence: number
  /**
   * Viewport-relative coordinates for the label position.
   * Top/left represent the center-top of the highlight range.
   */
  readonly position: { readonly top: number; readonly left: number }
  /**
   * Called when the user dismisses the badge via the popover.
   *
   * @param verdict - `"not_pii"` or `"wrong_type"`.
   * @param correctedType - The type the user selected; only present when
   *   `verdict === "wrong_type"`.
   */
  readonly onDismiss: (verdict: FeedbackVerdict, correctedType?: PIITypeId) => void
}

/**
 * Props for the {@link PIIBadgeOverlay} component.
 */
export interface PIIBadgeOverlayProps {
  /** All badge positions to render; an empty array renders nothing. */
  readonly badges: readonly BadgePosition[]
  /**
   * Called when the user dismisses a specific badge.
   *
   * @param matchIndex - Index of the match in the latest detection result.
   * @param verdict - The user's feedback verdict.
   * @param correctedType - The corrected type, present only for `"wrong_type"`.
   */
  readonly onDismiss: (
    matchIndex: number,
    verdict: FeedbackVerdict,
    correctedType?: PIITypeId,
  ) => void
}

// ---------------------------------------------------------------------------
// PIIBadge component
// ---------------------------------------------------------------------------

/**
 * A small type-label tooltip positioned above a PII highlight, matching the
 * landing page demo style (red capsule, white text, PII type name).
 *
 * Clicking the label toggles a minimal feedback popover.
 *
 * @param props - {@link PIIBadgeProps}
 * @returns An absolutely positioned label element.
 */
export function PIIBadge({ type, confidence: _confidence, position, onDismiss }: PIIBadgeProps): React.ReactElement {
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [showTypePicker, setShowTypePicker] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  /** Close popover on Escape key. */
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && popoverOpen) {
        setPopoverOpen(false)
        setShowTypePicker(false)
      }
    },
    [popoverOpen],
  )

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [handleKeyDown])

  const handleBadgeClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      setPopoverOpen((prev) => !prev)
      setShowTypePicker(false)
    },
    [],
  )

  const handleNotPii = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      setPopoverOpen(false)
      setShowTypePicker(false)
      onDismiss("not_pii")
    },
    [onDismiss],
  )

  const handleWrongType = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      setShowTypePicker(true)
    },
    [],
  )

  const handleTypeSelect = useCallback(
    (selectedType: PIITypeId) => (e: React.MouseEvent) => {
      e.stopPropagation()
      setPopoverOpen(false)
      setShowTypePicker(false)
      onDismiss("wrong_type", selectedType)
    },
    [onDismiss],
  )

  const handleCancel = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setPopoverOpen(false)
    setShowTypePicker(false)
  }, [])

  const label = getTypeLabel(type)
  const pickerTypes = COMMON_PII_TYPES.filter((t) => t !== type)

  return (
    <div
      ref={wrapperRef}
      style={{
        position: "absolute",
        display: "inline-block",
        pointerEvents: "auto",
        top: position.top,
        left: position.left,
        transform: "translateX(-50%)",
        zIndex: 10001,
      }}
      role="presentation"
    >
      {/* Demo-style type label: small red capsule above highlight */}
      <button
        type="button"
        style={{
          display: "inline-block",
          padding: "2px 6px",
          borderRadius: "4px",
          fontSize: "0.6rem",
          fontWeight: 700,
          fontFamily: "system-ui, sans-serif",
          color: "#fff",
          backgroundColor: "#ff6b6b",
          border: "none",
          cursor: "pointer",
          userSelect: "none",
          lineHeight: "1.3",
          whiteSpace: "nowrap",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
        }}
        aria-label={`PII detected: ${type}. Click to review.`}
        aria-expanded={popoverOpen}
        aria-haspopup="true"
        onClick={handleBadgeClick}
      >
        {label}
      </button>

      {popoverOpen && (
        <div
          role="dialog"
          aria-label="PII badge options"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: "50%",
            transform: "translateX(-50%)",
            backgroundColor: "#1e1e2e",
            border: "1px solid #444",
            borderRadius: "8px",
            padding: "8px",
            minWidth: "160px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
            zIndex: 10002,
            display: "flex",
            flexDirection: "column",
            gap: "4px",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          {!showTypePicker ? (
            <>
              <button
                type="button"
                style={{
                  display: "block",
                  width: "100%",
                  padding: "5px 8px",
                  borderRadius: "5px",
                  border: "none",
                  textAlign: "left",
                  fontSize: "12px",
                  cursor: "pointer",
                  backgroundColor: "transparent",
                  color: "#e0e0e0",
                  fontFamily: "system-ui, sans-serif",
                }}
                aria-label="Not sensitive — dismiss this detection"
                onClick={handleNotPii}
              >
                Not sensitive
              </button>
              <button
                type="button"
                style={{
                  display: "block",
                  width: "100%",
                  padding: "5px 8px",
                  borderRadius: "5px",
                  border: "none",
                  textAlign: "left",
                  fontSize: "12px",
                  cursor: "pointer",
                  backgroundColor: "transparent",
                  color: "#e0e0e0",
                  fontFamily: "system-ui, sans-serif",
                }}
                aria-label="Wrong type — correct the PII category"
                onClick={handleWrongType}
              >
                Wrong type
              </button>
              <div style={{ height: "1px", backgroundColor: "#333", margin: "4px 0" }} />
              <button
                type="button"
                style={{
                  display: "block",
                  width: "100%",
                  padding: "5px 8px",
                  borderRadius: "5px",
                  border: "none",
                  textAlign: "left",
                  fontSize: "12px",
                  cursor: "pointer",
                  backgroundColor: "transparent",
                  color: "#e0e0e0",
                  fontFamily: "system-ui, sans-serif",
                }}
                aria-label="Cancel — close this menu"
                onClick={handleCancel}
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <div
                style={{
                  fontSize: "11px",
                  color: "#aaa",
                  padding: "2px 8px 4px",
                  fontFamily: "system-ui, sans-serif",
                }}
              >
                Select correct type:
              </div>
              <div
                role="listbox"
                aria-label="PII type selector"
                style={{
                  marginTop: "4px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "2px",
                  maxHeight: "160px",
                  overflowY: "auto",
                }}
              >
                {pickerTypes.map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="option"
                    aria-selected={false}
                    style={{
                      display: "block",
                      width: "100%",
                      padding: "4px 8px",
                      borderRadius: "4px",
                      border: "none",
                      textAlign: "left",
                      fontSize: "11px",
                      cursor: "pointer",
                      backgroundColor: "transparent",
                      color: "#c0c0d0",
                      fontFamily: "system-ui, sans-serif",
                    }}
                    onClick={handleTypeSelect(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// PIIBadgeOverlay component
// ---------------------------------------------------------------------------

/**
 * Renders a small type-label {@link PIIBadge} for every entry in `badges`.
 *
 * Each label is positioned centered above its highlight rectangle,
 * matching the demo's hover-tooltip style but always visible.
 *
 * @param props - {@link PIIBadgeOverlayProps}
 * @returns A React fragment of absolutely positioned labels, or `null`.
 */
export function PIIBadgeOverlay({ badges, onDismiss }: PIIBadgeOverlayProps): React.ReactElement | null {
  if (badges.length === 0) {
    return null
  }

  return (
    <>
      {badges.map((badge) => {
        // Position centered above the highlight, 22px above the top
        const position = {
          top: badge.rect.top - 22,
          left: badge.rect.left + badge.rect.width / 2,
        }
        return (
          <PIIBadge
            key={badge.matchIndex}
            type={badge.type}
            confidence={badge.confidence}
            position={position}
            onDismiss={(verdict, correctedType) => {
              onDismiss(badge.matchIndex, verdict, correctedType)
            }}
          />
        )
      })}
    </>
  )
}
