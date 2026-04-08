/**
 * Perplexity provider adapter.
 *
 * Handles request/response parsing for www.perplexity.ai. Perplexity supports
 * both direct-chat and search-augmented queries, using fetch-based SSE streams.
 * Request bodies contain either a `query` string (search mode) or a `messages`
 * array (chat mode). Both variants are handled here.
 *
 * Architecture layer: Providers
 */

import type { BaseProviderAdapter, ValidationResult } from "./base-adapter";
import { safeParse, isObject } from "./parse-helpers";
import { PROVIDER_NAMES } from "~src/shared/constants";

/**
 * Provider adapter for Perplexity (www.perplexity.ai).
 */
export const perplexityAdapter: BaseProviderAdapter = {
  name: PROVIDER_NAMES.PERPLEXITY,

  hostPatterns: [/^(?:www\.)?perplexity\.ai$/],

  urlPattern: /\/(?:rest\/sse\/perplexity_ask|api\/query|backend-api\/|rest\/default-2\/query)(?:\?|$|\/)/,

  /**
   * Extract the user's message from the Perplexity POST body.
   *
   * Perplexity uses multiple body formats:
   * 1. SSE endpoint: `query_str` string field (current primary format at /rest/sse/perplexity_ask)
   * 2. Search/query mode: `query` string field (legacy)
   * 3. Chat mode: `messages` array (OpenAI-compatible), last user entry
   *
   * @param body - Raw request body string (JSON).
   * @returns The extracted message text, or `null` if extraction fails.
   */
  extractUserMessage(body: string): string | null {
    const parsed = safeParse(body);
    if (!isObject(parsed)) return null;

    // Format 1: `query_str` field (current SSE endpoint format)
    const queryStr = parsed["query_str"];
    if (typeof queryStr === "string" && queryStr.length > 0) {
      return queryStr;
    }

    // Format 2: direct `query` field (legacy search mode)
    const query = parsed["query"];
    if (typeof query === "string" && query.length > 0) {
      return query;
    }

    // Format 3: OpenAI-compatible `messages` array (chat mode)
    const messages = parsed["messages"];
    if (Array.isArray(messages) && messages.length > 0) {
      // Walk backwards to find the last user message
      for (let i = messages.length - 1; i >= 0; i--) {
        const msg: unknown = messages[i];
        if (!isObject(msg)) continue;
        if (msg["role"] !== "user") continue;

        const content = msg["content"];
        if (typeof content === "string" && content.length > 0) {
          return content;
        }
      }
    }

    return null;
  },

  /**
   * Extract response text from a Perplexity SSE data chunk.
   *
   * Perplexity SSE events may carry incremental text in several locations:
   * - `output` string (search summary chunks)
   * - `choices[0].delta.content` (chat-mode chunks, OpenAI-compatible)
   * - `text` string (legacy format)
   *
   * @param sseData - The raw `data:` payload from an SSE line.
   * @param _eventType - Unused.
   * @returns The extracted text fragment, or `null` if not a text event.
   */
  extractResponseText(sseData: string, _eventType?: string): string | null {
    const trimmed = sseData.trim();
    if (trimmed === "[DONE]" || trimmed === "") return null;

    const parsed = safeParse(trimmed);
    if (!isObject(parsed)) return null;

    // Format 1: `output` field (search/summarisation stream)
    const output = parsed["output"];
    if (typeof output === "string" && output.length > 0) {
      return output;
    }

    // Format 2: OpenAI-compatible `choices[0].delta.content`
    const choices = parsed["choices"];
    if (Array.isArray(choices) && choices.length > 0) {
      const first: unknown = choices[0];
      if (isObject(first)) {
        const delta = first["delta"];
        if (isObject(delta)) {
          const content = delta["content"];
          if (typeof content === "string" && content.length > 0) {
            return content;
          }
        }
      }
    }

    // Format 3: legacy `text` field
    const text = parsed["text"];
    if (typeof text === "string" && text.length > 0) {
      return text;
    }

    return null;
  },

  /**
   * Check if the Perplexity SSE stream is complete.
   *
   * Perplexity uses `[DONE]` (OpenAI-compatible) or a JSON object with
   * `status: "completed"` to signal stream completion.
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

    if (parsed["status"] === "completed") return true;

    // OpenAI-compat: finish_reason present and non-null
    const choices = parsed["choices"];
    if (Array.isArray(choices) && choices.length > 0) {
      const first: unknown = choices[0];
      if (isObject(first) && first["finish_reason"] != null) {
        return true;
      }
    }

    return false;
  },

  submitButtonSelectors: ['button[type="submit"]', 'button[aria-label="Send"]'],

  fileInputSelectors: ['input[type="file"]'],

  /**
   * Validate the structural shape of a Perplexity request payload.
   *
   * Accepts `query_str` (current SSE format), `query` (legacy search mode),
   * or a `messages` array (chat mode). At least one must be present.
   *
   * @param body - Raw request body string to validate.
   * @returns A {@link ValidationResult} with the outcome of schema checks.
   */
  validateRequestPayload(body: string): ValidationResult {
    const parsed = safeParse(body);
    if (!isObject(parsed)) {
      return { valid: false, reason: "body is not valid JSON object", failedCheck: "request_shape" };
    }

    const queryStr = parsed["query_str"];
    if (typeof queryStr === "string" && queryStr.length > 0) {
      return { valid: true };
    }

    const query = parsed["query"];
    if (typeof query === "string" && query.length > 0) {
      return { valid: true };
    }

    const messages = parsed["messages"];
    if (Array.isArray(messages) && messages.length > 0) {
      return { valid: true };
    }

    return { valid: false, reason: "missing query_str, query, or messages field", failedCheck: "request_shape" };
  },

  /**
   * Validate the structural shape of a Perplexity SSE response chunk.
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
   * Replace the user's message in the Perplexity POST body.
   *
   * Handles both `query` (search mode) and `messages` array (chat mode)
   * body formats.
   *
   * @param body - The original raw request body string (JSON).
   * @param newMessage - The replacement message text.
   * @returns The full modified body string, or `null` on parse failure.
   */
  replaceUserMessage(body: string, newMessage: string): string | null {
    try {
      const parsed = JSON.parse(body) as Record<string, unknown>;

      // Format 1: replace `query_str` field (current SSE format)
      if (typeof parsed["query_str"] === "string") {
        parsed["query_str"] = newMessage;
        return JSON.stringify(parsed);
      }

      // Format 2: replace `query` field (legacy)
      if (typeof parsed["query"] === "string") {
        parsed["query"] = newMessage;
        return JSON.stringify(parsed);
      }

      // Format 3: replace last user message in `messages` array
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

      return null;
    } catch {
      return null;
    }
  },
};
