import { render, screen } from "@testing-library/react"
import { describe, it, expect } from "vitest"
import { StatCard } from "~src/components/ui/StatCard"

describe("StatCard", () => {
  it("should render value and label", () => {
    render(<StatCard value={247} label="Blocked" />)
    expect(screen.getByText("247")).toBeDefined()
    expect(screen.getByText("Blocked")).toBeDefined()
  })

  it("should apply danger variant styling", () => {
    const { container } = render(<StatCard value={3} label="Critical" variant="danger" />)
    const valueEl = container.querySelector(".font-mono.text-lg")
    expect(valueEl?.className).toContain("danger")
  })
})
