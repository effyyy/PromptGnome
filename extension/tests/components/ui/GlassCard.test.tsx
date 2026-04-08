import { render, screen } from "@testing-library/react"
import { describe, it, expect } from "vitest"
import { GlassCard } from "~src/components/ui/GlassCard"

describe("GlassCard", () => {
  it("should render children", () => {
    render(<GlassCard><p>Content</p></GlassCard>)
    expect(screen.getByText("Content")).toBeDefined()
  })

  it("should forward className", () => {
    const { container } = render(<GlassCard className="mt-4">Test</GlassCard>)
    expect((container.firstChild as HTMLElement)?.className).toContain("mt-4")
  })

  it("should hide border when noBorder is true", () => {
    const { container } = render(<GlassCard noBorder>Test</GlassCard>)
    expect((container.firstChild as HTMLElement)?.className).not.toContain("border-cyber-soft")
  })
})
