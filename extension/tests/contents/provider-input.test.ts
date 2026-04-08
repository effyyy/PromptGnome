import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  fillProviderDraft,
  restoreInputFocus,
} from "../../src/utils/provider-input";

describe("provider-input helpers", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("restores focus to a provider textarea", () => {
    const textarea = document.createElement("textarea");
    textarea.id = "prompt-textarea";
    textarea.value = "draft";
    document.body.appendChild(textarea);

    const focused = restoreInputFocus("CHATGPT");

    expect(focused).toBe(true);
    expect(document.activeElement).toBe(textarea);
    expect(textarea.selectionStart).toBe(textarea.value.length);
  });

  it("prefills a textarea draft and dispatches input events", () => {
    const textarea = document.createElement("textarea");
    textarea.id = "prompt-textarea";
    const inputSpy = vi.fn();
    textarea.addEventListener("input", inputSpy);
    document.body.appendChild(textarea);

    const updated = fillProviderDraft(
      "CHATGPT",
      "test@example.com in a safe demo message",
    );

    expect(updated).toBe(true);
    expect(textarea.value).toBe("test@example.com in a safe demo message");
    expect(inputSpy).toHaveBeenCalled();
  });

  it("prefills a contenteditable draft", () => {
    const composer = document.createElement("div");
    composer.className = "ProseMirror";
    composer.setAttribute("contenteditable", "true");
    document.body.appendChild(composer);

    const updated = fillProviderDraft(
      "CLAUDE",
      "synthetic PII example for onboarding",
    );

    expect(updated).toBe(true);
    expect(composer.textContent).toBe("synthetic PII example for onboarding");
  });

  it("returns false when no provider input can be found", () => {
    expect(fillProviderDraft("GEMINI", "demo")).toBe(false);
    expect(restoreInputFocus("GEMINI")).toBe(false);
  });
});
