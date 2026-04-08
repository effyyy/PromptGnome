/**
 * Tests for the DeepSeek provider adapter.
 */

import { describe, it, expect } from "vitest";
import { deepseekAdapter } from "../../src/providers/deepseek";
import {
  validRequestBody,
  arrayContentBody,
  multiTurnBody,
  lastMessageAssistantBody,
  emptyMessagesBody,
  nonJsonBody,
  missingMessagesBody,
  sseTextDelta,
  sseRoleDelta,
  sseDone,
  sseFinishChunk,
  sseMalformed,
  sseEmptyContent,
} from "../fixtures/deepseek-payloads";

describe("deepseekAdapter", () => {
  describe("metadata", () => {
    it("has the correct name", () => {
      expect(deepseekAdapter.name).toBe("DEEPSEEK");
    });

    it("matches chat.deepseek.com hostname", () => {
      const matches = deepseekAdapter.hostPatterns.some((p) =>
        p.test("chat.deepseek.com")
      );
      expect(matches).toBe(true);
    });

    it("does not match unrelated hostnames", () => {
      const matches = deepseekAdapter.hostPatterns.some((p) =>
        p.test("chatgpt.com")
      );
      expect(matches).toBe(false);
    });

    it("does not match deepseek.com without the chat subdomain", () => {
      const matches = deepseekAdapter.hostPatterns.some((p) =>
        p.test("deepseek.com")
      );
      expect(matches).toBe(false);
    });

    it("matches the chat completions URL pattern (plural)", () => {
      expect(
        deepseekAdapter.urlPattern.test("/api/v0/chat/completions")
      ).toBe(true);
    });

    it("matches the chat completion URL pattern (singular, legacy)", () => {
      expect(
        deepseekAdapter.urlPattern.test("/api/v0/chat/completion")
      ).toBe(true);
    });

    it("matches the full chat completions URL", () => {
      expect(
        deepseekAdapter.urlPattern.test(
          "https://chat.deepseek.com/api/v0/chat/completions"
        )
      ).toBe(true);
    });

    it("matches the chat completions URL with query string", () => {
      expect(
        deepseekAdapter.urlPattern.test("/api/v0/chat/completions?stream=true")
      ).toBe(true);
    });

    it("does not match unrelated URL paths", () => {
      expect(deepseekAdapter.urlPattern.test("/api/v0/models")).toBe(false);
    });

    it("does not match the root path", () => {
      expect(deepseekAdapter.urlPattern.test("/")).toBe(false);
    });
  });

  describe("extractUserMessage", () => {
    it("extracts message from a valid request body", () => {
      const result = deepseekAdapter.extractUserMessage(validRequestBody);
      expect(result).toBe("What is the capital of France?");
    });

    it("extracts text from an array-of-parts content format", () => {
      const result = deepseekAdapter.extractUserMessage(arrayContentBody);
      expect(result).toBe("Explain recursion please.");
    });

    it("extracts the last user message from a multi-turn conversation", () => {
      const result = deepseekAdapter.extractUserMessage(multiTurnBody);
      expect(result).toBe("Explain quicksort.");
    });

    it("returns null when the last message is from the assistant", () => {
      const result = deepseekAdapter.extractUserMessage(lastMessageAssistantBody);
      expect(result).toBeNull();
    });

    it("returns null for an empty messages array", () => {
      const result = deepseekAdapter.extractUserMessage(emptyMessagesBody);
      expect(result).toBeNull();
    });

    it("returns null for a non-JSON body", () => {
      const result = deepseekAdapter.extractUserMessage(nonJsonBody);
      expect(result).toBeNull();
    });

    it("returns null when messages key is missing", () => {
      const result = deepseekAdapter.extractUserMessage(missingMessagesBody);
      expect(result).toBeNull();
    });

    it("returns null for an empty string input", () => {
      const result = deepseekAdapter.extractUserMessage("");
      expect(result).toBeNull();
    });
  });

  describe("extractResponseText", () => {
    it("extracts content from a valid SSE text delta", () => {
      const result = deepseekAdapter.extractResponseText(sseTextDelta);
      expect(result).toBe("Paris is the capital of France.");
    });

    it("returns null for a role-only delta (no content)", () => {
      const result = deepseekAdapter.extractResponseText(sseRoleDelta);
      expect(result).toBeNull();
    });

    it("returns null for the [DONE] signal", () => {
      const result = deepseekAdapter.extractResponseText(sseDone);
      expect(result).toBeNull();
    });

    it("returns null for a finish chunk with empty delta", () => {
      const result = deepseekAdapter.extractResponseText(sseFinishChunk);
      expect(result).toBeNull();
    });

    it("returns null for malformed SSE data", () => {
      const result = deepseekAdapter.extractResponseText(sseMalformed);
      expect(result).toBeNull();
    });

    it("returns null for SSE with empty content string", () => {
      const result = deepseekAdapter.extractResponseText(sseEmptyContent);
      expect(result).toBeNull();
    });

    it("returns null for an empty string", () => {
      const result = deepseekAdapter.extractResponseText("");
      expect(result).toBeNull();
    });
  });

  describe("isStreamComplete", () => {
    it("returns true for [DONE] signal", () => {
      expect(deepseekAdapter.isStreamComplete(sseDone)).toBe(true);
    });

    it("returns true for [DONE] with surrounding whitespace", () => {
      expect(deepseekAdapter.isStreamComplete("  [DONE]  ")).toBe(true);
    });

    it("returns false for a normal SSE text delta", () => {
      expect(deepseekAdapter.isStreamComplete(sseTextDelta)).toBe(false);
    });

    it("returns false for malformed data", () => {
      expect(deepseekAdapter.isStreamComplete(sseMalformed)).toBe(false);
    });

    it("returns false for an empty string", () => {
      expect(deepseekAdapter.isStreamComplete("")).toBe(false);
    });
  });

  describe("replaceUserMessage", () => {
    it("replaces the user message in a valid body", () => {
      const result = deepseekAdapter.replaceUserMessage(
        validRequestBody,
        "What is the capital of Germany?"
      );
      expect(result).not.toBeNull();
      const parsed = JSON.parse(result as string);
      const messages = parsed.messages as Array<{ role: string; content: string }>;
      const lastUser = messages.filter((m) => m.role === "user").pop();
      expect(lastUser?.content).toBe("What is the capital of Germany?");
    });

    it("replaces the last user message in a multi-turn body", () => {
      const result = deepseekAdapter.replaceUserMessage(
        multiTurnBody,
        "Explain merge sort."
      );
      expect(result).not.toBeNull();
      const parsed = JSON.parse(result as string);
      const messages = parsed.messages as Array<{ role: string; content: string }>;
      expect(messages[messages.length - 1].content).toBe("Explain merge sort.");
    });

    it("returns null for a non-JSON body", () => {
      const result = deepseekAdapter.replaceUserMessage(nonJsonBody, "test");
      expect(result).toBeNull();
    });

    it("returns null for an empty messages array", () => {
      const result = deepseekAdapter.replaceUserMessage(emptyMessagesBody, "test");
      expect(result).toBeNull();
    });
  });
});
