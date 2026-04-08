/**
 * DeepSeek provider adapter.
 *
 * Handles request/response parsing for chat.deepseek.com. DeepSeek follows
 * the OpenAI-compatible chat-completion format: POST to `/api/v0/chat/completion`
 * with a `messages` array body and an OpenAI-compatible SSE stream response.
 *
 * Architecture layer: Providers
 */

import type { BaseProviderAdapter, ValidationResult } from "./base-adapter";
import { safeParse, isObject } from "./parse-helpers";
import { PROVIDER_NAMES } from "~src/shared/constants";

/**
 * Extract text content from an OpenAI-compatible message object.
 *
 * Handles both plain-string `content` and array-of-parts `content` formats
 * that some OpenAI-compatible APIs use.
 *
 * @param message - The message object to extract from.
 * @returns The text content, or `null` if not found.
 */
function extractMessageContent(message: Record<string, unknown>): string | null {
  const content = message["content"];

  if (typeof content === "string" && content.length > 0) {
    return content;
  }

  // Array-of-parts format (some OpenAI-compat providers use this)
  if (Array.isArray(content)) {
    for (const part of content) {
      if (isObject(part) && part["type"] === "text" && typeof part["text"] === "string" && part["text"].length > 0) {
        return part["text"] as string;
      }
      if (typeof part === "string" && part.length > 0) {
        return part;
      }
    }
  }

  return null;
}

/**
 * Provider adapter for DeepSeek (chat.deepseek.com).
 */
export const deepseekAdapter: BaseProviderAdapter = {
  name: PROVIDER_NAMES.DEEPSEEK,

  hostPatterns: [/^chat\.deepseek\.com$/],

  urlPattern: /\/api\/v\d+\/chat\/completions?(?:\?|$|\/)/,

  /**
   * Extract the user's latest message from the DeepSeek POST body.
   *
   * DeepSeek uses an OpenAI-compatible format with a `messages` array.
   * The last entry in the array is the user's current message.
   *
   * @param body - Raw request body string (JSON).
   * @returns The extracted message text, or `null` if extraction fails.
   */
  extractUserMessage(body: string): string | null {
    const parsed = safeParse(body);
    if (!isObject(parsed)) return null;

    const messages = parsed["messages"];
    if (!Array.isArray(messages) || messages.length === 0) return null;

    const lastMessage: unknown = messages[messages.length - 1];
    if (!isObject(lastMessage)) return null;

    // Only extract from user-role messages
    if (lastMessage["role"] !== "user") return null;

    return extractMessageContent(lastMessage);
  },

  /**
   * Extract response text from a DeepSeek SSE data chunk.
   *
   * DeepSeek follows the OpenAI SSE format: each `data:` line contains JSON
   * with a `choices[0].delta.content` path containing the text fragment.
   *
   * @param sseData - The raw `data:` payload from an SSE line.
   * @param _eventType - Unused (DeepSeek does not use named SSE events).
   * @returns The extracted text fragment, or `null` if not a text event.
   */
  extractResponseText(sseData: string, _eventType?: string): string | null {
    const trimmed = sseData.trim();
    if (trimmed === "[DONE]") return null;

    const parsed = safeParse(trimmed);
    if (!isObject(parsed)) return null;

    const choices = parsed["choices"];
    if (!Array.isArray(choices) || choices.length === 0) return null;

    const firstChoice: unknown = choices[0];
    if (!isObject(firstChoice)) return null;

    const delta = firstChoice["delta"];
    if (!isObject(delta)) return null;

    const content = delta["content"];
    return typeof content === "string" && content.length > 0 ? content : null;
  },

  /**
   * Check if the DeepSeek SSE stream is complete.
   *
   * DeepSeek signals stream completion with the standard OpenAI `[DONE]` marker.
   *
   * @param sseData - The raw `data:` payload from an SSE line.
   * @param _eventType - Unused.
   * @returns `true` when the stream is complete.
   */
  isStreamComplete(sseData: string, _eventType?: string): boolean {
    return sseData.trim() === "[DONE]";
  },

  submitButtonSelectors: ['button[type="submit"]', 'button[aria-label="Send"]'],

  fileInputSelectors: ['input[type="file"]'],

  /**
   * Validate the structural shape of a DeepSeek request payload.
   *
   * Checks that the body is valid JSON with a non-empty `messages` array
   * following the OpenAI-compatible format.
   *
   * @param body - Raw request body string to validate.
   * @returns A {@link ValidationResult} with the outcome of schema checks.
   */
  validateRequestPayload(body: string): ValidationResult {
    const parsed = safeParse(body);
    if (!isObject(parsed)) {
      return { valid: false, reason: "body is not valid JSON object", failedCheck: "request_shape" };
    }

    const messages = parsed["messages"];
    if (!Array.isArray(messages) || messages.length === 0) {
      return { valid: false, reason: "missing or empty messages array", failedCheck: "request_shape" };
    }

    return { valid: true };
  },

  /**
   * Validate the structural shape of a DeepSeek SSE response chunk.
   *
   * Accepts `[DONE]` and any JSON-parseable object.
   *
   * @param chunk - Raw SSE data chunk string to validate.
   * @returns A {@link ValidationResult} with the outcome of schema checks.
   */
  validateResponseChunk(chunk: string): ValidationResult {
    const trimmed = chunk.trim();
    if (trimmed === "[DONE]") return { valid: true };

    const parsed = safeParse(trimmed);
    if (!isObject(parsed)) {
      return { valid: false, reason: "response chunk is not valid JSON object", failedCheck: "response_shape" };
    }

    return { valid: true };
  },

  /**
   * Replace the user's message in the DeepSeek POST body.
   *
   * Mutates the last `messages` entry's `content` field with the replacement text.
   *
   * @param body - The original raw request body string (JSON).
   * @param newMessage - The replacement message text.
   * @returns The full modified body string, or `null` on parse failure.
   */
  replaceUserMessage(body: string, newMessage: string): string | null {
    try {
      const parsed = JSON.parse(body) as Record<string, unknown>;
      const messages = parsed["messages"];
      if (!Array.isArray(messages) || messages.length === 0) return null;

      const last = messages[messages.length - 1] as Record<string, unknown>;
      if (last["role"] !== "user") return null;

      if (typeof last["content"] === "string") {
        last["content"] = newMessage;
      } else if (Array.isArray(last["content"])) {
        // Replace the first text part in the array
        const parts = last["content"] as unknown[];
        const textIdx = parts.findIndex(
          (p) => isObject(p) && p["type"] === "text"
        );
        if (textIdx !== -1) {
          (parts[textIdx] as Record<string, unknown>)["text"] = newMessage;
        } else {
          return null;
        }
      } else {
        return null;
      }

      return JSON.stringify(parsed);
    } catch {
      return null;
    }
  },
};
