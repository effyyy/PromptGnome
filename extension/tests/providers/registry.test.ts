/**
 * Tests for the provider adapter registry.
 */

import { describe, it, expect } from "vitest";
import {
  getAdapterForUrl,
  getAdapterForHostname
} from "../../src/providers/registry";

describe("getAdapterForUrl", () => {
  it("returns ChatGPT adapter for chatgpt.com conversation URL", () => {
    const adapter = getAdapterForUrl(
      "https://chatgpt.com/backend-api/conversation"
    );
    expect(adapter).not.toBeNull();
    expect(adapter!.name).toBe("CHATGPT");
  });

  it("returns ChatGPT adapter for chat.openai.com conversation URL", () => {
    const adapter = getAdapterForUrl(
      "https://chat.openai.com/backend-api/conversation"
    );
    expect(adapter).not.toBeNull();
    expect(adapter!.name).toBe("CHATGPT");
  });

  it("returns Claude adapter for claude.ai completion URL", () => {
    const adapter = getAdapterForUrl(
      "https://claude.ai/api/organizations/org-123/chat_conversations/conv-456/completion"
    );
    expect(adapter).not.toBeNull();
    expect(adapter!.name).toBe("CLAUDE");
  });

  it("returns Claude adapter for append_message URL", () => {
    const adapter = getAdapterForUrl(
      "https://claude.ai/api/append_message"
    );
    expect(adapter).not.toBeNull();
    expect(adapter!.name).toBe("CLAUDE");
  });

  it("returns Gemini adapter for BardChatUi StreamGenerate URL (current)", () => {
    const adapter = getAdapterForUrl(
      "https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate"
    );
    expect(adapter).not.toBeNull();
    expect(adapter!.name).toBe("GEMINI");
  });

  it("returns Gemini adapter for legacy $rpc/google.internal URL", () => {
    const adapter = getAdapterForUrl(
      "https://gemini.google.com/$rpc/google.internal.GenerateContent"
    );
    expect(adapter).not.toBeNull();
    expect(adapter!.name).toBe("GEMINI");
  });

  it("returns DeepSeek adapter for /api/v0/chat/completions (plural)", () => {
    const adapter = getAdapterForUrl(
      "https://chat.deepseek.com/api/v0/chat/completions"
    );
    expect(adapter).not.toBeNull();
    expect(adapter!.name).toBe("DEEPSEEK");
  });

  it("returns Perplexity adapter for /rest/sse/perplexity_ask (current)", () => {
    const adapter = getAdapterForUrl(
      "https://www.perplexity.ai/rest/sse/perplexity_ask"
    );
    expect(adapter).not.toBeNull();
    expect(adapter!.name).toBe("PERPLEXITY");
  });

  it("returns Grok adapter for grok.com /rest/app-chat/conversations URL", () => {
    const adapter = getAdapterForUrl(
      "https://grok.com/rest/app-chat/conversations/new"
    );
    expect(adapter).not.toBeNull();
    expect(adapter!.name).toBe("GROK");
  });

  it("returns null for a known host but non-matching URL path", () => {
    const adapter = getAdapterForUrl("https://chatgpt.com/api/models");
    expect(adapter).toBeNull();
  });

  it("returns null for an unknown host", () => {
    const adapter = getAdapterForUrl("https://example.com/api/chat");
    expect(adapter).toBeNull();
  });

  it("returns null for a malformed URL", () => {
    const adapter = getAdapterForUrl("not-a-url");
    expect(adapter).toBeNull();
  });
});

describe("getAdapterForHostname", () => {
  it("returns ChatGPT adapter for chatgpt.com", () => {
    const adapter = getAdapterForHostname("chatgpt.com");
    expect(adapter).not.toBeNull();
    expect(adapter!.name).toBe("CHATGPT");
  });

  it("returns ChatGPT adapter for chat.openai.com", () => {
    const adapter = getAdapterForHostname("chat.openai.com");
    expect(adapter).not.toBeNull();
    expect(adapter!.name).toBe("CHATGPT");
  });

  it("returns Claude adapter for claude.ai", () => {
    const adapter = getAdapterForHostname("claude.ai");
    expect(adapter).not.toBeNull();
    expect(adapter!.name).toBe("CLAUDE");
  });

  it("returns Gemini adapter for gemini.google.com", () => {
    const adapter = getAdapterForHostname("gemini.google.com");
    expect(adapter).not.toBeNull();
    expect(adapter!.name).toBe("GEMINI");
  });

  it("returns null for an unknown hostname", () => {
    const adapter = getAdapterForHostname("example.com");
    expect(adapter).toBeNull();
  });
});
