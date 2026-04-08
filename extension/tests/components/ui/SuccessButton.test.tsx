import { render, screen, fireEvent } from "@testing-library/react"
import { describe, it, expect, vi } from "vitest"
import { SuccessButton } from "~src/components/ui/SuccessButton"

describe("SuccessButton", () => {
  it("should render children text", () => {
    render(<SuccessButton onClick={() => {}}>Click Me</SuccessButton>)
    expect(screen.getByRole("button", { name: "Click Me" })).toBeDefined()
  })

  it("should call onClick when clicked", () => {
    const onClick = vi.fn()
    render(<SuccessButton onClick={onClick}>Test</SuccessButton>)
    fireEvent.click(screen.getByRole("button"))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it("should not call onClick when disabled", () => {
    const onClick = vi.fn()
    render(<SuccessButton onClick={onClick} disabled>Test</SuccessButton>)
    fireEvent.click(screen.getByRole("button"))
    expect(onClick).not.toHaveBeenCalled()
  })

  it("should apply disabled styling when disabled", () => {
    render(<SuccessButton onClick={() => {}} disabled>Test</SuccessButton>)
    const button = screen.getByRole("button")
    expect(button.className).toContain("opacity-40")
    expect(button.className).toContain("cursor-not-allowed")
  })

  it("should forward className", () => {
    render(<SuccessButton onClick={() => {}} className="mt-4">Test</SuccessButton>)
    expect(screen.getByRole("button").className).toContain("mt-4")
  })
})
