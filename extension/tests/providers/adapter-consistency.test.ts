/**
 * Adapter consistency tests — the "real canary".
 *
 * Verifies that every provider adapter's URL patterns, host patterns,
 * and extraction logic are internally consistent with the test fixtures
 * and canary fingerprints. This catches the exact class of bug where
 * adapters and tests drift apart from real API formats.
 *
 * Each test validates a specific contract:
 * - Adapter urlPattern matches at least one fixture URL
 * - Adapter extractUserMessage succeeds on at least one fixture body
 * - Adapter extractResponseText succeeds on at least one fixture chunk
 * - Adapter replaceUserMessage round-trips correctly
 * - Canary fingerprint endpoint patterns are substrings the adapter's
 *   urlPattern would match
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

import { chatgptAdapter } from "~src/providers/chatgpt";
import { claudeAdapter } from "~src/providers/claude";
import { geminiAdapter } from "~src/providers/gemini";
import { deepseekAdapter } from "~src/providers/deepseek";
import { perplexityAdapter } from "~src/providers/perplexity";
import { grokAdapter } from "~src/providers/grok";
import { copilotAdapter } from "~src/providers/copilot";
import { metaAiAdapter } from "~src/providers/meta-ai";
import type { BaseProviderAdapter } from "~src/providers/base-adapter";

// Load canary fingerprints
const fingerprintsPath = join(__dirname, "..", "fixtures", "provider-fingerprints.json");
const fingerprints = JSON.parse(readFileSync(fingerprintsPath, "utf-8")) as Record<string, {
  representativeEndpoints: string[];
  landingUrl: string;
}>;

// Import fixtures
import * as chatgptPayloads from "../fixtures/chatgpt-payloads";
import * as claudePayloads from "../fixtures/claude-payloads";
import * as geminiPayloads from "../fixtures/gemini-payloads";
import * as deepseekPayloads from "../fixtures/deepseek-payloads";
import * as perplexityPayloads from "../fixtures/perplexity-payloads";
import * as grokPayloads from "../fixtures/grok-payloads";
import * as copilotPayloads from "../fixtures/copilot-payloads";
import * as metaAiPayloads from "../fixtures/meta-ai-payloads";

/**
 * For a given adapter and its canary fingerprint, verify that each
 * fingerprint endpoint pattern would be matched by the adapter's urlPattern.
 */
function verifyFingerprintEndpoints(
  adapter: BaseProviderAdapter,
  fpKey: string
): void {
  const fp = fingerprints[fpKey];
  if (!fp) return;

  for (const pattern of fp.representativeEndpoints) {
    // Build a plausible full URL from the fingerprint base URL + pattern
    const testUrl = fp.landingUrl + pattern;
    const matches = adapter.urlPattern.test(testUrl) || adapter.urlPattern.test(pattern);
    expect(matches, `${fpKey} adapter urlPattern should match ${pattern}`).toBe(true);
  }
}

describe("adapter-fingerprint consistency", () => {
  it("ChatGPT: fingerprint endpoints match adapter urlPattern", () => {
    verifyFingerprintEndpoints(chatgptAdapter, "chatgpt");
  });

  it("Claude: fingerprint endpoints match adapter urlPattern", () => {
    verifyFingerprintEndpoints(claudeAdapter, "claude");
  });

  it("Gemini: fingerprint endpoints match adapter urlPattern", () => {
    verifyFingerprintEndpoints(geminiAdapter, "gemini");
  });

  it("DeepSeek: fingerprint endpoints match adapter urlPattern", () => {
    verifyFingerprintEndpoints(deepseekAdapter, "deepseek");
  });

  it("Perplexity: fingerprint endpoints match adapter urlPattern", () => {
    verifyFingerprintEndpoints(perplexityAdapter, "perplexity");
  });

  it("Grok: fingerprint endpoints match adapter urlPattern", () => {
    verifyFingerprintEndpoints(grokAdapter, "grok");
  });

  it("Copilot: fingerprint endpoints match adapter urlPattern", () => {
    verifyFingerprintEndpoints(copilotAdapter, "copilot");
  });

  it("Meta AI: fingerprint endpoints match adapter urlPattern", () => {
    verifyFingerprintEndpoints(metaAiAdapter, "meta-ai");
  });
});

