/**
 * Microsoft Copilot provider adapter.
 *
 * Handles request/response parsing for copilot.microsoft.com. Copilot uses
 * Microsoft's proprietary conversation API under `/c/api/conversations` or
 * the legacy Sydney endpoint under `/sydney/`. Request bodies carry the user
 * message in a `message` string field or nested inside a `messages` array.
 * Responses stream as SSE or JSON-lines.
 *
 * Architecture layer: Providers
 */

import type { BaseProviderAdapter, ValidationResult } from "./base-adapter";
import { safeParse, isObject } from "./parse-helpers";
import { PROVIDER_NAMES } from "~src/shared/constants";

/**
 * Walk a nested object looking for the first occurrence of a given key.
 *
 * Used to locate `text` values inside Microsoft's deeply-nested Copilot
 * response payloads without having to hard-code every possible path.
 *
 * @param value - The value to search.
 * @param key - The key to find.
 * @param maxDepth - Maximum recursion depth.
 * @returns The first string value found under `key`, or `null`.
 */
function findKey(value: unknown, key: string, maxDepth: number): string | null {
  if (maxDepth <= 0) return null;

  if (isObject(value)) {
    if (key in value && typeof value[key] === "string" && (value[key] as string).length > 0) {
      return value[key] as string;
    }
    for (const child of Object.values(value)) {
      const found = findKey(child, key, maxDepth - 1);
      if (found !== null) return found;
    }
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findKey(item, key, maxDepth - 1);
      if (found !== null) return found;
    }
  }

  return null;
}

/**
 * Provider adapter for Microsoft Copilot (copilot.microsoft.com).
 *
 * Copilot's primary chat transport is WebSocket (SignalR protocol), which
 * the current interceptor cannot capture (only fetch is patched). This
 * adapter handles fetch-based REST endpoints that Copilot may still use:
 * `/c/api/conversations`, `/c/api/chat`, `/turing/conversation/chats`,
 * and the legacy Sydney endpoint `/sydney/`.
 *
 * Because Microsoft's payload schema is proprietary and changes frequently,
 * extraction falls back progressively from known paths to recursive
 * key-scanning.
 */
export const copilotAdapter: BaseProviderAdapter = {
  name: PROVIDER_NAMES.COPILOT,

  hostPatterns: [
    /^copilot\.microsoft\.com$/,
    /^.*\.copilot\.microsoft\.com$/,
    /^.*\.bing\.com$/,
  ],

  urlPattern: /\/(?:c\/api\/(?:conversations?|chat|messages?|threads?)|turing\/conversation\/chats|sydney\/|api\/(?:chat|conversation|messages?)|chat\/completions)(?:[^?#]*)?(?:\?|$|\/|#)/,

  /**
   * Extract the user's message from a Copilot POST body.
   *
   * Microsoft's Copilot API uses several fetch-based request shapes:
   * 1. `{ message: string }` — simple direct-chat format.
   * 2. `{ messages: [{role, content}] }` — OpenAI-style array.
   * 3. `{ arguments: [{messages: [{text: string}]}] }` — Sydney/legacy BingChat.
   *
   * @param body - Raw request body string (JSON).
   * @returns The extracted message text, or `null` if extraction fails.
   */
  extractUserMessage(body: string): string | null {
    const parsed = safeParse(body);
    if (!isObject(parsed)) return null;

    // Format 1: direct `message` string
    const message = parsed["message"];
    if (typeof message === "string" && message.length > 0) return message;

    // Format 2: OpenAI-compatible `messages` array
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

    // Format 3: Sydney/legacy `arguments[0].messages[last].text`
    const args = parsed["arguments"];
    if (Array.isArray(args) && args.length > 0) {
      const firstArg: unknown = args[0];
      if (isObject(firstArg)) {
        const argMessages = firstArg["messages"];
        if (Array.isArray(argMessages) && argMessages.length > 0) {
          const last: unknown = argMessages[argMessages.length - 1];
          if (isObject(last)) {
            const text = last["text"];
            if (typeof text === "string" && text.length > 0) return text;
          }
        }
      }
    }

    return null;
  },

  /**
   * Extract response text from a Copilot SSE data chunk.
   *
   * Copilot SSE response chunks may use:
   * - `{ text: string }` — direct text chunk.
   * - `{ choices: [{delta: {content: string}}] }` — OpenAI-compat.
   * - Deeply nested `messages[last].text` in the Sydney format.
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

    // Format 1: direct `text` string
    const text = parsed["text"];
    if (typeof text === "string" && text.length > 0) return text;

    // Format 2: OpenAI-compat `choices[0].delta.content`
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

    // Format 3: recursive scan for the last `text` key (Sydney format)
    return findKey(parsed, "text", 5);
  },

  /**
   * Check if the Copilot SSE stream is complete.
   *
   * Copilot uses `[DONE]`, a `finish_reason` on the last choices entry, or
   * a top-level `{ type: "final" }` object to signal completion.
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

    if (parsed["type"] === "final") return true;

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
   * Validate the structural shape of a Copilot request payload.
   *
   * Accepts `{ message }`, `{ messages }`, or `{ arguments }` (Sydney format).
   * At least one of these must be present with meaningful content.
   *
   * @param body - Raw request body string to validate.
   * @returns A {@link ValidationResult} with the outcome of schema checks.
   */
  validateRequestPayload(body: string): ValidationResult {
    const parsed = safeParse(body);
    if (!isObject(parsed)) {
      return { valid: false, reason: "body is not valid JSON object", failedCheck: "request_shape" };
    }

    // Format 1: direct message string
    if (typeof parsed["message"] === "string" && (parsed["message"] as string).length > 0) {
      return { valid: true };
    }

    // Format 2: messages array
    const messages = parsed["messages"];
    if (Array.isArray(messages) && messages.length > 0) {
      return { valid: true };
    }

    // Format 3: Sydney arguments array
    const args = parsed["arguments"];
    if (Array.isArray(args) && args.length > 0) {
      return { valid: true };
    }

    return { valid: false, reason: "missing message, messages, or arguments field", failedCheck: "request_shape" };
  },

  /**
   * Validate the structural shape of a Copilot SSE response chunk.
   *
   * Accepts `[DONE]`, `{ type: "final" }`, and any JSON-parseable object.
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
   * Replace the user's message in the Copilot POST body.
   *
   * Handles the three known body formats in priority order.
   *
   * @param body - The original raw request body string (JSON).
   * @param newMessage - The replacement message text.
   * @returns The full modified body string, or `null` on parse failure.
   * @throws Never — all errors are caught and return `null`.
   */
  replaceUserMessage(body: string, newMessage: string): string | null {
    try {
      const parsed = JSON.parse(body) as Record<string, unknown>;

      // Format 1: direct `message` string
      if (typeof parsed["message"] === "string") {
        parsed["message"] = newMessage;
        return JSON.stringify(parsed);
      }

      // Format 2: OpenAI-compat `messages` array
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

      // Format 3: Sydney `arguments[0].messages[last].text`
      const args = parsed["arguments"];
      if (Array.isArray(args) && args.length > 0) {
        const firstArg = args[0] as Record<string, unknown>;
        const argMessages = firstArg["messages"];
        if (Array.isArray(argMessages) && argMessages.length > 0) {
          const last = argMessages[argMessages.length - 1] as Record<string, unknown>;
          if (typeof last["text"] === "string") {
            last["text"] = newMessage;
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
