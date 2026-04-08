/**
 * Tests for the ChatGPT provider adapter.
 */

import { describe, it, expect } from "vitest";
import { chatgptAdapter } from "../../src/providers/chatgpt";
import {
  validRequestBody,
  editMessageBody,
  multiPartBody,
  emptyMessagesBody,
  nonJsonBody,
  missingPartsBody,
  sseAssistantResponse,
  sseSystemMessage,
  sseDone,
  sseMalformed,
  sseEmptyParts
} from "../fixtures/chatgpt-payloads";

describe("chatgptAdapter", () => {
  describe("metadata", () => {
    it("has the correct name", () => {
      expect(chatgptAdapter.name).toBe("CHATGPT");
    });

    it("matches chatgpt.com hostname", () => {
      const matches = chatgptAdapter.hostPatterns.some((p) =>
        p.test("chatgpt.com")
      );
      expect(matches).toBe(true);
    });

    it("matches chat.openai.com hostname", () => {
      const matches = chatgptAdapter.hostPatterns.some((p) =>
        p.test("chat.openai.com")
      );
      expect(matches).toBe(true);
    });

    it("does not match unrelated hostnames", () => {
      const matches = chatgptAdapter.hostPatterns.some((p) =>
        p.test("claude.ai")
      );
      expect(matches).toBe(false);
    });

    it("matches the conversation URL pattern", () => {
      expect(
        chatgptAdapter.urlPattern.test("/backend-api/conversation")
      ).toBe(true);
    });

    it("matches the conversation URL when query string is present", () => {
      expect(
        chatgptAdapter.urlPattern.test(
          "https://chatgpt.com/backend-api/conversation?client=web"
        )
      ).toBe(true);
    });

    it("matches the full conversation URL without query string", () => {
      expect(
        chatgptAdapter.urlPattern.test(
          "https://chatgpt.com/backend-api/conversation"
        )
      ).toBe(true);
    });

    it("does not match unrelated URL paths", () => {
      expect(
        chatgptAdapter.urlPattern.test("/backend-api/models")
      ).toBe(false);
    });
  });

  describe("extractUserMessage", () => {
    it("extracts message from a valid new-message body", () => {
      const result = chatgptAdapter.extractUserMessage(validRequestBody);
      expect(result).toBe("What is the capital of France?");
    });

    it("extracts the last message from an edit-message body", () => {
      const result = chatgptAdapter.extractUserMessage(editMessageBody);
      expect(result).toBe("Updated question about TypeScript");
    });

    it("extracts the text part from a multipart body", () => {
      const result = chatgptAdapter.extractUserMessage(multiPartBody);
      expect(result).toBe("Describe this image");
    });

    it("returns null for an empty messages array", () => {
      const result = chatgptAdapter.extractUserMessage(emptyMessagesBody);
      expect(result).toBeNull();
    });

    it("returns null for a non-JSON body", () => {
      const result = chatgptAdapter.extractUserMessage(nonJsonBody);
      expect(result).toBeNull();
    });

    it("returns null when content parts are missing", () => {
      const result = chatgptAdapter.extractUserMessage(missingPartsBody);
      expect(result).toBeNull();
    });

    it("returns null for an empty string", () => {
      const result = chatgptAdapter.extractUserMessage("");
      expect(result).toBeNull();
    });
  });

  describe("extractResponseText", () => {
    it("extracts text from a valid assistant SSE chunk", () => {
      const result = chatgptAdapter.extractResponseText(sseAssistantResponse);
      expect(result).toBe("The capital of France is Paris.");
    });

    it("returns null for system message SSE chunks", () => {
      const result = chatgptAdapter.extractResponseText(sseSystemMessage);
      expect(result).toBeNull();
    });

    it("returns null for [DONE] signal", () => {
      const result = chatgptAdapter.extractResponseText(sseDone);
      expect(result).toBeNull();
    });

    it("returns null for malformed SSE data", () => {
      const result = chatgptAdapter.extractResponseText(sseMalformed);
      expect(result).toBeNull();
    });

    it("returns null for SSE with empty content parts", () => {
      const result = chatgptAdapter.extractResponseText(sseEmptyParts);
      expect(result).toBeNull();
    });
  });

  describe("isStreamComplete", () => {
    it("returns true for [DONE] signal", () => {
      expect(chatgptAdapter.isStreamComplete(sseDone)).toBe(true);
    });

    it("returns true for [DONE] with whitespace", () => {
      expect(chatgptAdapter.isStreamComplete("  [DONE]  ")).toBe(true);
    });

    it("returns false for normal SSE data", () => {
      expect(chatgptAdapter.isStreamComplete(sseAssistantResponse)).toBe(
        false
      );
    });

    it("returns false for malformed data", () => {
      expect(chatgptAdapter.isStreamComplete(sseMalformed)).toBe(false);
    });

    it("returns false for an empty string", () => {
      expect(chatgptAdapter.isStreamComplete("")).toBe(false);
    });
  });
});