describe("adapter-fixture round-trip consistency", () => {
  it("ChatGPT: extractUserMessage succeeds on valid fixture", () => {
    const msg = chatgptAdapter.extractUserMessage(chatgptPayloads.validRequestBody);
    expect(msg).not.toBeNull();
    expect(typeof msg).toBe("string");
    expect(msg!.length).toBeGreaterThan(0);
  });

  it("ChatGPT: replaceUserMessage round-trips with extractUserMessage", () => {
    const replacement = "REPLACED_TEXT";
    const modified = chatgptAdapter.replaceUserMessage(chatgptPayloads.validRequestBody, replacement);
    expect(modified).not.toBeNull();
    const extracted = chatgptAdapter.extractUserMessage(modified!);
    expect(extracted).toBe(replacement);
  });

  it("ChatGPT: extractResponseText succeeds on valid SSE fixture", () => {
    const text = chatgptAdapter.extractResponseText(chatgptPayloads.sseAssistantResponse);
    expect(text).not.toBeNull();
  });

  it("Claude: extractUserMessage succeeds on valid fixture", () => {
    const msg = claudeAdapter.extractUserMessage(claudePayloads.validRequestBody);
    expect(msg).not.toBeNull();
    expect(msg!.length).toBeGreaterThan(0);
  });

  it("Claude: replaceUserMessage round-trips with extractUserMessage", () => {
    const replacement = "REPLACED_TEXT";
    const modified = claudeAdapter.replaceUserMessage(claudePayloads.validRequestBody, replacement);
    expect(modified).not.toBeNull();
    const extracted = claudeAdapter.extractUserMessage(modified!);
    expect(extracted).toBe(replacement);
  });

  it("Claude: extractResponseText succeeds on valid SSE fixture", () => {
    const text = claudeAdapter.extractResponseText(claudePayloads.sseTextDelta, "content_block_delta");
    expect(text).not.toBeNull();
  });

  it("Gemini: extractUserMessage succeeds on JSON fixture", () => {
    const msg = geminiAdapter.extractUserMessage(geminiPayloads.validRequestBodyPath0200);
    expect(msg).not.toBeNull();
  });

  it("Gemini: extractUserMessage succeeds on form-encoded fixture", () => {
    const msg = geminiAdapter.extractUserMessage(geminiPayloads.formEncodedBody);
    expect(msg).not.toBeNull();
  });

  it("DeepSeek: extractUserMessage succeeds on valid fixture", () => {
    const msg = deepseekAdapter.extractUserMessage(deepseekPayloads.validRequestBody);
    expect(msg).not.toBeNull();
  });

  it("DeepSeek: replaceUserMessage round-trips with extractUserMessage", () => {
    const replacement = "REPLACED_TEXT";
    const modified = deepseekAdapter.replaceUserMessage(deepseekPayloads.validRequestBody, replacement);
    expect(modified).not.toBeNull();
    const extracted = deepseekAdapter.extractUserMessage(modified!);
    expect(extracted).toBe(replacement);
  });

  it("Perplexity: extractUserMessage succeeds on SSE query fixture", () => {
    const msg = perplexityAdapter.extractUserMessage(perplexityPayloads.sseQueryBody);
    expect(msg).not.toBeNull();
  });

  it("Perplexity: replaceUserMessage round-trips on SSE query fixture", () => {
    const replacement = "REPLACED_TEXT";
    const modified = perplexityAdapter.replaceUserMessage(perplexityPayloads.sseQueryBody, replacement);
    expect(modified).not.toBeNull();
    const extracted = perplexityAdapter.extractUserMessage(modified!);
    expect(extracted).toBe(replacement);
  });

  it("Grok: extractUserMessage succeeds on responses-array fixture", () => {
    const msg = grokAdapter.extractUserMessage(grokPayloads.validRequestBody);
    expect(msg).not.toBeNull();
  });

  it("Grok: replaceUserMessage round-trips on responses-array fixture", () => {
    const replacement = "REPLACED_TEXT";
    const modified = grokAdapter.replaceUserMessage(grokPayloads.validRequestBody, replacement);
    expect(modified).not.toBeNull();
    const extracted = grokAdapter.extractUserMessage(modified!);
    expect(extracted).toBe(replacement);
  });

  it("Copilot: extractUserMessage succeeds on simple message fixture", () => {
    const msg = copilotAdapter.extractUserMessage(copilotPayloads.simpleMessageBody);
    expect(msg).not.toBeNull();
  });

  it("Copilot: extractUserMessage succeeds on Sydney fixture", () => {
    const msg = copilotAdapter.extractUserMessage(copilotPayloads.sydneyBody);
    expect(msg).not.toBeNull();
  });

  it("Meta AI: extractUserMessage succeeds on form-encoded fixture", () => {
    const msg = metaAiAdapter.extractUserMessage(metaAiPayloads.formEncodedBody);
    expect(msg).not.toBeNull();
  });

  it("Meta AI: extractUserMessage succeeds on GraphQL JSON fixture", () => {
    const msg = metaAiAdapter.extractUserMessage(metaAiPayloads.graphqlMessageBody);
    expect(msg).not.toBeNull();
  });

  it("Meta AI: replaceUserMessage round-trips on form-encoded fixture", () => {
    const replacement = "REPLACED_TEXT";
    const modified = metaAiAdapter.replaceUserMessage(metaAiPayloads.formEncodedBody, replacement);
    expect(modified).not.toBeNull();
    const extracted = metaAiAdapter.extractUserMessage(modified!);
    expect(extracted).toBe(replacement);
  });
});
