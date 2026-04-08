import { render, screen, fireEvent } from "@testing-library/react"
import { describe, it, expect, vi } from "vitest"
import { CyanButton } from "~src/components/ui/CyanButton"

describe("CyanButton", () => {
  it("should render children text", () => {
    render(<CyanButton onClick={() => {}}>Click Me</CyanButton>)
    expect(screen.getByRole("button", { name: "Click Me" })).toBeDefined()
  })

  it("should call onClick when clicked", () => {
    const onClick = vi.fn()
    render(<CyanButton onClick={onClick}>Test</CyanButton>)
    fireEvent.click(screen.getByRole("button"))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it("should not call onClick when disabled", () => {
    const onClick = vi.fn()
    render(<CyanButton onClick={onClick} disabled>Test</CyanButton>)
    fireEvent.click(screen.getByRole("button"))
    expect(onClick).not.toHaveBeenCalled()
  })

  it("should apply disabled styling when disabled", () => {
    render(<CyanButton onClick={() => {}} disabled>Test</CyanButton>)
    const button = screen.getByRole("button")
    expect(button.className).toContain("opacity-40")
    expect(button.className).toContain("cursor-not-allowed")
  })

  it("should forward className", () => {
    render(<CyanButton onClick={() => {}} className="mt-4">Test</CyanButton>)
    expect(screen.getByRole("button").className).toContain("mt-4")
  })
})
