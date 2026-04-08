/**
 * Meta AI provider adapter.
 *
 * Handles request/response parsing for www.meta.ai. Meta AI uses a GraphQL
 * transport: outbound requests POST to `/api/graphql` carrying mutation
 * operations whose variables contain the user message. Responses may be SSE
 * streams or regular JSON responses. For Phase 1, only the standalone
 * meta.ai domain is supported.
 *
 * Architecture layer: Providers
 */

import type { BaseProviderAdapter, ValidationResult } from "./base-adapter";
import { safeParse, isObject } from "./parse-helpers";
import { PROVIDER_NAMES } from "~src/shared/constants";

/**
 * Recursively search a value for the first non-empty string under any of the
 * given keys, traversing objects and arrays up to `maxDepth` levels deep.
 *
 * Used to handle GraphQL variable shapes that differ between Meta AI
 * mutation types without hard-coding every possible path.
 *
 * @param value - Root value to traverse.
 * @param keys - Candidate keys to look for.
 * @param maxDepth - Maximum recursion depth to prevent stack overflow.
 * @returns The first matching string value, or `null`.
 */
function findValueForKeys(
  value: unknown,
  keys: readonly string[],
  maxDepth: number
): string | null {
  if (maxDepth <= 0) return null;

  if (isObject(value)) {
    for (const key of keys) {
      if (key in value && typeof value[key] === "string" && (value[key] as string).length > 0) {
        return value[key] as string;
      }
    }
    for (const child of Object.values(value)) {
      const found = findValueForKeys(child, keys, maxDepth - 1);
      if (found !== null) return found;
    }
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findValueForKeys(item, keys, maxDepth - 1);
      if (found !== null) return found;
    }
  }

  return null;
}

/** Candidate key names that typically hold the user message in GraphQL variables. */
const MESSAGE_KEYS = ["message", "text", "query", "prompt"] as const;

/**
 * Parse a form-encoded body and extract the JSON `variables` parameter.
 *
 * Meta AI's web client sends `application/x-www-form-urlencoded` bodies
 * with `doc_id`, `variables` (JSON string), `fb_dtsg`, etc.
 *
 * @param body - The raw request body string (potentially form-encoded).
 * @returns The parsed variables object, or `null` if not form-encoded.
 */
