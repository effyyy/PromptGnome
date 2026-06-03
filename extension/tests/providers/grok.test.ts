/**
 * Tests for the Grok provider adapter.
 */

import { describe, it, expect } from "vitest";
import { grokAdapter } from "../../src/providers/grok";
import {
  validRequestBody,
  multiTurnBody,
  messagesFormatBody,
  embeddedFormatBody,
  emptyMessagesBody,
  lastMessageAssistantBody,
  nonJsonBody,
  sseChatDelta,
  sseTokenChunk,
  sseRoleDelta,
  sseDone,
  sseFinishChunk,
  sseMalformed,
  sseEmptyContent,
} from "../fixtures/grok-payloads";

describe("grokAdapter", () => {
  describe("metadata", () => {
    it("has the correct name", () => {
      expect(grokAdapter.name).toBe("GROK");
    });

    it("matches grok.com hostname", () => {
      const matches = grokAdapter.hostPatterns.some((p) => p.test("grok.com"));
      expect(matches).toBe(true);
    });

    it("does not match unrelated hostnames", () => {
      const matches = grokAdapter.hostPatterns.some((p) =>
        p.test("chatgpt.com")
      );
      expect(matches).toBe(false);
    });

    it("does not match x.com (embedded Grok no longer supported)", () => {
      const matches = grokAdapter.hostPatterns.some((p) => p.test("x.com"));
      expect(matches).toBe(false);
    });

    it("matches /rest/app-chat/conversations URL (grok.com primary)", () => {
      expect(grokAdapter.urlPattern.test("/rest/app-chat/conversations/new")).toBe(true);
    });

    it("matches /2/grok/add_response.json URL (X surface)", () => {
      expect(grokAdapter.urlPattern.test("/2/grok/add_response.json")).toBe(true);
    });

    it("matches /api/chat URL pattern (legacy)", () => {
      expect(grokAdapter.urlPattern.test("/api/chat")).toBe(true);
    });

    it("matches /api/rpc/chat URL pattern (legacy)", () => {
      expect(grokAdapter.urlPattern.test("/api/rpc/chat")).toBe(true);
    });

    it("does not match /api/auth or other non-chat paths", () => {
      expect(grokAdapter.urlPattern.test("/api/auth/login")).toBe(false);
    });
  });

  describe("extractUserMessage", () => {
    it("extracts user message from responses array (current primary format)", () => {
      const result = grokAdapter.extractUserMessage(validRequestBody);
      expect(result).toBe("What is the speed of light?");
    });

    it("extracts the last message from a multi-turn responses body", () => {
      const result = grokAdapter.extractUserMessage(multiTurnBody);
      expect(result).toBe("Tell me about black holes.");
    });

    it("extracts user message from legacy messages-array body", () => {
      const result = grokAdapter.extractUserMessage(messagesFormatBody);
      expect(result).toBe("What is the speed of light?");
    });

    it("extracts message from the embedded top-level `message` format", () => {
      const result = grokAdapter.extractUserMessage(embeddedFormatBody);
      expect(result).toBe("Summarise the latest tech news.");
    });

    it("returns null for an empty messages array", () => {
      const result = grokAdapter.extractUserMessage(emptyMessagesBody);
      expect(result).toBeNull();
    });

    it("extracts the last user message even when an assistant message follows it", () => {
      const result = grokAdapter.extractUserMessage(lastMessageAssistantBody);
      expect(result).toBe("Hi");
    });

    it("returns null for a non-JSON body", () => {
      const result = grokAdapter.extractUserMessage(nonJsonBody);
      expect(result).toBeNull();
    });

    it("returns null for an empty string", () => {
      const result = grokAdapter.extractUserMessage("");
      expect(result).toBeNull();
    });
  });

  describe("extractResponseText", () => {
    it("extracts content from OpenAI-compat choices delta", () => {
      const result = grokAdapter.extractResponseText(sseChatDelta);
      expect(result).toBe("Light travels at 299,792 km/s.");
    });

    it("extracts text from top-level `token` field", () => {
      const result = grokAdapter.extractResponseText(sseTokenChunk);
      expect(result).toBe(" in a vacuum.");
    });

    it("returns null for a role-only delta (no content)", () => {
      const result = grokAdapter.extractResponseText(sseRoleDelta);
      expect(result).toBeNull();
    });

    it("returns null for the [DONE] signal", () => {
      const result = grokAdapter.extractResponseText(sseDone);
      expect(result).toBeNull();
    });

    it("returns null for a finish chunk with empty delta", () => {
      const result = grokAdapter.extractResponseText(sseFinishChunk);
      expect(result).toBeNull();
    });

    it("returns null for malformed SSE data", () => {
      const result = grokAdapter.extractResponseText(sseMalformed);
      expect(result).toBeNull();
    });

    it("returns null for SSE with empty content string", () => {
      const result = grokAdapter.extractResponseText(sseEmptyContent);
      expect(result).toBeNull();
    });

    it("returns null for empty string input", () => {
      const result = grokAdapter.extractResponseText("");
      expect(result).toBeNull();
    });
  });

  describe("isStreamComplete", () => {
    it("returns true for [DONE] signal", () => {
      expect(grokAdapter.isStreamComplete(sseDone)).toBe(true);
    });

    it("returns true for [DONE] with surrounding whitespace", () => {
      expect(grokAdapter.isStreamComplete("  [DONE]  ")).toBe(true);
    });

    it("returns true for a chunk with finish_reason set", () => {
      expect(grokAdapter.isStreamComplete(sseFinishChunk)).toBe(true);
    });

    it("returns false for a normal chat delta", () => {
      expect(grokAdapter.isStreamComplete(sseChatDelta)).toBe(false);
    });

    it("returns false for malformed data", () => {
      expect(grokAdapter.isStreamComplete(sseMalformed)).toBe(false);
    });

    it("returns false for an empty string", () => {
      expect(grokAdapter.isStreamComplete("")).toBe(false);
    });
  });

  describe("replaceUserMessage", () => {
    it("replaces the message in a responses-array body (current primary)", () => {
      const result = grokAdapter.replaceUserMessage(
        validRequestBody,
        "What is the speed of sound?"
      );
      expect(result).not.toBeNull();
      const parsed = JSON.parse(result as string);
      const responses = parsed.responses as Array<{ message: string }>;
      expect(responses[responses.length - 1].message).toBe(
        "What is the speed of sound?"
      );
    });

    it("replaces the user message in a legacy messages-array body", () => {
      const result = grokAdapter.replaceUserMessage(
        messagesFormatBody,
        "What is the speed of sound?"
      );
      expect(result).not.toBeNull();
      const parsed = JSON.parse(result as string);
      const messages = parsed.messages as Array<{ role: string; content: string }>;
      expect(messages[messages.length - 1].content).toBe(
        "What is the speed of sound?"
      );
    });

    it("replaces message in the embedded top-level format", () => {
      const result = grokAdapter.replaceUserMessage(
        embeddedFormatBody,
        "Summarise the latest science news."
      );
      expect(result).not.toBeNull();
      const parsed = JSON.parse(result as string);
      expect(parsed.message).toBe("Summarise the latest science news.");
    });

    it("returns null for a non-JSON body", () => {
      expect(
        grokAdapter.replaceUserMessage(nonJsonBody, "replacement")
      ).toBeNull();
    });

    it("returns null for an empty messages array", () => {
      expect(
        grokAdapter.replaceUserMessage(emptyMessagesBody, "replacement")
      ).toBeNull();
    });
  });
});
