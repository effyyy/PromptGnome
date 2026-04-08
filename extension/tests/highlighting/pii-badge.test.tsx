/**
 * Tests for PIIBadge and PIIBadgeOverlay components.
 *
 * Verifies rendering, popover open/close behaviour, feedback callbacks, and
 * the type-picker flow. All PII values are synthetic.
 *
 * Environment: jsdom (vitest).
 */

import React from "react"
import { render, screen, fireEvent, act } from "@testing-library/react"
import { describe, it, expect, vi } from "vitest"

import { PIIBadge, PIIBadgeOverlay } from "../../src/highlighting/pii-badge"
import type { PIIBadgeProps } from "../../src/highlighting/pii-badge"
import type { BadgePosition, FeedbackVerdict } from "../../src/highlighting/types"
import type { PIITypeId } from "../../src/detection/types"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePosition(top = 100, left = 200): PIIBadgeProps["position"] {
  return { top, left }
}

function makeBadgePosition(overrides: Partial<BadgePosition> = {}): BadgePosition {
  return {
    matchIndex: 0,
    type: "EMAIL",
    rect: new DOMRect(50, 80, 120, 20),
    confidence: 0.95,
    ...overrides,
  }
}

function renderBadge(overrides: Partial<PIIBadgeProps> = {}) {
  const onDismiss = vi.fn<[FeedbackVerdict, PIITypeId?], void>()
  const props: PIIBadgeProps = {
    type: "EMAIL",
    confidence: 0.95,
    position: makePosition(),
    onDismiss,
    ...overrides,
  }
  const utils = render(<PIIBadge {...props} />)
  return { ...utils, onDismiss }
}

// ---------------------------------------------------------------------------
// PIIBadge — badge chip rendering
// ---------------------------------------------------------------------------

