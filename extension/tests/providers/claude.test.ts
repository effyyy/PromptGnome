/**
 * Tests for the Claude provider adapter.
 */

import { describe, it, expect } from "vitest";
import { claudeAdapter } from "../../src/providers/claude";
import {
  validRequestBody,
  legacyPromptBody,
  textFieldBody,
  emptyPromptBody,
  missingPromptBody,
  nonJsonBody,
  wrongTypePromptBody,
  sseTextDelta,
  sseThinkingDelta,
  sseContentBlockStart,
  sseMessageStop,
  sseMessageDelta,
  sseMalformed,
  ssePing
} from "../fixtures/claude-payloads";

describe("claudeAdapter", () => {
  describe("metadata", () => {
    it("has the correct name", () => {
      expect(claudeAdapter.name).toBe("CLAUDE");
    });

    it("matches claude.ai hostname", () => {
      const matches = claudeAdapter.hostPatterns.some((p) =>
        p.test("claude.ai")
      );
      expect(matches).toBe(true);
    });

    it("does not match unrelated hostnames", () => {
      const matches = claudeAdapter.hostPatterns.some((p) =>
        p.test("chatgpt.com")
      );
      expect(matches).toBe(false);
    });

    it("matches completion URL with dynamic segments", () => {
      const url =
        "/api/organizations/org-123/chat_conversations/conv-456/completion";
      expect(claudeAdapter.urlPattern.test(url)).toBe(true);
    });

    it("matches the completion URL when query string is present", () => {
      expect(
        claudeAdapter.urlPattern.test(
          "https://claude.ai/api/organizations/org-abc/chat_conversations/conv-xyz/completion?sync=true"
        )
      ).toBe(true);
    });

    it("matches the completion URL without query string", () => {
      expect(
        claudeAdapter.urlPattern.test(
          "https://claude.ai/api/organizations/org-abc/chat_conversations/conv-xyz/completion"
        )
      ).toBe(true);
    });

    it("matches the append_message endpoint", () => {
      expect(
        claudeAdapter.urlPattern.test(
          "https://claude.ai/api/append_message"
        )
      ).toBe(true);
    });

    it("does not match non-completion URLs", () => {
      expect(claudeAdapter.urlPattern.test("/api/models")).toBe(false);
    });
  });

  describe("extractUserMessage", () => {
    it("extracts prompt from completion.prompt (current format)", () => {
      const result = claudeAdapter.extractUserMessage(validRequestBody);
      expect(result).toBe("Explain quantum computing in simple terms");
    });

    it("extracts prompt from legacy top-level prompt field", () => {
      const result = claudeAdapter.extractUserMessage(legacyPromptBody);
      expect(result).toBe("Explain quantum computing in simple terms");
    });

    it("extracts from top-level text field (append_message format)", () => {
      const result = claudeAdapter.extractUserMessage(textFieldBody);
      expect(result).toBe("Explain quantum computing in simple terms");
    });

    it("returns null for an empty prompt", () => {
      const result = claudeAdapter.extractUserMessage(emptyPromptBody);
      expect(result).toBeNull();
    });

    it("returns null when prompt field is missing", () => {
      const result = claudeAdapter.extractUserMessage(missingPromptBody);
      expect(result).toBeNull();
    });

    it("returns null for a non-JSON body", () => {
      const result = claudeAdapter.extractUserMessage(nonJsonBody);
      expect(result).toBeNull();
    });

    it("returns null when prompt is the wrong type", () => {
      const result = claudeAdapter.extractUserMessage(wrongTypePromptBody);
      expect(result).toBeNull();
    });

    it("returns null for an empty string", () => {
      const result = claudeAdapter.extractUserMessage("");
      expect(result).toBeNull();
    });
  });

  describe("extractResponseText", () => {
    it("extracts text from a content_block_delta event", () => {
      const result = claudeAdapter.extractResponseText(
        sseTextDelta,
        "content_block_delta"
      );
      expect(result).toBe("Quantum computing uses ");
    });

    it("returns null for thinking delta events", () => {
      const result = claudeAdapter.extractResponseText(
        sseThinkingDelta,
        "content_block_delta"
      );
      expect(result).toBeNull();
    });

    it("returns null for content_block_start events", () => {
      const result = claudeAdapter.extractResponseText(
        sseContentBlockStart,
        "content_block_start"
      );
      expect(result).toBeNull();
    });

    it("returns null when eventType is missing", () => {
      const result = claudeAdapter.extractResponseText(sseTextDelta);
      expect(result).toBeNull();
    });

    it("returns null for message_delta events", () => {
      const result = claudeAdapter.extractResponseText(
        sseMessageDelta,
        "message_delta"
      );
      expect(result).toBeNull();
    });

    it("returns null for malformed SSE data", () => {
      const result = claudeAdapter.extractResponseText(
        sseMalformed,
        "content_block_delta"
      );
      expect(result).toBeNull();
    });

    it("returns null for ping events", () => {
      const result = claudeAdapter.extractResponseText(ssePing, "ping");
      expect(result).toBeNull();
    });
  });

  describe("isStreamComplete", () => {
    it("returns true for message_stop event type", () => {
      expect(
        claudeAdapter.isStreamComplete(sseMessageStop, "message_stop")
      ).toBe(true);
    });

    it("returns true when payload type is message_stop", () => {
      expect(claudeAdapter.isStreamComplete(sseMessageStop)).toBe(true);
    });

    it("returns false for content_block_delta events", () => {
      expect(
        claudeAdapter.isStreamComplete(sseTextDelta, "content_block_delta")
      ).toBe(false);
    });

    it("returns false for ping events", () => {
      expect(claudeAdapter.isStreamComplete(ssePing, "ping")).toBe(false);
    });

    it("returns false for malformed data", () => {
      expect(claudeAdapter.isStreamComplete(sseMalformed)).toBe(false);
    });
  });
});
