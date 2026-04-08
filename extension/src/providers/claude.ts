/**
 * Claude provider adapter.
 *
 * Handles request/response parsing for claude.ai. The conversation API
 * uses POST to a URL containing `/completion` (with dynamic org and
 * conversation IDs) and responds with typed SSE events.
 *
 * Architecture layer: Providers
 */

import type { BaseProviderAdapter, ValidationResult } from "./base-adapter";
import { safeParse, isObject } from "./parse-helpers";
import { PROVIDER_NAMES } from "~src/shared/constants";

/**
 * Provider adapter for Claude (claude.ai).
 */
export const claudeAdapter: BaseProviderAdapter = {
  name: PROVIDER_NAMES.CLAUDE,

  hostPatterns: [/^claude\.ai$/],

  urlPattern: /\/(?:completion|append_message)(?:\?|$)/,

  /**
   * Extract the user's message from the Claude POST body.
   *
   * Claude's web API sends the user prompt in one of these locations:
   * 1. `completion.prompt` — nested inside a `completion` object (current format)
   * 2. `text` — top-level text field (used alongside `completion`)
   * 3. `prompt` — top-level prompt field (legacy format)
   *
   * @param body - Raw request body string (JSON).
   * @returns The extracted message text, or `null` if extraction fails.
   */
  extractUserMessage(body: string): string | null {
    const parsed = safeParse(body);
    if (!isObject(parsed)) return null;

    // Format 1: nested `completion.prompt` (current primary format)
    const completion = parsed["completion"];
    if (isObject(completion)) {
      const prompt = completion["prompt"];
      if (typeof prompt === "string" && prompt.length > 0) {
        return prompt;
      }
    }

    // Format 2: top-level `text` field (sent alongside completion object)
    const text = parsed["text"];
    if (typeof text === "string" && text.length > 0) {
      return text;
    }

    // Format 3: top-level `prompt` field (legacy format)
    const prompt = parsed["prompt"];
    if (typeof prompt === "string" && prompt.length > 0) {
      return prompt;
    }

    return null;
  },

  /**
   * Extract response text from a Claude SSE data chunk.
   *
   * Claude uses typed SSE events. Text content arrives in
   * `content_block_delta` events with `delta.type === "text_delta"`
   * and the text in `delta.text`.
   */
  extractResponseText(sseData: string, eventType?: string): string | null {
    if (eventType !== "content_block_delta") return null;

    const trimmed = sseData.trim();
    const parsed = safeParse(trimmed);
    if (!isObject(parsed)) return null;

    // Verify this is the correct event type in the payload too
    if (parsed["type"] !== "content_block_delta") return null;

    const delta = parsed["delta"];
    if (!isObject(delta)) return null;

    if (delta["type"] !== "text_delta") return null;

    const text = delta["text"];
    return typeof text === "string" ? text : null;
  },

  /**
   * Check if the SSE stream is complete.
   *
   * Claude signals completion with a `message_stop` event type.
   */
  isStreamComplete(sseData: string, eventType?: string): boolean {
    if (eventType === "message_stop") return true;

    // Also check the payload itself for the stop signal
    const trimmed = sseData.trim();
    const parsed = safeParse(trimmed);
    if (isObject(parsed) && parsed["type"] === "message_stop") return true;

    return false;
  },

  submitButtonSelectors: ['button[aria-label="Send Message"]', 'button.send-message-button'],

  fileInputSelectors: ['input[type="file"]'],

  /**
   * Validate the structural shape of a Claude request payload.
   *
   * Accepts three formats:
   * 1. `completion.prompt` — nested prompt string inside a completion object
   * 2. `text` — top-level text field
   * 3. `prompt` — top-level prompt field (legacy)
   *
   * @param body - Raw request body string to validate.
   * @returns A {@link ValidationResult} with the outcome of schema checks.
   */
  validateRequestPayload(body: string): ValidationResult {
    const parsed = safeParse(body);
    if (!isObject(parsed)) {
      return { valid: false, reason: "body is not valid JSON object", failedCheck: "request_shape" };
    }

    // Format 1: completion.prompt
    const completion = parsed["completion"];
    if (isObject(completion) && typeof completion["prompt"] === "string" && (completion["prompt"] as string).length > 0) {
      return { valid: true };
    }

    // Format 2: top-level text
    if (typeof parsed["text"] === "string" && (parsed["text"] as string).length > 0) {
      return { valid: true };
    }

    // Format 3: top-level prompt (legacy)
    if (typeof parsed["prompt"] === "string" && (parsed["prompt"] as string).length > 0) {
      return { valid: true };
    }

    return { valid: false, reason: "missing prompt in completion.prompt, text, or prompt field", failedCheck: "request_shape" };
  },

  /**
   * Validate the structural shape of a Claude SSE response chunk.
   *
   * Accepts any JSON-parseable object (Claude uses typed SSE events) or
   * known stream markers.
   *
   * @param chunk - Raw SSE data chunk string to validate.
   * @returns A {@link ValidationResult} with the outcome of schema checks.
   */
  validateResponseChunk(chunk: string): ValidationResult {
    const trimmed = chunk.trim();
    // Claude uses event: message_stop as terminator; data may be empty or JSON
    if (trimmed === "" || trimmed === "message_stop") return { valid: true };

    const parsed = safeParse(trimmed);
    if (!isObject(parsed)) {
      return { valid: false, reason: "response chunk is not valid JSON object", failedCheck: "response_shape" };
    }

    return { valid: true };
  },

  /**
   * Replace the user's message in the Claude POST body.
   *
   * Handles three formats in priority order:
   * 1. `completion.prompt` — nested prompt (also updates top-level `text` if present)
   * 2. `text` — top-level text field
   * 3. `prompt` — top-level prompt field (legacy)
   *
   * @param body - The original raw request body string (JSON).
   * @param newMessage - The replacement message text.
   * @returns The full modified body string, or `null` on parse failure.
   */
  replaceUserMessage(body: string, newMessage: string): string | null {
    try {
      const parsed = JSON.parse(body) as Record<string, unknown>;

      // Format 1: completion.prompt (also sync text if present)
      const completion = parsed["completion"];
      if (typeof completion === "object" && completion !== null && !Array.isArray(completion)) {
        const comp = completion as Record<string, unknown>;
        if (typeof comp["prompt"] === "string") {
          comp["prompt"] = newMessage;
          // Keep top-level `text` in sync if it exists
          if (typeof parsed["text"] === "string") {
            parsed["text"] = newMessage;
          }
          return JSON.stringify(parsed);
        }
      }

      // Format 2: top-level text
      if (typeof parsed["text"] === "string") {
        parsed["text"] = newMessage;
        return JSON.stringify(parsed);
      }

      // Format 3: top-level prompt (legacy)
      if (typeof parsed["prompt"] === "string") {
        parsed["prompt"] = newMessage;
        return JSON.stringify(parsed);
      }

      return null;
    } catch {
      return null;
    }
  }
};