describe("PIIBadge", () => {
  describe("rendering", () => {
    it("should render the PII type label as the badge text", () => {
      renderBadge({ type: "EMAIL" })
      expect(screen.getByRole("button", { name: /PII detected: EMAIL/i })).toBeTruthy()
      // The button text content should be the type label
      const btn = screen.getByRole("button", { name: /PII detected: EMAIL/i })
      expect(btn.textContent).toBe("EMAIL")
    })

    it("should render SSN type label", () => {
      renderBadge({ type: "SSN" })
      const btn = screen.getByRole("button", { name: /PII detected: SSN/i })
      expect(btn.textContent).toBe("SSN")
    })

    it("should render CREDIT_CARD type label as CARD", () => {
      renderBadge({ type: "CREDIT_CARD" })
      const btn = screen.getByRole("button", { name: /PII detected: CREDIT_CARD/i })
      expect(btn.textContent).toBe("CARD")
    })

    it("should render PERSON_NAME type label as NAME", () => {
      renderBadge({ type: "PERSON_NAME" })
      const btn = screen.getByRole("button", { name: /PII detected: PERSON_NAME/i })
      expect(btn.textContent).toBe("NAME")
    })

    it("should have aria-expanded=false when popover is closed", () => {
      renderBadge()
      const btn = screen.getByRole("button", { name: /PII detected/i })
      expect(btn.getAttribute("aria-expanded")).toBe("false")
    })

    it("should not show the popover dialog initially", () => {
      renderBadge()
      expect(screen.queryByRole("dialog")).toBeNull()
    })
  })

  // ---------------------------------------------------------------------------
  // PIIBadge — popover open/close
  // ---------------------------------------------------------------------------

  describe("popover toggle", () => {
    it("should open the popover when badge is clicked", () => {
      renderBadge()
      const btn = screen.getByRole("button", { name: /PII detected/i })
      fireEvent.click(btn)
      expect(screen.getByRole("dialog")).toBeTruthy()
    })

    it("should set aria-expanded=true after opening popover", () => {
      renderBadge()
      const btn = screen.getByRole("button", { name: /PII detected/i })
      fireEvent.click(btn)
      expect(btn.getAttribute("aria-expanded")).toBe("true")
    })

    it("should close popover when badge is clicked again", () => {
      renderBadge()
      const btn = screen.getByRole("button", { name: /PII detected/i })
      fireEvent.click(btn) // open
      fireEvent.click(btn) // close
      expect(screen.queryByRole("dialog")).toBeNull()
    })

    it("should close popover when Escape key is pressed", async () => {
      renderBadge()
      const btn = screen.getByRole("button", { name: /PII detected/i })
      fireEvent.click(btn) // open
      expect(screen.getByRole("dialog")).toBeTruthy()

      await act(async () => {
        fireEvent.keyDown(document, { key: "Escape" })
      })

      expect(screen.queryByRole("dialog")).toBeNull()
    })

    it("should not close when a non-Escape key is pressed", async () => {
      renderBadge()
      const btn = screen.getByRole("button", { name: /PII detected/i })
      fireEvent.click(btn)
      expect(screen.getByRole("dialog")).toBeTruthy()

      await act(async () => {
        fireEvent.keyDown(document, { key: "Enter" })
      })

      expect(screen.getByRole("dialog")).toBeTruthy()
    })

    it("should show three action buttons inside the popover", () => {
      renderBadge()
      fireEvent.click(screen.getByRole("button", { name: /PII detected/i }))

      expect(screen.getByRole("button", { name: /Not sensitive/i })).toBeTruthy()
      expect(screen.getByRole("button", { name: /Wrong type/i })).toBeTruthy()
      expect(screen.getByRole("button", { name: /Cancel/i })).toBeTruthy()
    })
  })

  // ---------------------------------------------------------------------------
  // PIIBadge — "Not sensitive" action
  // ---------------------------------------------------------------------------

  describe('"Not sensitive" action', () => {
    it('should call onDismiss with "not_pii" when "Not sensitive" is clicked', () => {
      const { onDismiss } = renderBadge()
      fireEvent.click(screen.getByRole("button", { name: /PII detected/i }))
      fireEvent.click(screen.getByRole("button", { name: /Not sensitive/i }))

      expect(onDismiss).toHaveBeenCalledOnce()
      expect(onDismiss).toHaveBeenCalledWith("not_pii")
    })

    it("should close the popover after 'Not sensitive' is clicked", () => {
      renderBadge()
      fireEvent.click(screen.getByRole("button", { name: /PII detected/i }))
      fireEvent.click(screen.getByRole("button", { name: /Not sensitive/i }))

      expect(screen.queryByRole("dialog")).toBeNull()
    })

    it("should not pass a correctedType when 'Not sensitive' is clicked", () => {
      const { onDismiss } = renderBadge()
      fireEvent.click(screen.getByRole("button", { name: /PII detected/i }))
      fireEvent.click(screen.getByRole("button", { name: /Not sensitive/i }))

      expect(onDismiss).toHaveBeenCalledWith("not_pii")
      // Second argument should be undefined (not passed)
      expect(onDismiss.mock.calls[0][1]).toBeUndefined()
    })
  })

  // ---------------------------------------------------------------------------
  // PIIBadge — "Cancel" action
  // ---------------------------------------------------------------------------

  describe('"Cancel" action', () => {
    it("should close the popover without calling onDismiss", () => {
      const { onDismiss } = renderBadge()
      fireEvent.click(screen.getByRole("button", { name: /PII detected/i }))
      fireEvent.click(screen.getByRole("button", { name: /Cancel/i }))

      expect(screen.queryByRole("dialog")).toBeNull()
      expect(onDismiss).not.toHaveBeenCalled()
    })
  })

  // ---------------------------------------------------------------------------
  // PIIBadge — "Wrong type" action and type picker
  // ---------------------------------------------------------------------------

  describe('"Wrong type" action', () => {
    it("should show the type picker when 'Wrong type' is clicked", () => {
      renderBadge({ type: "EMAIL" })
      fireEvent.click(screen.getByRole("button", { name: /PII detected/i }))
      fireEvent.click(screen.getByRole("button", { name: /Wrong type/i }))

      expect(screen.getByRole("listbox", { name: /PII type selector/i })).toBeTruthy()
    })

    it("should exclude the current type from the type picker", () => {
      renderBadge({ type: "EMAIL" })
      fireEvent.click(screen.getByRole("button", { name: /PII detected/i }))
      fireEvent.click(screen.getByRole("button", { name: /Wrong type/i }))

      const listbox = screen.getByRole("listbox")
      // The listbox options should not include EMAIL (the current type)
      const options = listbox.querySelectorAll("[role='option']")
      const texts = Array.from(options).map((o) => o.textContent)
      expect(texts).not.toContain("EMAIL")
    })

    it("should show other PII types in the picker", () => {
      renderBadge({ type: "EMAIL" })
      fireEvent.click(screen.getByRole("button", { name: /PII detected/i }))
      fireEvent.click(screen.getByRole("button", { name: /Wrong type/i }))

      const listbox = screen.getByRole("listbox")
      const options = listbox.querySelectorAll("[role='option']")
      expect(options.length).toBeGreaterThan(0)
      const texts = Array.from(options).map((o) => o.textContent)
      expect(texts).toContain("SSN")
      expect(texts).toContain("CREDIT_CARD")
    })

    it('should call onDismiss with "wrong_type" and selected type', () => {
      const { onDismiss } = renderBadge({ type: "EMAIL" })
      fireEvent.click(screen.getByRole("button", { name: /PII detected/i }))
      fireEvent.click(screen.getByRole("button", { name: /Wrong type/i }))

      // Click the SSN option in the picker
      const listbox = screen.getByRole("listbox")
      const ssnOption = Array.from(listbox.querySelectorAll("[role='option']")).find(
        (el) => el.textContent === "SSN",
      )
      expect(ssnOption).toBeTruthy()
      fireEvent.click(ssnOption!)

      expect(onDismiss).toHaveBeenCalledOnce()
      expect(onDismiss).toHaveBeenCalledWith("wrong_type", "SSN")
    })

    it("should close the popover after selecting a type from the picker", () => {
      renderBadge({ type: "EMAIL" })
      fireEvent.click(screen.getByRole("button", { name: /PII detected/i }))
      fireEvent.click(screen.getByRole("button", { name: /Wrong type/i }))

      const listbox = screen.getByRole("listbox")
      const ssnOption = Array.from(listbox.querySelectorAll("[role='option']")).find(
        (el) => el.textContent === "SSN",
      )
      fireEvent.click(ssnOption!)

      expect(screen.queryByRole("dialog")).toBeNull()
    })

    it("should close type picker on Escape key", async () => {
      renderBadge({ type: "SSN" })
      fireEvent.click(screen.getByRole("button", { name: /PII detected/i }))
      fireEvent.click(screen.getByRole("button", { name: /Wrong type/i }))
      expect(screen.getByRole("listbox")).toBeTruthy()

      await act(async () => {
        fireEvent.keyDown(document, { key: "Escape" })
      })

      expect(screen.queryByRole("dialog")).toBeNull()
      expect(screen.queryByRole("listbox")).toBeNull()
    })
  })

  // ---------------------------------------------------------------------------
  // PIIBadge — accessibility
  // ---------------------------------------------------------------------------

  describe("accessibility", () => {
    it("should have a descriptive aria-label on the badge button", () => {
      renderBadge({ type: "SSN" })
      const btn = screen.getByRole("button", { name: /PII detected: SSN/i })
      expect(btn).toBeTruthy()
    })

    it("should have aria-haspopup on the badge button", () => {
      renderBadge()
      const btn = screen.getByRole("button", { name: /PII detected/i })
      expect(btn.getAttribute("aria-haspopup")).toBe("true")
    })

    it("should have aria-label on the dialog", () => {
      renderBadge()
      fireEvent.click(screen.getByRole("button", { name: /PII detected/i }))
      const dialog = screen.getByRole("dialog")
      expect(dialog.getAttribute("aria-label")).toBeTruthy()
    })
  })
})

