import { describe, expect, it, vi } from "vitest"

import {
  isTrustedWindowMessage,
  postTrustedWindowMessage,
} from "~src/utils/window-message"

describe("window message trust helpers", () => {
  it("trusts same-origin window messages", () => {
    const event = new MessageEvent("message", {
      data: { ok: true },
      origin: window.location.origin,
      source: window,
    })

    expect(isTrustedWindowMessage(event)).toBe(true)
  })

  it("rejects messages from a different origin", () => {
    const event = new MessageEvent("message", {
      data: { ok: true },
      origin: "https://evil.example",
      source: window,
    })

    expect(isTrustedWindowMessage(event)).toBe(false)
  })

  it("posts messages to the current origin instead of a wildcard target", () => {
    const postMessageSpy = vi.spyOn(window, "postMessage").mockImplementation(() => {})

    postTrustedWindowMessage({ ok: true })

    expect(postMessageSpy).toHaveBeenCalledWith(
      { ok: true },
      window.location.origin,
    )

    postMessageSpy.mockRestore()
  })
})
