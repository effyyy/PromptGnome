/**
 * Tests for the Perplexity provider adapter.
 */

import { describe, it, expect } from "vitest";
import { perplexityAdapter } from "../../src/providers/perplexity";
import {
  sseQueryBody,
  searchQueryBody,
  chatMessagesBody,
  multiTurnChatBody,
  emptyQueryBody,
  emptyMessagesBody,
  nonJsonBody,
  sseOutputChunk,
  sseChatDelta,
  sseLegacyText,
  sseDone,
  sseStatusCompleted,
  sseFinishChunk,
  sseMalformed,
  sseEmptyOutput,
  sseRealStreamChunk,
} from "../fixtures/perplexity-payloads";

describe("perplexityAdapter", () => {
  describe("metadata", () => {
    it("has the correct name", () => {
      expect(perplexityAdapter.name).toBe("PERPLEXITY");
    });

    it("matches www.perplexity.ai hostname", () => {
      const matches = perplexityAdapter.hostPatterns.some((p) =>
        p.test("www.perplexity.ai")
      );
      expect(matches).toBe(true);
    });

    it("matches perplexity.ai without www", () => {
      const matches = perplexityAdapter.hostPatterns.some((p) =>
        p.test("perplexity.ai")
      );
      expect(matches).toBe(true);
    });

    it("does not match unrelated hostnames", () => {
      const matches = perplexityAdapter.hostPatterns.some((p) =>
        p.test("claude.ai")
      );
      expect(matches).toBe(false);
    });

    it("matches /rest/sse/perplexity_ask URL path (current primary)", () => {
      expect(
        perplexityAdapter.urlPattern.test("/rest/sse/perplexity_ask")
      ).toBe(true);
    });

    it("matches full URL with /rest/sse/perplexity_ask", () => {
      expect(
        perplexityAdapter.urlPattern.test(
          "https://www.perplexity.ai/rest/sse/perplexity_ask?version=2.13"
        )
      ).toBe(true);
    });

    it("matches /api/query URL path (legacy)", () => {
      expect(
        perplexityAdapter.urlPattern.test("/api/query/")
      ).toBe(true);
    });

    it("matches /backend-api/ URL path (legacy)", () => {
      expect(
        perplexityAdapter.urlPattern.test("/backend-api/")
      ).toBe(true);
    });

    it("does not match unrelated URL paths", () => {
      expect(perplexityAdapter.urlPattern.test("/profile")).toBe(false);
    });
  });

  describe("extractUserMessage", () => {
    it("extracts message from query_str field (current SSE format)", () => {
      const result = perplexityAdapter.extractUserMessage(sseQueryBody);
      expect(result).toBe("What are the benefits of TypeScript?");
    });

    it("extracts message from legacy search-mode query body", () => {
      const result = perplexityAdapter.extractUserMessage(searchQueryBody);
      expect(result).toBe("What are the benefits of TypeScript?");
    });

    it("extracts last user message from chat messages body", () => {
      const result = perplexityAdapter.extractUserMessage(chatMessagesBody);
      expect(result).toBe("Explain async/await in JavaScript.");
    });

    it("extracts last user message from multi-turn chat body", () => {
      const result = perplexityAdapter.extractUserMessage(multiTurnChatBody);
      expect(result).toBe("How does it compare to Flow?");
    });

    it("returns null for an empty query string", () => {
      const result = perplexityAdapter.extractUserMessage(emptyQueryBody);
      expect(result).toBeNull();
    });

    it("returns null for an empty messages array", () => {
      const result = perplexityAdapter.extractUserMessage(emptyMessagesBody);
      expect(result).toBeNull();
    });

    it("returns null for a non-JSON body", () => {
      const result = perplexityAdapter.extractUserMessage(nonJsonBody);
      expect(result).toBeNull();
    });

    it("returns null for an empty string", () => {
      const result = perplexityAdapter.extractUserMessage("");
      expect(result).toBeNull();
    });
  });

  describe("extractResponseText", () => {
    it("extracts text from an `output` field SSE chunk", () => {
      const result = perplexityAdapter.extractResponseText(sseOutputChunk);
      expect(result).toBe("TypeScript adds static typing to JavaScript.");
    });

    it("extracts text from OpenAI-compat choices delta", () => {
      const result = perplexityAdapter.extractResponseText(sseChatDelta);
      expect(result).toBe("TypeScript is a typed superset.");
    });

    it("extracts text from legacy `text` field", () => {
      const result = perplexityAdapter.extractResponseText(sseLegacyText);
      expect(result).toBe("TypeScript enables better IDE support.");
    });

    it("returns null for the [DONE] signal", () => {
      const result = perplexityAdapter.extractResponseText(sseDone);
      expect(result).toBeNull();
    });

    it("returns null for empty string input", () => {
      const result = perplexityAdapter.extractResponseText("");
      expect(result).toBeNull();
    });

    it("returns null for malformed SSE data", () => {
      const result = perplexityAdapter.extractResponseText(sseMalformed);
      expect(result).toBeNull();
    });

    it("returns null for SSE with empty output field", () => {
      const result = perplexityAdapter.extractResponseText(sseEmptyOutput);
      expect(result).toBeNull();
    });

    it("extracts text from real streaming chunk with status+text format", () => {
      const result = perplexityAdapter.extractResponseText(sseRealStreamChunk);
      expect(result).toBe("TypeScript adds static typing to JavaScript.");
    });
  });

  describe("isStreamComplete", () => {
    it("returns true for [DONE] signal", () => {
      expect(perplexityAdapter.isStreamComplete(sseDone)).toBe(true);
    });

    it("returns true for status: completed payload", () => {
      expect(perplexityAdapter.isStreamComplete(sseStatusCompleted)).toBe(true);
    });

    it("returns true for a finish_reason chunk", () => {
      expect(perplexityAdapter.isStreamComplete(sseFinishChunk)).toBe(true);
    });

    it("returns false for a normal output chunk", () => {
      expect(perplexityAdapter.isStreamComplete(sseOutputChunk)).toBe(false);
    });

    it("returns false for malformed data", () => {
      expect(perplexityAdapter.isStreamComplete(sseMalformed)).toBe(false);
    });

    it("returns false for an empty string", () => {
      expect(perplexityAdapter.isStreamComplete("")).toBe(false);
    });
  });

  describe("replaceUserMessage", () => {
    it("replaces the query_str in current SSE format body", () => {
      const result = perplexityAdapter.replaceUserMessage(
        sseQueryBody,
        "What are the downsides of TypeScript?"
      );
      expect(result).not.toBeNull();
      const parsed = JSON.parse(result as string);
      expect(parsed.query_str).toBe("What are the downsides of TypeScript?");
    });

    it("replaces the query in legacy search-mode body", () => {
      const result = perplexityAdapter.replaceUserMessage(
        searchQueryBody,
        "What are the downsides of TypeScript?"
      );
      expect(result).not.toBeNull();
      const parsed = JSON.parse(result as string);
      expect(parsed.query).toBe("What are the downsides of TypeScript?");
    });

    it("replaces the last user message in chat messages body", () => {
      const result = perplexityAdapter.replaceUserMessage(
        chatMessagesBody,
        "Explain generators in JavaScript."
      );
      expect(result).not.toBeNull();
      const parsed = JSON.parse(result as string);
      const messages = parsed.messages as Array<{ role: string; content: string }>;
      const lastUser = messages.filter((m) => m.role === "user").pop();
      expect(lastUser?.content).toBe("Explain generators in JavaScript.");
    });

    it("returns null for a non-JSON body", () => {
      expect(
        perplexityAdapter.replaceUserMessage(nonJsonBody, "replacement")
      ).toBeNull();
    });
  });
});