// ---------------------------------------------------------------------------
// PIIBadgeOverlay
// ---------------------------------------------------------------------------

describe("PIIBadgeOverlay", () => {
  it("should return null when badges array is empty", () => {
    const onDismiss = vi.fn()
    const { container } = render(<PIIBadgeOverlay badges={[]} onDismiss={onDismiss} />)
    // With null return the container should have no meaningful content
    expect(container.firstChild).toBeNull()
  })

  it("should render one badge for a single-item array", () => {
    const onDismiss = vi.fn()
    const badges = [makeBadgePosition({ type: "EMAIL", matchIndex: 0 })]
    render(<PIIBadgeOverlay badges={badges} onDismiss={onDismiss} />)

    const btns = screen.getAllByRole("button", { name: /PII detected/i })
    expect(btns).toHaveLength(1)
    expect(btns[0].textContent).toBe("EMAIL")
  })

  it("should render one badge per entry in the badges array", () => {
    const onDismiss = vi.fn()
    const badges = [
      makeBadgePosition({ type: "EMAIL", matchIndex: 0, rect: new DOMRect(10, 20, 80, 18) }),
      makeBadgePosition({ type: "SSN", matchIndex: 1, rect: new DOMRect(200, 40, 60, 18) }),
      makeBadgePosition({ type: "PHONE_US", matchIndex: 2, rect: new DOMRect(400, 60, 90, 18) }),
    ]
    render(<PIIBadgeOverlay badges={badges} onDismiss={onDismiss} />)

    const btns = screen.getAllByRole("button", { name: /PII detected/i })
    expect(btns).toHaveLength(3)
    const labels = btns.map((b) => b.textContent)
    expect(labels).toContain("EMAIL")
    expect(labels).toContain("SSN")
    expect(labels).toContain("PHONE")
  })

  it("should pass the correct matchIndex to onDismiss when a badge fires", () => {
    const onDismiss = vi.fn<[number, FeedbackVerdict, PIITypeId?], void>()
    const badges = [
      makeBadgePosition({ type: "EMAIL", matchIndex: 3, rect: new DOMRect(10, 20, 80, 18) }),
    ]
    render(<PIIBadgeOverlay badges={badges} onDismiss={onDismiss} />)

    const btn = screen.getByRole("button", { name: /PII detected: EMAIL/i })
    fireEvent.click(btn)
    fireEvent.click(screen.getByRole("button", { name: /Not sensitive/i }))

    expect(onDismiss).toHaveBeenCalledOnce()
    expect(onDismiss).toHaveBeenCalledWith(3, "not_pii", undefined)
  })

  it("should pass matchIndex and correctedType for wrong_type dismissal", () => {
    const onDismiss = vi.fn<[number, FeedbackVerdict, PIITypeId?], void>()
    const badges = [
      makeBadgePosition({ type: "EMAIL", matchIndex: 7, rect: new DOMRect(10, 20, 80, 18) }),
    ]
    render(<PIIBadgeOverlay badges={badges} onDismiss={onDismiss} />)

    const btn = screen.getByRole("button", { name: /PII detected: EMAIL/i })
    fireEvent.click(btn)
    fireEvent.click(screen.getByRole("button", { name: /Wrong type/i }))

    const listbox = screen.getByRole("listbox")
    const ssnOption = Array.from(listbox.querySelectorAll("[role='option']")).find(
      (el) => el.textContent === "SSN",
    )
    fireEvent.click(ssnOption!)

    expect(onDismiss).toHaveBeenCalledWith(7, "wrong_type", "SSN")
  })

  it("should position each badge centered above the highlight", () => {
    const onDismiss = vi.fn()
    const rect = new DOMRect(50, 80, 120, 20) // top=80, left=50, width=120
    const badges = [makeBadgePosition({ type: "EMAIL", matchIndex: 0, rect })]
    render(<PIIBadgeOverlay badges={badges} onDismiss={onDismiss} />)

    // The wrapper div has top=58 (80-22), left=110 (50+120/2) with translateX(-50%)
    const btn = screen.getByRole("button", { name: /PII detected: EMAIL/i })
    const wrapper = btn.closest("[role='presentation']") ?? btn.parentElement
    const style = wrapper?.getAttribute("style") ?? ""
    expect(style).toContain("top: 58px")
    expect(style).toContain("left: 110px")
  })

  it("should render nothing (null) for an empty readonly array", () => {
    const onDismiss = vi.fn()
    const { container } = render(
      <PIIBadgeOverlay badges={[] as readonly BadgePosition[]} onDismiss={onDismiss} />,
    )
    expect(container.firstChild).toBeNull()
  })
})
