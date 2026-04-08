/**
 * Tests for src/highlighting/input-monitor.ts.
 *
 * Verifies text extraction accuracy, DOM offset mapping, input event handling,
 * MutationObserver integration, deduplication, and cleanup behaviour.
 * All tests run under jsdom (configured in vitest.config.ts).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  extractTextMapping,
  createInputMonitor,
} from "../../src/highlighting/input-monitor"
import type { TextMapping } from "../../src/highlighting/types"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a contenteditable div in the jsdom document body.
 * Returns the element so tests can populate it before passing it to the SUT.
 */
function makeContentEditable(innerHTML = ""): HTMLDivElement {
  const el = document.createElement("div")
  el.contentEditable = "true"
  el.innerHTML = innerHTML
  document.body.appendChild(el)
  return el
}

/**
 * Fires a synthetic "input" event on the given element.
 */
function fireInputEvent(el: HTMLElement): void {
  el.dispatchEvent(new Event("input", { bubbles: true }))
}

// ---------------------------------------------------------------------------
// extractTextMapping — simple text
// ---------------------------------------------------------------------------

describe("extractTextMapping", () => {
  afterEach(() => {
    document.body.innerHTML = ""
  })

  it("should return empty mapping for empty element", () => {
    const el = makeContentEditable("")
    const mapping = extractTextMapping(el)
    expect(mapping.plainText).toBe("")
    expect(mapping.offsets).toHaveLength(0)
  })

  it("should extract plain text from a single text node", () => {
    const el = makeContentEditable("")
    el.textContent = "hello"
    const mapping = extractTextMapping(el)
    expect(mapping.plainText).toBe("hello")
    expect(mapping.offsets).toHaveLength(5)
  })

  it("should maintain invariant: offsets.length === plainText.length", () => {
    const el = makeContentEditable("<p>foo</p><p>bar</p>")
    const mapping = extractTextMapping(el)
    expect(mapping.offsets.length).toBe(mapping.plainText.length)
  })

  it("should insert a newline between block-level P elements", () => {
    const el = makeContentEditable("<p>line one</p><p>line two</p>")
    const mapping = extractTextMapping(el)
    expect(mapping.plainText).toContain("\n")
    expect(mapping.plainText).toContain("line one")
    expect(mapping.plainText).toContain("line two")
  })

  it("should insert a newline for BR elements", () => {
    const el = makeContentEditable("")
    // Build: text "hello" + BR + text "world"
    el.appendChild(document.createTextNode("hello"))
    const br = document.createElement("br")
    el.appendChild(br)
    el.appendChild(document.createTextNode("world"))
    const mapping = extractTextMapping(el)
    expect(mapping.plainText).toBe("hello\nworld")
  })

  it("should insert null offsets for synthetic BR newlines", () => {
    const el = makeContentEditable("")
    el.appendChild(document.createTextNode("a"))
    el.appendChild(document.createElement("br"))
    el.appendChild(document.createTextNode("b"))
    const mapping = extractTextMapping(el)
    // plainText is "a\nb"
    const newlineIndex = mapping.plainText.indexOf("\n")
    expect(newlineIndex).toBeGreaterThan(-1)
    expect(mapping.offsets[newlineIndex]).toBeNull()
  })

  it("should handle nested spans and return all characters", () => {
    const el = makeContentEditable(
      "<span>Hello</span><span> </span><span>World</span>"
    )
    const mapping = extractTextMapping(el)
    expect(mapping.plainText).toBe("Hello World")
    expect(mapping.offsets).toHaveLength(11)
  })

  it("should map each character to the correct Text node", () => {
    const el = makeContentEditable("")
    const node1 = document.createTextNode("ab")
    const node2 = document.createTextNode("cd")
    el.appendChild(node1)
    el.appendChild(node2)
    const mapping = extractTextMapping(el)
    // "a" → node1 offset 0
    expect(mapping.offsets[0]).toEqual({ node: node1, offset: 0 })
    // "b" → node1 offset 1
    expect(mapping.offsets[1]).toEqual({ node: node1, offset: 1 })
    // "c" → node2 offset 0
    expect(mapping.offsets[2]).toEqual({ node: node2, offset: 0 })
    // "d" → node2 offset 1
    expect(mapping.offsets[3]).toEqual({ node: node2, offset: 1 })
  })

  it("should support Range creation from offset mapping", () => {
    const el = makeContentEditable("")
    el.textContent = "test@example.com"
    const mapping = extractTextMapping(el)
    // Every offset in a single text node should be non-null.
    const startPos = mapping.offsets[0]
    const endPos = mapping.offsets[15]
    expect(startPos).not.toBeNull()
    expect(endPos).not.toBeNull()
    if (startPos !== null && endPos !== null) {
      const range = document.createRange()
      range.setStart(startPos.node, startPos.offset)
      range.setEnd(endPos.node, endPos.offset + 1)
      expect(range.toString()).toBe("test@example.com")
    }
  })

  it("should insert newlines for all supported block tags", () => {
    const blockTags = ["div", "li", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre", "tr"]
    for (const tag of blockTags) {
      const outer = makeContentEditable("")
      const inner = document.createElement(tag)
      inner.textContent = "inner"
      // Add a text node before the block so a newline is inserted.
      outer.appendChild(document.createTextNode("before"))
      outer.appendChild(inner)
      const mapping = extractTextMapping(outer)
      expect(mapping.plainText).toContain("\n")
      document.body.removeChild(outer)
    }
  })

  it("should not insert a leading newline for the root element itself", () => {
    const el = makeContentEditable("")
    el.textContent = "start"
    const mapping = extractTextMapping(el)
    expect(mapping.plainText[0]).not.toBe("\n")
  })

  it("should skip comment and other non-element non-text nodes", () => {
    const el = makeContentEditable("")
    el.appendChild(document.createTextNode("real"))
    el.appendChild(document.createComment("ignored"))
    const mapping = extractTextMapping(el)
    expect(mapping.plainText).toBe("real")
    expect(mapping.offsets).toHaveLength(4)
  })
})

// ---------------------------------------------------------------------------
// createInputMonitor — basic behaviour
// ---------------------------------------------------------------------------

describe("createInputMonitor", () => {
  let el: HTMLDivElement
  let calls: TextMapping[]
  let cleanup: () => void

  beforeEach(() => {
    calls = []
    el = makeContentEditable("")
  })

  afterEach(() => {
    if (typeof cleanup === "function") cleanup()
    document.body.innerHTML = ""
    vi.restoreAllMocks()
  })

  it("should fire onTextChange immediately on creation (initial extraction)", () => {
    el.textContent = "initial"
    cleanup = createInputMonitor({
      inputElement: el,
      onTextChange: (m) => calls.push(m),
    })
    expect(calls).toHaveLength(1)
    expect(calls[0].plainText).toBe("initial")
  })

  it("should fire onTextChange when input event is dispatched", () => {
    cleanup = createInputMonitor({
      inputElement: el,
      onTextChange: (m) => calls.push(m),
    })
    calls.length = 0 // reset after initial call
    el.textContent = "updated"
    fireInputEvent(el)
    expect(calls).toHaveLength(1)
    expect(calls[0].plainText).toBe("updated")
  })

  it("should not fire onTextChange when text is unchanged (deduplication)", () => {
    el.textContent = "same"
    cleanup = createInputMonitor({
      inputElement: el,
      onTextChange: (m) => calls.push(m),
    })
    calls.length = 0 // clear initial call
    // Fire input without changing the text.
    fireInputEvent(el)
    fireInputEvent(el)
    expect(calls).toHaveLength(0)
  })

  it("should fire after each distinct change", () => {
    cleanup = createInputMonitor({
      inputElement: el,
      onTextChange: (m) => calls.push(m),
    })
    calls.length = 0

    el.textContent = "first"
    fireInputEvent(el)
    el.textContent = "second"
    fireInputEvent(el)

    expect(calls).toHaveLength(2)
    expect(calls[0].plainText).toBe("first")
    expect(calls[1].plainText).toBe("second")
  })

  it("should stop firing after cleanup is called", () => {
    cleanup = createInputMonitor({
      inputElement: el,
      onTextChange: (m) => calls.push(m),
    })
    calls.length = 0

    cleanup()

    el.textContent = "after-cleanup"
    fireInputEvent(el)
    expect(calls).toHaveLength(0)
  })

  it("should return a cleanup function that can be called multiple times without error", () => {
    cleanup = createInputMonitor({
      inputElement: el,
      onTextChange: (m) => calls.push(m),
    })
    expect(() => {
      cleanup()
      cleanup()
    }).not.toThrow()
  })

  it("should detect changes via MutationObserver when text node is modified", async () => {
    cleanup = createInputMonitor({
      inputElement: el,
      onTextChange: (m) => calls.push(m),
    })
    calls.length = 0

    // Directly mutate a text node — no input event fired.
    const textNode = document.createTextNode("mutated")
    el.appendChild(textNode)

    // MutationObserver callbacks are microtask-queued — wait one tick.
    await Promise.resolve()

    expect(calls.length).toBeGreaterThan(0)
    expect(calls[calls.length - 1].plainText).toContain("mutated")
  })

  it("should handle paste events by detecting the resulting text change", () => {
    cleanup = createInputMonitor({
      inputElement: el,
      onTextChange: (m) => calls.push(m),
    })
    calls.length = 0

    // Simulate a paste: set textContent, then fire input (as browsers do).
    el.textContent = "pasted content"
    fireInputEvent(el)

    expect(calls).toHaveLength(1)
    expect(calls[0].plainText).toBe("pasted content")
  })

  it("should pass a correctly-mapped TextMapping to the callback", () => {
    el.textContent = "abc"
    cleanup = createInputMonitor({
      inputElement: el,
      onTextChange: (m) => calls.push(m),
    })
    const mapping = calls[0]
    expect(mapping.plainText).toBe("abc")
    expect(mapping.offsets).toHaveLength(3)
    expect(mapping.offsets[0]).not.toBeNull()
    if (mapping.offsets[0] !== null) {
      expect(mapping.offsets[0].offset).toBe(0)
    }
  })

  it("should handle empty contenteditable without error", () => {
    expect(() => {
      cleanup = createInputMonitor({
        inputElement: el,
        onTextChange: (m) => calls.push(m),
      })
    }).not.toThrow()
    expect(calls[0].plainText).toBe("")
  })

  it("should fail silently when onTextChange throws", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    let callCount = 0
    cleanup = createInputMonitor({
      inputElement: el,
      onTextChange: () => {
        callCount++
        if (callCount === 1) {
          // Initial call — throw.
          throw new Error("Callback failure")
        }
      },
    })
    // Should not propagate — and the monitor should still work afterward.
    el.textContent = "next"
    expect(() => fireInputEvent(el)).not.toThrow()
    warnSpy.mockRestore()
  })
})
