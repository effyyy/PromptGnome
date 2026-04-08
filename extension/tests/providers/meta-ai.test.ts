/**
 * Tests for the Meta AI provider adapter.
 */

import { describe, it, expect } from "vitest";
import { metaAiAdapter } from "../../src/providers/meta-ai";
import {
  graphqlMessageBody,
  graphqlTextBody,
  graphqlNestedInputBody,
  directMessageBody,
  noMessageInVariablesBody,
  emptyMessageBody,
  nonJsonBody,
  sseDataTextChunk,
  sseDataMessageContent,
  sseDirectText,
  sseChatDelta,
  sseDone,
  sseTypeComplete,
  sseDoneTrue,
  sseMalformed,
  sseEmptyDataText,
  formEncodedBody,
  formEncodedNoMessage,
} from "../fixtures/meta-ai-payloads";

describe("metaAiAdapter", () => {
  describe("metadata", () => {
    it("has the correct name", () => {
      expect(metaAiAdapter.name).toBe("META_AI");
    });

    it("matches www.meta.ai hostname", () => {
      const matches = metaAiAdapter.hostPatterns.some((p) =>
        p.test("www.meta.ai")
      );
      expect(matches).toBe(true);
    });

    it("matches meta.ai without www", () => {
      const matches = metaAiAdapter.hostPatterns.some((p) =>
        p.test("meta.ai")
      );
      expect(matches).toBe(true);
    });

    it("matches graph.meta.ai hostname (unauthenticated)", () => {
      const matches = metaAiAdapter.hostPatterns.some((p) =>
        p.test("graph.meta.ai")
      );
      expect(matches).toBe(true);
    });

    it("does not match unrelated hostnames", () => {
      const matches = metaAiAdapter.hostPatterns.some((p) =>
        p.test("instagram.com")
      );
      expect(matches).toBe(false);
    });

    it("matches /api/graphql URL pattern", () => {
      expect(metaAiAdapter.urlPattern.test("/api/graphql")).toBe(true);
    });

    it("matches /graphql URL pattern", () => {
      expect(metaAiAdapter.urlPattern.test("/graphql")).toBe(true);
    });

    it("matches /messaging/send URL pattern", () => {
      expect(metaAiAdapter.urlPattern.test("/messaging/send")).toBe(true);
    });

    it("matches full URL with /api/graphql", () => {
      expect(
        metaAiAdapter.urlPattern.test("https://www.meta.ai/api/graphql")
      ).toBe(true);
    });

    it("does not match unrelated paths", () => {
      expect(metaAiAdapter.urlPattern.test("/about")).toBe(false);
    });
  });

  describe("extractUserMessage", () => {
    it("extracts message from form-encoded body (current primary format)", () => {
      const result = metaAiAdapter.extractUserMessage(formEncodedBody);
      expect(result).toBe("What is the Fermi paradox?");
    });

    it("returns null for form-encoded body without message in variables", () => {
      const result = metaAiAdapter.extractUserMessage(formEncodedNoMessage);
      expect(result).toBeNull();
    });

    it("extracts message from JSON GraphQL body with variables.message", () => {
      const result = metaAiAdapter.extractUserMessage(graphqlMessageBody);
      expect(result).toBe("What is the Fermi paradox?");
    });

    it("extracts text from GraphQL body with variables.text", () => {
      const result = metaAiAdapter.extractUserMessage(graphqlTextBody);
      expect(result).toBe("Summarise the history of the internet.");
    });

    it("extracts message from nested variables.input.message", () => {
      const result = metaAiAdapter.extractUserMessage(graphqlNestedInputBody);
      expect(result).toBe("How does HTTPS work?");
    });

    it("extracts message from direct (non-GraphQL) message body", () => {
      const result = metaAiAdapter.extractUserMessage(directMessageBody);
      expect(result).toBe("Tell me a fun fact about octopuses.");
    });

    it("returns null when variables contain no message field", () => {
      const result = metaAiAdapter.extractUserMessage(noMessageInVariablesBody);
      expect(result).toBeNull();
    });

    it("returns null for empty message in variables", () => {
      const result = metaAiAdapter.extractUserMessage(emptyMessageBody);
      expect(result).toBeNull();
    });

    it("returns null for a non-JSON body", () => {
      const result = metaAiAdapter.extractUserMessage(nonJsonBody);
      expect(result).toBeNull();
    });

    it("returns null for an empty string", () => {
      const result = metaAiAdapter.extractUserMessage("");
      expect(result).toBeNull();
    });
  });

  describe("extractResponseText", () => {
    it("extracts text from data.text SSE chunk", () => {
      const result = metaAiAdapter.extractResponseText(sseDataTextChunk);
      expect(result).toBe("The Fermi paradox questions why");
    });

    it("extracts text from data.message.content SSE chunk", () => {
      const result = metaAiAdapter.extractResponseText(sseDataMessageContent);
      expect(result).toBe("we haven't detected alien civilisations.");
    });

    it("extracts text from direct top-level `text` field", () => {
      const result = metaAiAdapter.extractResponseText(sseDirectText);
      expect(result).toBe(
        "Despite billions of stars, the universe seems silent."
      );
    });

    it("extracts content from OpenAI-compat choices delta", () => {
      const result = metaAiAdapter.extractResponseText(sseChatDelta);
      expect(result).toBe("One explanation is the Great Filter hypothesis.");
    });

    it("returns null for the [DONE] signal", () => {
      const result = metaAiAdapter.extractResponseText(sseDone);
      expect(result).toBeNull();
    });

    it("returns null for empty string input", () => {
      const result = metaAiAdapter.extractResponseText("");
      expect(result).toBeNull();
    });

    it("returns null for malformed SSE data", () => {
      const result = metaAiAdapter.extractResponseText(sseMalformed);
      expect(result).toBeNull();
    });

    it("returns null for SSE with empty data.text", () => {
      const result = metaAiAdapter.extractResponseText(sseEmptyDataText);
      expect(result).toBeNull();
    });
  });

  describe("isStreamComplete", () => {
    it("returns true for [DONE] signal", () => {
      expect(metaAiAdapter.isStreamComplete(sseDone)).toBe(true);
    });

    it("returns true for `type: complete` payload", () => {
      expect(metaAiAdapter.isStreamComplete(sseTypeComplete)).toBe(true);
    });

    it("returns true for `done: true` payload", () => {
      expect(metaAiAdapter.isStreamComplete(sseDoneTrue)).toBe(true);
    });

    it("returns false for a normal streaming chunk", () => {
      expect(metaAiAdapter.isStreamComplete(sseDataTextChunk)).toBe(false);
    });

    it("returns false for malformed data", () => {
      expect(metaAiAdapter.isStreamComplete(sseMalformed)).toBe(false);
    });

    it("returns false for an empty string", () => {
      expect(metaAiAdapter.isStreamComplete("")).toBe(false);
    });
  });

  describe("replaceUserMessage", () => {
    it("replaces message.text in a form-encoded body (current primary)", () => {
      const result = metaAiAdapter.replaceUserMessage(
        formEncodedBody,
        "What is the Drake equation?"
      );
      expect(result).not.toBeNull();
      const params = new URLSearchParams(result as string);
      const vars = JSON.parse(params.get("variables") as string);
      expect(vars.message.text).toBe("What is the Drake equation?");
    });

    it("replaces variables.message in a GraphQL body", () => {
      const result = metaAiAdapter.replaceUserMessage(
        graphqlMessageBody,
        "What is the Drake equation?"
      );
      expect(result).not.toBeNull();
      const parsed = JSON.parse(result as string);
      expect(parsed.variables.message).toBe("What is the Drake equation?");
    });

    it("replaces variables.text in a GraphQL body", () => {
      const result = metaAiAdapter.replaceUserMessage(
        graphqlTextBody,
        "Summarise the history of the web."
      );
      expect(result).not.toBeNull();
      const parsed = JSON.parse(result as string);
      expect(parsed.variables.text).toBe("Summarise the history of the web.");
    });

    it("replaces message in the direct (non-GraphQL) format", () => {
      const result = metaAiAdapter.replaceUserMessage(
        directMessageBody,
        "Tell me a fun fact about dolphins."
      );
      expect(result).not.toBeNull();
      const parsed = JSON.parse(result as string);
      expect(parsed.message).toBe("Tell me a fun fact about dolphins.");
    });

    it("returns null for a non-JSON body", () => {
      expect(
        metaAiAdapter.replaceUserMessage(nonJsonBody, "replacement")
      ).toBeNull();
    });

    it("returns null when no message field can be found", () => {
      expect(
        metaAiAdapter.replaceUserMessage(
          noMessageInVariablesBody,
          "replacement"
        )
      ).toBeNull();
    });
  });
});
