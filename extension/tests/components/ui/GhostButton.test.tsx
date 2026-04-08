import { render, screen, fireEvent } from "@testing-library/react"
import { describe, it, expect, vi } from "vitest"
import { GhostButton } from "~src/components/ui/GhostButton"

describe("GhostButton", () => {
  it("should render children text", () => {
    render(<GhostButton onClick={() => {}}>Click Me</GhostButton>)
    expect(screen.getByRole("button", { name: "Click Me" })).toBeDefined()
  })

  it("should call onClick when clicked", () => {
    const onClick = vi.fn()
    render(<GhostButton onClick={onClick}>Test</GhostButton>)
    fireEvent.click(screen.getByRole("button"))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it("should not call onClick when disabled", () => {
    const onClick = vi.fn()
    render(<GhostButton onClick={onClick} disabled>Test</GhostButton>)
    fireEvent.click(screen.getByRole("button"))
    expect(onClick).not.toHaveBeenCalled()
  })

  it("should apply disabled styling when disabled", () => {
    render(<GhostButton onClick={() => {}} disabled>Test</GhostButton>)
    const button = screen.getByRole("button")
    expect(button.className).toContain("opacity-40")
    expect(button.className).toContain("cursor-not-allowed")
  })

  it("should forward className", () => {
    render(<GhostButton onClick={() => {}} className="mt-4">Test</GhostButton>)
    expect(screen.getByRole("button").className).toContain("mt-4")
  })
})
