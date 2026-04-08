/**
 * Tests for the Gemini provider adapter.
 */

import { describe, it, expect } from "vitest";
import { geminiAdapter } from "../../src/providers/gemini";
import {
  validRequestBodyPath0200,
  validRequestBodyPath020,
  validRequestBodyPath200,
  deepNestedBody,
  bootstrapBatchexecuteBody,
  bootstrapBatchexecuteShortBody,
  chatBatchexecuteEnvelopeBody,
  whitespaceOnlyBody,
  emptyArrayBody,
  nonJsonBody,
  objectBody,
  sseResponsePath00,
  sseResponsePath0200,
  sseEmptyArray,
  sseNull,
  sseEmpty,
  sseNumericData,
  sseMalformed,
  sseNestedEmpty,
  formEncodedBody,
  realStreamGenerateBody,
  formEncodedNoFreq,
} from "../fixtures/gemini-payloads";

describe("geminiAdapter", () => {
  describe("metadata", () => {
    it("has the correct name", () => {
      expect(geminiAdapter.name).toBe("GEMINI");
    });

    it("matches gemini.google.com hostname", () => {
      const matches = geminiAdapter.hostPatterns.some((p) =>
        p.test("gemini.google.com")
      );
      expect(matches).toBe(true);
    });

    it("does not match unrelated hostnames", () => {
      const matches = geminiAdapter.hostPatterns.some((p) =>
        p.test("claude.ai")
      );
      expect(matches).toBe(false);
    });

    it("matches BardChatUi StreamGenerate URL (current primary)", () => {
      expect(
        geminiAdapter.urlPattern.test(
          "https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate"
        )
      ).toBe(true);
    });

    it("matches BardChatUi BardFrontendService URL", () => {
      expect(
        geminiAdapter.urlPattern.test(
          "https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService"
        )
      ).toBe(true);
    });

    it("matches $rpc/google.internal URL pattern (legacy)", () => {
      expect(
        geminiAdapter.urlPattern.test(
          "https://gemini.google.com/$rpc/google.internal.something"
        )
      ).toBe(true);
    });

    it("matches BardChatUi batchexecute URL (current primary)", () => {
      expect(
        geminiAdapter.urlPattern.test(
          "https://gemini.google.com/_/BardChatUi/data/batchexecute?rpcids=xyz"
        )
      ).toBe(true);
    });

    it("matches GeminiChatUi batchexecute URL", () => {
      expect(
        geminiAdapter.urlPattern.test(
          "https://gemini.google.com/_/GeminiChatUi/data/batchexecute?rpcids=xyz"
        )
      ).toBe(true);
    });

    it("matches GeminiChatUi StreamGenerate URL", () => {
      expect(
        geminiAdapter.urlPattern.test(
          "https://gemini.google.com/_/GeminiChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate"
        )
      ).toBe(true);
    });

    it("does not match unrelated URLs", () => {
      expect(
        geminiAdapter.urlPattern.test("https://google.com/search")
      ).toBe(false);
    });
  });

  describe("extractUserMessage", () => {
    it("extracts message from form-encoded f.req body (current BardChatUi)", () => {
      const result = geminiAdapter.extractUserMessage(formEncodedBody);
      expect(result).toBe("How do I write a Python function?");
    });

    it("extracts message from real BardChatUi StreamGenerate envelope [null, '<json>']", () => {
      const result = geminiAdapter.extractUserMessage(realStreamGenerateBody);
      expect(result).toBe("What is the meaning of life?");
    });

    it("returns null for form-encoded body without f.req", () => {
      const result = geminiAdapter.extractUserMessage(formEncodedNoFreq);
      expect(result).toBeNull();
    });
  });

  describe("replaceUserMessage", () => {
    it("rewrites the user message inside a real form-encoded StreamGenerate body", () => {
      const replaced = geminiAdapter.replaceUserMessage(
        realStreamGenerateBody,
        "[REDACTED]"
      );
      expect(replaced).not.toBeNull();
      // Other params and the at token must be preserved verbatim.
      expect(replaced!.endsWith("&at=token")).toBe(true);
      // Round-trip: extracting from the rewritten body must yield the new text.
      expect(geminiAdapter.extractUserMessage(replaced!)).toBe("[REDACTED]");
      // Original text must no longer appear anywhere in the body.
      expect(replaced!.includes("meaning%20of%20life")).toBe(false);
      expect(replaced!.includes("meaning of life")).toBe(false);
    });

    it("preserves params containing characters that need encoding (e.g. @)", () => {
      // Build a body whose user message contains an @ — the case that
      // most obviously broke the old raw substring path.
      const body = `f.req=${encodeURIComponent(
        JSON.stringify([
          null,
          JSON.stringify([
            ["email me at jane@example.com", 0, null, null, null, null, 0],
            ["en-GB"],
            ["c", "r", "rc", null, null, null, null, null, null, ""],
            "!t",
          ]),
        ])
      )}&at=tok`;

      const replaced = geminiAdapter.replaceUserMessage(body, "email me at [EMAIL_1]");
      expect(replaced).not.toBeNull();
      expect(geminiAdapter.extractUserMessage(replaced!)).toBe("email me at [EMAIL_1]");
      expect(replaced!.includes("jane%40example.com")).toBe(false);
    });

    it("extracts message at path [0,2,0,0]", () => {
      const result = geminiAdapter.extractUserMessage(
        validRequestBodyPath0200
      );
      expect(result).toBe("How do I write a Python function?");
    });

    it("extracts message at path [0,2,0]", () => {
      const result = geminiAdapter.extractUserMessage(
        validRequestBodyPath020
      );
      expect(result).toBe("Tell me about machine learning");
    });

    it("extracts message at path [2,0,0]", () => {
      const result = geminiAdapter.extractUserMessage(
        validRequestBodyPath200
      );
      expect(result).toBe("What is recursion?");
    });

    it("returns null for deeply nested bodies without the chat-envelope signature", () => {
      // Pre-fix this returned the deeply-nested string via the recursive
      // findFirstString fallback. That fallback was the source of the
      // bootstrap-blocking false positives that broke Gemini's init.
      const result = geminiAdapter.extractUserMessage(deepNestedBody);
      expect(result).toBeNull();
    });

    it("returns null for bootstrap batchexecute envelopes (regression: black screen)", () => {
      // Realistic bootstrap RPC body. If this returns non-null, the XHR
      // interceptor will defer the request waiting for an overlay decision
      // and Gemini's bootstrap will hang — producing the black-screen bug.
      const result = geminiAdapter.extractUserMessage(bootstrapBatchexecuteBody);
      expect(result).toBeNull();
    });

    it("returns null for short batchexecute envelopes whose first element is the rpcid", () => {
      const result = geminiAdapter.extractUserMessage(bootstrapBatchexecuteShortBody);
      expect(result).toBeNull();
    });

    it("extracts message from chat send wrapped in a batchexecute envelope (variant C)", () => {
      const result = geminiAdapter.extractUserMessage(chatBatchexecuteEnvelopeBody);
      expect(result).toBe("What is recursion?");
    });

    it("returns null when the extracted candidate is whitespace-only", () => {
      const result = geminiAdapter.extractUserMessage(whitespaceOnlyBody);
      expect(result).toBeNull();
    });

    it("returns null for an empty array body", () => {
      const result = geminiAdapter.extractUserMessage(emptyArrayBody);
      expect(result).toBeNull();
    });

    it("returns null for a non-JSON body", () => {
      const result = geminiAdapter.extractUserMessage(nonJsonBody);
      expect(result).toBeNull();
    });

    it("returns null for an unexpected object body", () => {
      const result = geminiAdapter.extractUserMessage(objectBody);
      expect(result).toBeNull();
    });

    it("returns null for an empty string", () => {
      const result = geminiAdapter.extractUserMessage("");
      expect(result).toBeNull();
    });
  });

  describe("extractResponseText", () => {
    it("extracts text from path [0,0] response", () => {
      const result = geminiAdapter.extractResponseText(sseResponsePath00);
      expect(result).toBe("Here is how you write a Python function:");
    });

    it("extracts text from path [0,2,0,0] response", () => {
      const result = geminiAdapter.extractResponseText(sseResponsePath0200);
      expect(result).toBe("def hello(): print('hello')");
    });

    it("returns null for numeric-only data", () => {
      const result = geminiAdapter.extractResponseText(sseNumericData);
      expect(result).toBeNull();
    });

    it("returns null for malformed data", () => {
      const result = geminiAdapter.extractResponseText(sseMalformed);
      expect(result).toBeNull();
    });

    it("returns null for nested empty arrays", () => {
      const result = geminiAdapter.extractResponseText(sseNestedEmpty);
      expect(result).toBeNull();
    });
  });

  describe("isStreamComplete", () => {
    it("returns true for an empty array", () => {
      expect(geminiAdapter.isStreamComplete(sseEmptyArray)).toBe(true);
    });

    it("returns true for null payload", () => {
      expect(geminiAdapter.isStreamComplete(sseNull)).toBe(true);
    });

    it("returns true for an empty string", () => {
      expect(geminiAdapter.isStreamComplete(sseEmpty)).toBe(true);
    });

    it("returns false for a normal response chunk", () => {
      expect(geminiAdapter.isStreamComplete(sseResponsePath00)).toBe(false);
    });

    it("returns false for malformed data", () => {
      expect(geminiAdapter.isStreamComplete(sseMalformed)).toBe(false);
    });
  });
});
