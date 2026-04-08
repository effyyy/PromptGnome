import { render } from "@testing-library/react"
import { describe, it, expect } from "vitest"
import { ShieldIcon } from "~src/components/ui/ShieldIcon"

describe("ShieldIcon", () => {
  it("should render with default size", () => {
    const { container } = render(<ShieldIcon />)
    const el = container.firstChild as HTMLElement
    expect(el.style.width).toBe("40px")
  })

  it("should apply animate class when animate is true", () => {
    const { container } = render(<ShieldIcon animate />)
    expect((container.firstChild as HTMLElement).className).toContain("animate-icon-glow")
  })
})
