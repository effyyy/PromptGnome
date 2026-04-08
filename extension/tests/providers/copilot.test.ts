/**
 * Tests for the Microsoft Copilot provider adapter.
 */

import { describe, it, expect } from "vitest";
import { copilotAdapter } from "../../src/providers/copilot";
import {
  simpleMessageBody,
  chatMessagesBody,
  multiTurnBody,
  sydneyBody,
  noMessageBody,
  emptyMessagesBody,
  nonJsonBody,
  sseTextChunk,
  sseChatDelta,
  sseDone,
  sseFinalType,
  sseFinishChunk,
  sseMalformed,
  sseEmptyText,
} from "../fixtures/copilot-payloads";

describe("copilotAdapter", () => {
  describe("metadata", () => {
    it("has the correct name", () => {
      expect(copilotAdapter.name).toBe("COPILOT");
    });

    it("matches copilot.microsoft.com hostname", () => {
      const matches = copilotAdapter.hostPatterns.some((p) =>
        p.test("copilot.microsoft.com")
      );
      expect(matches).toBe(true);
    });

    it("does not match unrelated hostnames", () => {
      const matches = copilotAdapter.hostPatterns.some((p) =>
        p.test("bing.com")
      );
      expect(matches).toBe(false);
    });

    it("matches /c/api/chat URL pattern", () => {
      expect(
        copilotAdapter.urlPattern.test("/c/api/chat")
      ).toBe(true);
    });

    it("matches /turing/conversation/chats URL pattern", () => {
      expect(
        copilotAdapter.urlPattern.test("/turing/conversation/chats")
      ).toBe(true);
    });

    it("matches /c/api/conversations URL pattern", () => {
      expect(
        copilotAdapter.urlPattern.test("/c/api/conversations/conv-abc")
      ).toBe(true);
    });

    it("matches /c/api/conversation (singular) URL pattern", () => {
      expect(
        copilotAdapter.urlPattern.test("/c/api/conversation/")
      ).toBe(true);
    });

    it("matches /sydney/ URL pattern (legacy)", () => {
      expect(copilotAdapter.urlPattern.test("/sydney/")).toBe(true);
    });

    it("does not match unrelated paths like /profile", () => {
      expect(copilotAdapter.urlPattern.test("/profile")).toBe(false);
    });
  });

  describe("extractUserMessage", () => {
    it("extracts message from simple direct-message body", () => {
      const result = copilotAdapter.extractUserMessage(simpleMessageBody);
      expect(result).toBe("How do I reverse a linked list?");
    });

    it("extracts last user message from chat messages body", () => {
      const result = copilotAdapter.extractUserMessage(chatMessagesBody);
      expect(result).toBe("Explain dependency injection.");
    });

    it("extracts last user message from multi-turn body", () => {
      const result = copilotAdapter.extractUserMessage(multiTurnBody);
      expect(result).toBe("Give me a JavaScript example.");
    });

    it("extracts message from legacy Sydney arguments format", () => {
      const result = copilotAdapter.extractUserMessage(sydneyBody);
      expect(result).toBe("What is the boiling point of water?");
    });

    it("returns null when no message field exists", () => {
      const result = copilotAdapter.extractUserMessage(noMessageBody);
      expect(result).toBeNull();
    });

    it("returns null for an empty messages array", () => {
      const result = copilotAdapter.extractUserMessage(emptyMessagesBody);
      expect(result).toBeNull();
    });

    it("returns null for a non-JSON body", () => {
      const result = copilotAdapter.extractUserMessage(nonJsonBody);
      expect(result).toBeNull();
    });

    it("returns null for an empty string", () => {
      const result = copilotAdapter.extractUserMessage("");
      expect(result).toBeNull();
    });
  });

  describe("extractResponseText", () => {
    it("extracts text from a direct `text` field SSE chunk", () => {
      const result = copilotAdapter.extractResponseText(sseTextChunk);
      expect(result).toBe(
        "To reverse a linked list, iterate and re-link nodes."
      );
    });

    it("extracts text from OpenAI-compat choices delta", () => {
      const result = copilotAdapter.extractResponseText(sseChatDelta);
      expect(result).toBe(
        "Dependency injection decouples component creation."
      );
    });

    it("returns null for the [DONE] signal", () => {
      const result = copilotAdapter.extractResponseText(sseDone);
      expect(result).toBeNull();
    });

    it("returns null for empty string input", () => {
      const result = copilotAdapter.extractResponseText("");
      expect(result).toBeNull();
    });

    it("returns null for malformed SSE data", () => {
      const result = copilotAdapter.extractResponseText(sseMalformed);
      expect(result).toBeNull();
    });

    it("returns null for SSE with empty text field", () => {
      const result = copilotAdapter.extractResponseText(sseEmptyText);
      expect(result).toBeNull();
    });
  });

  describe("isStreamComplete", () => {
    it("returns true for [DONE] signal", () => {
      expect(copilotAdapter.isStreamComplete(sseDone)).toBe(true);
    });

    it("returns true for `type: final` payload", () => {
      expect(copilotAdapter.isStreamComplete(sseFinalType)).toBe(true);
    });

    it("returns true for a chunk with finish_reason set", () => {
      expect(copilotAdapter.isStreamComplete(sseFinishChunk)).toBe(true);
    });

    it("returns false for a normal text chunk", () => {
      expect(copilotAdapter.isStreamComplete(sseTextChunk)).toBe(false);
    });

    it("returns false for malformed data", () => {
      expect(copilotAdapter.isStreamComplete(sseMalformed)).toBe(false);
    });

    it("returns false for an empty string", () => {
      expect(copilotAdapter.isStreamComplete("")).toBe(false);
    });
  });

  describe("replaceUserMessage", () => {
    it("replaces the message in the simple direct-message body", () => {
      const result = copilotAdapter.replaceUserMessage(
        simpleMessageBody,
        "How do I implement a binary search tree?"
      );
      expect(result).not.toBeNull();
      const parsed = JSON.parse(result as string);
      expect(parsed.message).toBe(
        "How do I implement a binary search tree?"
      );
    });

    it("replaces the last user message in chat messages body", () => {
      const result = copilotAdapter.replaceUserMessage(
        chatMessagesBody,
        "Explain the observer pattern."
      );
      expect(result).not.toBeNull();
      const parsed = JSON.parse(result as string);
      const messages = parsed.messages as Array<{
        role: string;
        content: string;
      }>;
      const lastUser = messages.filter((m) => m.role === "user").pop();
      expect(lastUser?.content).toBe("Explain the observer pattern.");
    });

    it("replaces message in the Sydney arguments format", () => {
      const result = copilotAdapter.replaceUserMessage(
        sydneyBody,
        "What is the melting point of iron?"
      );
      expect(result).not.toBeNull();
      const parsed = JSON.parse(result as string);
      const lastMsg = parsed.arguments[0].messages[
        parsed.arguments[0].messages.length - 1
      ] as { text: string };
      expect(lastMsg.text).toBe("What is the melting point of iron?");
    });

    it("returns null for a non-JSON body", () => {
      expect(
        copilotAdapter.replaceUserMessage(nonJsonBody, "replacement")
      ).toBeNull();
    });

    it("returns null for a body with no recognisable message field", () => {
      expect(
        copilotAdapter.replaceUserMessage(noMessageBody, "replacement")
      ).toBeNull();
    });
  });
});
