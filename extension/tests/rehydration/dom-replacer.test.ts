/**
 * Tests for the DomReplacer re-hydration module.
 *
 * Verifies that [TYPE_N] placeholder tokens in DOM text nodes are correctly
 * replaced with the original PII values registered in the SessionMapper,
 * including proper highlight styling and attribute marking.
 */

import { describe, it, expect, beforeEach } from "vitest"
import { DomReplacer } from "~src/rehydration/dom-replacer"
import { SessionMapper } from "~src/anonymization/session-mapper"

describe("DomReplacer", () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement("div")
    document.body.appendChild(container)
    return () => {
      document.body.removeChild(container)
    }
  })

  it("should replace placeholder text nodes with original values", () => {
    const mapper = new SessionMapper()
    mapper.getOrCreatePlaceholder("EMAIL", "test@example.com")
    container.textContent = "Your email is [EMAIL_1] confirmed."
    const replacer = new DomReplacer()
    replacer.replaceInNode(container, mapper)
    const spans = container.querySelectorAll("span[data-pii-rehydrated]")
    expect(spans.length).toBe(1)
    expect(spans[0].textContent).toBe("test@example.com")
  })

  it("should handle multiple placeholders in one text node", () => {
    const mapper = new SessionMapper()
    mapper.getOrCreatePlaceholder("NAME", "Jane Testperson")
    mapper.getOrCreatePlaceholder("EMAIL", "test@example.com")
    container.textContent = "Hi [NAME_1], your email [EMAIL_1] is set."
    const replacer = new DomReplacer()
    replacer.replaceInNode(container, mapper)
    expect(container.textContent).toContain("Jane Testperson")
    expect(container.textContent).toContain("test@example.com")
  })

  it("should not modify nodes without placeholders", () => {
    const mapper = new SessionMapper()
    container.textContent = "No placeholders here."
    const replacer = new DomReplacer()
    replacer.replaceInNode(container, mapper)
    expect(container.childNodes.length).toBe(1)
    expect(container.textContent).toBe("No placeholders here.")
  })

  it("should leave unknown placeholders as-is", () => {
    const mapper = new SessionMapper()
    container.textContent = "Unknown: [EMAIL_99]"
    const replacer = new DomReplacer()
    replacer.replaceInNode(container, mapper)
    expect(container.textContent).toBe("Unknown: [EMAIL_99]")
  })

  it("should apply inline highlight style to replaced spans", () => {
    const mapper = new SessionMapper()
    mapper.getOrCreatePlaceholder("SSN", "123-45-6789")
    container.textContent = "SSN: [SSN_1]"
    const replacer = new DomReplacer()
    replacer.replaceInNode(container, mapper)
    const span = container.querySelector(
      "span[data-pii-rehydrated]",
    ) as HTMLSpanElement
    expect(span).not.toBeNull()
    expect(span.style.background).toContain("rgba")
  })
})