function parseFormVariables(body: string): Record<string, unknown> | null {
  // Quick heuristic: form-encoded bodies contain '=' and 'variables='
  if (!body.includes("variables=")) return null;

  try {
    const params = new URLSearchParams(body);
    const vars = params.get("variables");
    if (vars === null) return null;
    const parsed = safeParse(vars);
    if (!isObject(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Provider adapter for Meta AI (www.meta.ai).
 *
 * Meta AI's web client communicates via GraphQL mutations. The user message
 * lives inside `variables` at various paths depending on the mutation type.
 * This adapter uses progressive key-scanning rather than hard-coded paths to
 * remain resilient to schema changes.
 */
export const metaAiAdapter: BaseProviderAdapter = {
  name: PROVIDER_NAMES.META_AI,

  hostPatterns: [
    /^(?:www\.)?meta\.ai$/,
    /^graph\.meta\.ai$/,
    // Meta AI's web client occasionally posts GraphQL through the Facebook
    // graph host. The interceptor still runs on the meta.ai page so cross-
    // origin requests need to be matched here too (the page-context fallback
    // in registry.ts will route them via the meta.ai page hostname).
    /^graph\.facebook\.com$/,
    /^.*\.facebook\.com$/,
  ],

  urlPattern: /\/(?:api\/graphql|graphql|messaging\/send|llm\/.*|chat\/.*)(?:\?|$|\/|#)/,

  /**
   * Extract the user's message from a Meta AI POST body.
   *
   * Meta AI sends requests in two formats:
   * 1. Form-encoded: `doc_id=...&variables=<JSON string>&fb_dtsg=...`
   *    The `variables` form field is a JSON string containing `message.text`
   * 2. JSON body: `{ query, variables: { message, text, ... } }`
   *
   * In both cases the user message is inside the variables object.
   *
   * @param body - Raw request body string (JSON or form-encoded).
   * @returns The extracted message text, or `null` if extraction fails.
   */
  extractUserMessage(body: string): string | null {
    // Strategy 1: Try form-encoded body (current primary format)
    const formVariables = parseFormVariables(body);
    if (formVariables !== null) {
      // Meta AI form format: variables.message.text is the primary location
      const found = findValueForKeys(formVariables, ["text", ...MESSAGE_KEYS], 5);
      if (found !== null) return found;
    }

    // Strategy 2: Try JSON body
    const parsed = safeParse(body);
    if (!isObject(parsed)) return null;

    // GraphQL: extract from `variables` sub-object first (avoids matching
    // the `query` key which contains the GraphQL operation string).
    const variables = parsed["variables"];
    if (isObject(variables)) {
      const found = findValueForKeys(variables, MESSAGE_KEYS, 5);
      if (found !== null) return found;
    }

    // Non-GraphQL fallback: direct message/text/prompt field.
    const nonGraphqlKeys = ["message", "text", "prompt"] as const;
    const hasVariables = isObject(parsed["variables"]);
    if (!hasVariables) {
      for (const key of nonGraphqlKeys) {
        const val = parsed[key];
        if (typeof val === "string" && val.length > 0) return val;
      }
    }

    return null;
  },

  /**
   * Extract response text from a Meta AI SSE data chunk.
   *
   * Meta AI SSE events may carry text in:
   * - `data.text` — streaming text delta
   * - `data.message.content` — full message block
   * - `choices[0].delta.content` — OpenAI-compat fallback
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

    // Format 1: `data.text` streaming delta
    const data = parsed["data"];
    if (isObject(data)) {
      const text = data["text"];
      if (typeof text === "string" && text.length > 0) return text;

      // Format 2: `data.message.content`
      const message = data["message"];
      if (isObject(message)) {
        const content = message["content"];
        if (typeof content === "string" && content.length > 0) return content;
      }
    }

    // Format 3: direct `text` field
    const text = parsed["text"];
    if (typeof text === "string" && text.length > 0) return text;

    // Format 4: OpenAI-compat `choices[0].delta.content`
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

    return null;
  },

  /**
   * Check if the Meta AI SSE stream is complete.
   *
   * Meta AI uses `[DONE]` or a payload containing `{ type: "complete" }` or
   * `{ done: true }` to signal stream completion.
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

    if (parsed["type"] === "complete") return true;
    if (parsed["done"] === true) return true;

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
   * Validate the structural shape of a Meta AI request payload.
   *
   * Accepts GraphQL format with `variables` or a direct message/text/prompt field.
   * Any parseable JSON object with at least one recognized field is valid.
   *
   * @param body - Raw request body string to validate.
   * @returns A {@link ValidationResult} with the outcome of schema checks.
   */
  validateRequestPayload(body: string): ValidationResult {
    // Format 1: Form-encoded with variables parameter (current primary)
    const formVars = parseFormVariables(body);
    if (formVars !== null) {
      return { valid: true };
    }

    // Format 2: Check if form-encoded with doc_id (even without variables)
    if (body.includes("doc_id=") && body.includes("=")) {
      return { valid: true };
    }

    // Format 3: JSON body
    const parsed = safeParse(body);
    if (!isObject(parsed)) {
      return { valid: false, reason: "body is not valid JSON or form-encoded with variables", failedCheck: "request_shape" };
    }

    // GraphQL format: variables object present
    if (isObject(parsed["variables"])) {
      return { valid: true };
    }

    // Direct fields: message, text, query, or prompt
    for (const key of ["message", "text", "query", "prompt"] as const) {
      if (typeof parsed[key] === "string" && (parsed[key] as string).length > 0) {
        return { valid: true };
      }
    }

    return { valid: false, reason: "missing variables object or message/text/query/prompt field", failedCheck: "request_shape" };
  },

  /**
   * Validate the structural shape of a Meta AI SSE response chunk.
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
   * Replace the user's message in the Meta AI POST body.
   *
   * Tries to locate and replace the message value inside the GraphQL
   * `variables` object first, then falls back to direct top-level fields.
   *
   * @param body - The original raw request body string (JSON).
   * @param newMessage - The replacement message text.
   * @returns The full modified body string, or `null` on parse failure.
   * @throws Never — all errors are caught and return `null`.
   */
  replaceUserMessage(body: string, newMessage: string): string | null {
    try {
      // Strategy 1: Form-encoded body — replace inside variables JSON string
      if (body.includes("variables=")) {
        const params = new URLSearchParams(body);
        const varsStr = params.get("variables");
        if (varsStr !== null) {
          const vars = JSON.parse(varsStr) as Record<string, unknown>;
          let replaced = false;

          // Try message.text first (Meta AI primary: variables.message.text)
          const msg = vars["message"];
          if (isObject(msg) && typeof msg["text"] === "string") {
            msg["text"] = newMessage;
            replaced = true;
          }

          if (!replaced) {
            for (const key of MESSAGE_KEYS) {
              if (typeof vars[key] === "string" && (vars[key] as string).length > 0) {
                vars[key] = newMessage;
                replaced = true;
                break;
              }
            }
          }

          if (replaced) {
            params.set("variables", JSON.stringify(vars));
            return params.toString();
          }
        }
      }

      // Strategy 2: JSON body
      const parsed = JSON.parse(body) as Record<string, unknown>;

      // Try to replace inside `variables` first
      const variables = parsed["variables"];
      if (isObject(variables)) {
        for (const key of MESSAGE_KEYS) {
          if (typeof variables[key] === "string" && (variables[key] as string).length > 0) {
            variables[key] = newMessage;
            return JSON.stringify(parsed);
          }
        }
        // Check one level deeper: variables.input.*
        const input = variables["input"];
        if (isObject(input)) {
          for (const key of MESSAGE_KEYS) {
            if (typeof input[key] === "string" && (input[key] as string).length > 0) {
              input[key] = newMessage;
              return JSON.stringify(parsed);
            }
          }
        }
      }

      // Fallback: direct top-level keys (skip `query` as that's the GQL operation)
      for (const key of ["message", "text", "prompt"] as const) {
        if (typeof parsed[key] === "string") {
          parsed[key] = newMessage;
          return JSON.stringify(parsed);
        }
      }

      return null;
    } catch {
      return null;
    }
  },
};
