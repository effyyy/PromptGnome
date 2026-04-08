import { render, screen, fireEvent } from "@testing-library/react"
import { describe, it, expect, vi } from "vitest"
import { CyanToggle } from "~src/components/ui/CyanToggle"

describe("CyanToggle", () => {
  it("should render with role switch", () => {
    render(<CyanToggle checked={false} onChange={() => {}} />)
    expect(screen.getByRole("switch")).toBeDefined()
  })

  it("should reflect checked state via aria-checked", () => {
    render(<CyanToggle checked={true} onChange={() => {}} />)
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("true")
  })

  it("should call onChange with toggled value on click", () => {
    const onChange = vi.fn()
    render(<CyanToggle checked={false} onChange={onChange} />)
    fireEvent.click(screen.getByRole("switch"))
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it("should not call onChange when disabled", () => {
    const onChange = vi.fn()
    render(<CyanToggle checked={false} onChange={onChange} disabled />)
    fireEvent.click(screen.getByRole("switch"))
    expect(onChange).not.toHaveBeenCalled()
  })

  it("should render label when provided", () => {
    render(<CyanToggle checked={false} onChange={() => {}} label="Email" />)
    expect(screen.getByText("Email")).toBeDefined()
  })
})
