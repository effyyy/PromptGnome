import { render, screen } from "@testing-library/react"
import { describe, it, expect } from "vitest"
import { PiiBadge } from "~src/components/ui/PiiBadge"

describe("PiiBadge", () => {
  it("should render the type text", () => {
    render(<PiiBadge type="EMAIL" />)
    expect(screen.getByText("EMAIL")).toBeDefined()
  })
})
