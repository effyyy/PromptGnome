/**
 * ChatGPT provider adapter.
 *
 * Handles request/response parsing for chatgpt.com and chat.openai.com.
 * The conversation API uses POST to `/backend-api/conversation` with JSON
 * bodies and responds with SSE streams containing JSON payloads.
 *
 * Architecture layer: Providers
 */

import type { BaseProviderAdapter, ValidationResult } from "./base-adapter";
import { safeParse, isObject } from "./parse-helpers";
import { PROVIDER_NAMES } from "~src/shared/constants";

/**
 * Extract text from the `content.parts` structure used by ChatGPT.
 *
 * ChatGPT stores message text as `message.content.parts`. Parts can be:
 * - Plain strings: `["user message text"]` (older format)
 * - Text objects: `[{type: "text", text: "user message text"}]` (newer format)
 * We try both forms and return the first non-empty text found.
 */
function extractFromContentParts(
  message: Record<string, unknown>
): string | null {
  if (!isObject(message)) return null;

  const content = message["content"];
  if (!isObject(content)) return null;

  const parts = content["parts"];
  if (!Array.isArray(parts)) return null;

  for (const part of parts) {
    // Plain string part (classic format)
    if (typeof part === "string" && part.length > 0) return part;
    // Object part with a `text` field (newer format)
    if (
      isObject(part) &&
      typeof part["text"] === "string" &&
      part["text"].length > 0
    ) {
      return part["text"] as string;
    }
  }

  return null;
}

/**
 * Provider adapter for ChatGPT (chatgpt.com, chat.openai.com).
 */
export const chatgptAdapter: BaseProviderAdapter = {
  name: PROVIDER_NAMES.CHATGPT,

  hostPatterns: [/^chatgpt\.com$/, /^chat\.openai\.com$/],

  urlPattern: /\/backend-(?:api|anon)\/(?:[a-z]\/)?conversation(?:\?|$|\/)/,

  /**
   * Extract the user's message from the ChatGPT POST body.
   *
   * Supports both new-message and edit-message payloads. The relevant
   * message is always the last entry in the `messages` array.
   */
  extractUserMessage(body: string): string | null {
    const parsed = safeParse(body);
    if (!isObject(parsed)) return null;

    const messages = parsed["messages"];
    if (!Array.isArray(messages) || messages.length === 0) return null;

    const lastMessage: unknown = messages[messages.length - 1];
    if (!isObject(lastMessage)) return null;

    return extractFromContentParts(lastMessage);
  },

  /**
   * Extract response text from a ChatGPT SSE data chunk.
   *
   * Each SSE line is `data: <json>` where the JSON contains
   * `message.content.parts[0]` with the full accumulated text.
   * We return the text fragment; callers can diff if needed.
   */
  extractResponseText(sseData: string, _eventType?: string): string | null {
    const trimmed = sseData.trim();

    if (trimmed === "[DONE]") return null;

    const parsed = safeParse(trimmed);
    if (!isObject(parsed)) return null;

    const message = parsed["message"];
    if (!isObject(message)) return null;

    // Only extract from assistant messages
    const role = message["author"];
    if (isObject(role) && role["role"] !== "assistant") return null;

    return extractFromContentParts(message);
  },

  /**
   * Check if the SSE stream is complete.
   *
   * ChatGPT signals completion with `data: [DONE]`.
   */
  isStreamComplete(sseData: string, _eventType?: string): boolean {
    return sseData.trim() === "[DONE]";
  },

  submitButtonSelectors: ['button[data-testid="send-button"]', 'button[aria-label="Send prompt"]'],

  fileInputSelectors: ['input[type="file"]'],

  /**
   * Validate the structural shape of a ChatGPT request payload.
   *
   * Checks that the body is valid JSON with a non-empty `messages` array
   * and that the last message has either `content.parts` or a `content` string.
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

    const lastMessage: unknown = messages[messages.length - 1];
    if (!isObject(lastMessage)) {
      return { valid: false, reason: "last message is not an object", failedCheck: "request_shape" };
    }

    const content = lastMessage["content"];
    // Accept content.parts array or plain content string
    if (isObject(content) && Array.isArray(content["parts"])) {
      return { valid: true };
    }
    if (typeof content === "string") {
      return { valid: true };
    }

    return { valid: false, reason: "last message missing content.parts or content string", failedCheck: "request_shape" };
  },

  /**
   * Validate the structural shape of a ChatGPT SSE response chunk.
   *
   * Accepts the `[DONE]` terminator and any JSON-parseable object.
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
   * Replace the user's message in the ChatGPT POST body.
   *
   * Supports both the classic string-parts format and the newer object-parts
   * format. Also handles the fallback where `content` is a plain string.
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
      const content = last["content"];
      if (content && typeof content === "object" && !Array.isArray(content)) {
        const c = content as Record<string, unknown>;
        if (Array.isArray(c["parts"])) {
          c["parts"][0] = newMessage;
        } else {
          return null;
        }
      } else if (typeof last["content"] === "string") {
        last["content"] = newMessage;
      } else {
        return null;
      }
      return JSON.stringify(parsed);
    } catch {
      return null;
    }
  }
};
