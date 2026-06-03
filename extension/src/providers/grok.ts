/**
 * Grok provider adapter.
 *
 * Handles request/response parsing for grok.com. Grok uses an OpenAI-like
 * messages-array format with SSE streaming.
 *
 * Architecture layer: Providers
 */

import type { BaseProviderAdapter, ValidationResult } from "./base-adapter";
import { safeParse, isObject } from "./parse-helpers";
import { PROVIDER_NAMES } from "~src/shared/constants";

/**
 * Provider adapter for Grok (grok.com).
 *
 * The API format is OpenAI-like but with Grok-specific field names.
 */
export const grokAdapter: BaseProviderAdapter = {
  name: PROVIDER_NAMES.GROK,

  hostPatterns: [/^grok\.com$/],

  urlPattern: /\/(?:rest\/app-chat\/conversations|2\/grok\/add_response\.json|api\/(?:rpc\/)?(?:chat|conversation|completions?))(?:\?|$|\/)/,

  /**
   * Extract the user's latest message from the Grok POST body.
   *
   * Grok has multiple request formats depending on the surface:
   * 1. X (Twitter) surface: `responses` array with `{ message, sender }` objects
   * 2. grok.com standalone: `responses` array (same format) or `messages` array
   * 3. Legacy: top-level `message` string
   *
   * @param body - Raw request body string (JSON).
   * @returns The extracted message text, or `null` if extraction fails.
   */
  extractUserMessage(body: string): string | null {
    const parsed = safeParse(body);
    if (!isObject(parsed)) return null;

    // Format 1: `responses` array (X surface / grok.com — current primary format)
    const responses = parsed["responses"];
    if (Array.isArray(responses) && responses.length > 0) {
      // Walk backwards to find the last user response (sender === 1 means user)
      for (let i = responses.length - 1; i >= 0; i--) {
        const resp: unknown = responses[i];
        if (!isObject(resp)) continue;
        const message = resp["message"];
        if (typeof message === "string" && message.length > 0) return message;
      }
    }

    // Format 2: `messages` array (OpenAI-like fallback)
    const messages = parsed["messages"];
    if (Array.isArray(messages) && messages.length > 0) {
      for (let i = messages.length - 1; i >= 0; i--) {
        const msg: unknown = messages[i];
        if (!isObject(msg)) continue;
        if (msg["role"] !== "user") continue;

        const content = msg["content"];
        if (typeof content === "string" && content.length > 0) return content;
      }
    }

    // Format 3: top-level `message` string (legacy / simplified)
    const message = parsed["message"];
    if (typeof message === "string" && message.length > 0) return message;

    return null;
  },

  /**
   * Extract response text from a Grok SSE data chunk.
   *
   * The interceptor only tees SSE (text/event-stream) responses. Grok may
   * also use JSONL streaming (not teed), so this only handles SSE formats:
   * 1. OpenAI-compatible `choices[0].delta.content`
   * 2. Top-level `token` string
   *
   * @param sseData - The raw `data:` payload from an SSE line.
   * @param _eventType - Unused (Grok does not use named SSE events).
   * @returns The extracted text fragment, or `null` if not a text event.
   */
  extractResponseText(sseData: string, _eventType?: string): string | null {
    const trimmed = sseData.trim();
    if (trimmed === "[DONE]" || trimmed === "") return null;

    const parsed = safeParse(trimmed);
    if (!isObject(parsed)) return null;

    // Format 1: OpenAI-compatible `choices[0].delta.content`
    const choices = parsed["choices"];
    if (Array.isArray(choices) && choices.length > 0) {
      const first: unknown = choices[0];
      if (isObject(first)) {
        const delta = first["delta"];
        if (isObject(delta)) {
          const content = delta["content"];
          if (typeof content === "string" && content.length > 0) return content;
        }
      }
    }

    // Format 2: top-level `token` string
    const token = parsed["token"];
    if (typeof token === "string" && token.length > 0) return token;

    return null;
  },

  /**
   * Check if the Grok SSE stream is complete.
   *
   * Grok uses `[DONE]` (OpenAI-compatible). Some response variants also
   * include a `finish_reason` on the last choices entry.
   *
   * @param sseData - The raw `data:` payload from an SSE line.
   * @param _eventType - Unused.
   * @returns `true` when the stream is complete.
   */
  isStreamComplete(sseData: string, _eventType?: string): boolean {
    const trimmed = sseData.trim();
    if (trimmed === "[DONE]") return true;

    const parsed = safeParse(trimmed);
    if (!isObject(parsed)) return false;

    const choices = parsed["choices"];
    if (Array.isArray(choices) && choices.length > 0) {
      const first: unknown = choices[0];
      if (isObject(first) && first["finish_reason"] != null) return true;
    }

    return false;
  },

  submitButtonSelectors: ['button[type="submit"]', 'button[aria-label="Send"]'],

  fileInputSelectors: ['input[type="file"]'],

  /**
   * Validate the structural shape of a Grok request payload.
   *
   * Accepts:
   * 1. `responses` array (X/grok.com primary format)
   * 2. `messages` array (OpenAI-like fallback)
   * 3. Top-level `message` string (legacy)
   *
   * @param body - Raw request body string to validate.
   * @returns A {@link ValidationResult} with the outcome of schema checks.
   */
  validateRequestPayload(body: string): ValidationResult {
    const parsed = safeParse(body);
    if (!isObject(parsed)) {
      return { valid: false, reason: "body is not valid JSON object", failedCheck: "request_shape" };
    }

    const responses = parsed["responses"];
    if (Array.isArray(responses) && responses.length > 0) {
      return { valid: true };
    }

    const messages = parsed["messages"];
    if (Array.isArray(messages) && messages.length > 0) {
      return { valid: true };
    }

    const message = parsed["message"];
    if (typeof message === "string" && message.length > 0) {
      return { valid: true };
    }

    return { valid: false, reason: "missing responses, messages array, or message string", failedCheck: "request_shape" };
  },

  /**
   * Validate the structural shape of a Grok SSE response chunk.
   *
   * Accepts `[DONE]` and any JSON-parseable object.
   *
   * @param chunk - Raw SSE data chunk string to validate.
   * @returns A {@link ValidationResult} with the outcome of schema checks.
   */
  validateResponseChunk(chunk: string): ValidationResult {
    const trimmed = chunk.trim();
    if (trimmed === "[DONE]" || trimmed === "") return { valid: true };

    const parsed = safeParse(trimmed);
    if (!isObject(parsed)) {
      return { valid: false, reason: "response chunk is not valid JSON object", failedCheck: "response_shape" };
    }

    return { valid: true };
  },

  /**
   * Replace the user's message in the Grok POST body.
   *
   * Handles both the `messages` array format and the top-level `message`
   * string format used in embedded contexts.
   *
   * @param body - The original raw request body string (JSON).
   * @param newMessage - The replacement message text.
   * @returns The full modified body string, or `null` on parse failure.
   * @throws Never — all errors are caught and return `null`.
   */
  replaceUserMessage(body: string, newMessage: string): string | null {
    try {
      const parsed = JSON.parse(body) as Record<string, unknown>;

      // Format 1: `responses` array (X / grok.com primary)
      const responses = parsed["responses"];
      if (Array.isArray(responses) && responses.length > 0) {
        for (let i = responses.length - 1; i >= 0; i--) {
          const resp = responses[i] as Record<string, unknown>;
          if (typeof resp["message"] === "string") {
            resp["message"] = newMessage;
            return JSON.stringify(parsed);
          }
        }
      }

      // Format 2: `messages` array (OpenAI-like fallback)
      const messages = parsed["messages"];
      if (Array.isArray(messages)) {
        for (let i = messages.length - 1; i >= 0; i--) {
          const msg = messages[i] as Record<string, unknown>;
          if (msg["role"] === "user" && typeof msg["content"] === "string") {
            msg["content"] = newMessage;
            return JSON.stringify(parsed);
          }
        }
      }

      // Format 3: top-level `message` string (legacy)
      if (typeof parsed["message"] === "string") {
        parsed["message"] = newMessage;
        return JSON.stringify(parsed);
      }

      return null;
    } catch {
      return null;
    }
  },
};
