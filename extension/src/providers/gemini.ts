/**
 * Gemini provider adapter.
 *
 * Handles request/response parsing for gemini.google.com. Gemini uses a
 * proprietary RPC transport with deeply nested JSON arrays rather than
 * standard REST+SSE. This adapter is the most fragile of all providers
 * and is designed to fail gracefully, returning `null` on any parse error.
 *
 * Architecture layer: Providers
 */

import type { BaseProviderAdapter, ValidationResult } from "./base-adapter";
import { safeParse } from "./parse-helpers";
import { PROVIDER_NAMES } from "~src/shared/constants";

/**
 * Safely access a deeply nested array index path.
 *
 * @param root - The root value to traverse.
 * @param path - Array of numeric indices to follow.
 * @returns The value at the path, or `undefined` if any step fails.
 */
function deepGet(root: unknown, path: readonly number[]): unknown {
  let current: unknown = root;
  for (const index of path) {
    if (!Array.isArray(current)) return undefined;
    if (index < 0 || index >= current.length) return undefined;
    current = current[index] as unknown;
  }
  return current;
}

// Known extraction paths for user messages in Gemini's nested arrays.
//
// Each path is gated by a structural signature in `extractFromChatEnvelope`
// (the leading-nulls "[null, null, ...]" pattern that is unique to Gemini's
// chat send envelope). The recursive "find any string anywhere" fallback
// that previously lived here was removed because it caused
// `extractUserMessage` to return non-null for unrelated batchexecute RPCs
// (config, auth, layout state, etc.) that Gemini fires during bootstrap,
// which in turn caused the XHR interceptor to indefinitely defer those
// requests waiting for an overlay decision — wedging Gemini's init and
// producing a black screen.
const USER_MESSAGE_PATHS_VARIANT_A: readonly (readonly number[])[] = [
  [0, 2, 0, 0],
  [0, 2, 0],
];

const USER_MESSAGE_PATHS_VARIANT_B: readonly (readonly number[])[] = [
  [2, 0, 0],
  [2, 0],
];

/**
 * Reasonable bounds for an extracted user-message string. Anything outside
 * this range is treated as a structural false positive (opaque IDs, oversized
 * blobs, etc.) and discarded.
 */
const MIN_MESSAGE_LENGTH = 1;
const MAX_MESSAGE_LENGTH = 200_000;

/**
 * Validate that an extracted string plausibly represents real user content
 * (not an empty/whitespace-only structural placeholder).
 */
function isPlausibleUserMessage(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (value.length < MIN_MESSAGE_LENGTH || value.length > MAX_MESSAGE_LENGTH) return false;
  if (value.trim().length === 0) return false;
  return true;
}

// Known extraction paths for response text in Gemini's streaming chunks.
const RESPONSE_TEXT_PATHS: readonly (readonly number[])[] = [
  [0, 0],
  [0, 2, 0, 0],
  [4, 0, 0],
  [0],
];

/**
 * Parse a form-encoded body and extract the JSON value from the `f.req` parameter.
 *
 * Gemini's BardChatUi sends `application/x-www-form-urlencoded` bodies where
 * the user message is nested inside the `f.req` form parameter as a JSON array.
 *
 * @param body - The raw request body string (potentially form-encoded).
 * @returns The parsed JSON value from `f.req`, or `null` if not form-encoded.
 */
function parseFormEncodedFreq(body: string): unknown {
  // Quick heuristic: form-encoded bodies contain '=' and 'f.req='
  if (!body.includes("f.req=")) return null;

  try {
    const params = new URLSearchParams(body);
    const freq = params.get("f.req");
    if (freq === null) return null;
    return safeParse(freq);
  } catch {
    return null;
  }
}

/**
 * Extract user message text from a parsed Gemini chat envelope.
 *
 * Gemini's chat send envelope is structurally distinctive: it always begins
 * with a "[null, null, ...]" header before the wrapped user message. This
 * signature is what separates real chat sends from the dozens of unrelated
 * batchexecute RPCs Gemini fires during bootstrap (auth, config, layout,
 * etc.), which use the standard Google batchexecute envelope
 * `[[[rpcid_string, args_string, ...]]]` and never start with leading nulls.
 *
 * Two variants are recognised:
 *
 *   Variant A — outer wrapper:   `[[null, null, [[<msg>]]]]`
 *   Variant B — top-level:       `[null,  null, [[<msg>]]]`
 *
 * If neither shape is matched, returns `null`. There is intentionally no
 * "search anywhere in the tree" fallback — that fallback is what previously
 * caused false positives on bootstrap RPCs and broke Gemini's init.
 *
 * @param parsed - The parsed JSON value (expected to be a nested array).
 * @returns The first matching user message string, or `null`.
 */
function extractFromChatEnvelope(parsed: unknown): string | null {
  if (!Array.isArray(parsed)) return null;

  // Variant A: outer wrapper. parsed[0] must itself be an array whose first
  // two elements are null (the chat-envelope signature).
  if (parsed.length >= 1 && Array.isArray(parsed[0])) {
    const inner = parsed[0] as unknown[];
    if (inner.length >= 3 && inner[0] === null && inner[1] === null) {
      for (const path of USER_MESSAGE_PATHS_VARIANT_A) {
        const value = deepGet(parsed, path);
        if (isPlausibleUserMessage(value)) return value;
      }
    }
  }

  // Variant B: top-level. parsed itself starts with two leading nulls.
  if (parsed.length >= 3 && parsed[0] === null && parsed[1] === null) {
    for (const path of USER_MESSAGE_PATHS_VARIANT_B) {
      const value = deepGet(parsed, path);
      if (isPlausibleUserMessage(value)) return value;
    }
  }

  // Variant D — current BardChatUi StreamGenerate envelope:
  //   `[null, "<json-string>"]`
  // where the inner string re-parses to
  //   `[["<message>", 0, null, null, null, null, 0], ["en-GB"], [...ids...], "<token>", ...]`
  // The leading `null` + stringified-args pair is the structural signature
  // of a real chat send and does not collide with the batchexecute bootstrap
  // envelopes (which always start with `[[[ ... ]]]`, never `[null, "..."]`).
  if (parsed.length === 2 && parsed[0] === null && typeof parsed[1] === "string") {
    const innerArgs = safeParse(parsed[1]);
    if (Array.isArray(innerArgs) && innerArgs.length >= 1 && Array.isArray(innerArgs[0])) {
      const candidate = (innerArgs[0] as unknown[])[0];
      if (isPlausibleUserMessage(candidate)) return candidate;
    }
  }

  // Variant C — batchexecute envelope wrapping a chat payload:
  //   `[[[rpcid_string, "<json args>", null, idx]], ...]`
  //
  // The args slot is itself a JSON-encoded string. We recursively re-parse
  // it and re-run the chat-envelope check. The shape gate above still
  // applies to the inner value, so unrelated RPCs are rejected.
  if (parsed.length >= 1 && Array.isArray(parsed[0])) {
    const envList = parsed[0] as unknown[];
    for (const env of envList) {
      if (
        Array.isArray(env) &&
        env.length >= 2 &&
        typeof env[0] === "string" &&
        typeof env[1] === "string"
      ) {
        const innerArgs = safeParse(env[1]);
        const innerMessage = extractFromChatEnvelope(innerArgs);
        if (innerMessage !== null) return innerMessage;
      }
    }
  }

  return null;
}

/**
 * Provider adapter for Gemini (gemini.google.com).
 *
 * This adapter is inherently fragile because Gemini uses a proprietary
 * binary/JSON-array RPC format that is not publicly documented and
 * may change without notice. The current primary transport is form-encoded
 * bodies sent to BardChatUi endpoints.
 */
export const geminiAdapter: BaseProviderAdapter = {
  name: PROVIDER_NAMES.GEMINI,

  hostPatterns: [/^gemini\.google\.com$/],

  // Permissive match: hostname is already gated to gemini.google.com, so we
  // accept any URL containing a known Gemini transport marker. This survives
  // Google's frequent UI-segment renames (BardChatUi → GeminiChatUi → FrontendUi
  // → ...) and path layout shuffles (e.g. assistant.lamda.BardFrontendService
  // moving under different parent paths). Real-world Gemini StreamGenerate URLs
  // look like:
  //   https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate?bl=...&_reqid=...&rt=c
  // and the legacy regex was failing to match newer variants.
  urlPattern:
    /(?:\$rpc\/google\.internal|alkalimakersuite-pa\.clients6\.google\.com|assistant\.lamda\.BardFrontendService|StreamGenerate|GenerateContent|\/data\/batchexecute)/,

  /**
   * Extract the user's message from the Gemini POST body.
   *
   * Gemini uses two transport formats:
   * 1. Form-encoded: `f.req=<JSON array>` (current primary via BardChatUi)
   * 2. Raw JSON arrays (legacy RPC format)
   *
   * In both cases the user message is in deeply nested arrays. We try
   * several known index paths and fall back to a recursive string search.
   *
   * @remarks
   * **Known limitation:** When the payload is binary-encoded (protobuf),
   * this method returns `null` and detection is silently skipped (fail-open).
   */
  extractUserMessage(body: string): string | null {
    // Strategy 0: Try form-encoded body (current BardChatUi format)
    const formParsed = parseFormEncodedFreq(body);
    if (formParsed !== null) {
      return extractFromChatEnvelope(formParsed);
    }

    const parsed = safeParse(body);
    if (parsed === null) return null;

    return extractFromChatEnvelope(parsed);
  },

  /**
   * Extract response text from a Gemini streaming data chunk.
   *
   * Gemini's streaming format uses proprietary framing. Chunks may
   * arrive as JSON arrays or as length-prefixed data. We attempt
   * JSON parsing and try known paths.
   *
   * @remarks
   * **Known limitation:** Binary protobuf chunks and certain JSON
   * array layouts will fail to parse. In these cases the method
   * returns `null` and the chunk is skipped. A DOM-based fallback
   * that reads rendered text from the page is planned.
   */
  extractResponseText(sseData: string, _eventType?: string): string | null {
    const trimmed = sseData.trim();
    const parsed = safeParse(trimmed);
    if (parsed === null) return null;

    // Path-based extraction only. The previous "find first string anywhere"
    // recursive fallback was removed for the same reason it was removed from
    // `extractUserMessage`: it returns non-text structural strings (RPC IDs,
    // tokens, etc.) that pollute the audit pipeline. If no known path
    // matches, return null and let the DOM-rehydration path handle display.
    for (const path of RESPONSE_TEXT_PATHS) {
      const value = deepGet(parsed, path);
      if (isPlausibleUserMessage(value)) return value;
    }

    return null;
  },

  /**
   * Check if the Gemini stream is complete.
   *
   * Gemini does not use a standard completion signal. We look for
   * empty arrays, `null` payloads, or known termination markers.
   *
   * @remarks
   * **Known limitation:** The actual RPC termination signal is not
   * yet reverse-engineered. This heuristic may miss the true end
   * of stream or trigger prematurely.
   */
  isStreamComplete(sseData: string, _eventType?: string): boolean {
    const trimmed = sseData.trim();

    if (trimmed === "" || trimmed === "null") return true;

    const parsed = safeParse(trimmed);
    if (parsed === null) return false;

    // An empty top-level array sometimes signals completion
    if (Array.isArray(parsed) && parsed.length === 0) return true;

    return false;
  },

  submitButtonSelectors: ['button.send-button', 'button[aria-label="Send message"]'],

  fileInputSelectors: ['input[type="file"]'],

  /**
   * Validate the structural shape of a Gemini request payload.
   *
   * Gemini uses two formats:
   * 1. Form-encoded body with `f.req` containing a JSON array (current BardChatUi)
   * 2. Raw JSON array body (legacy RPC)
   *
   * Because Gemini's schema is fragile and undocumented, we accept any
   * recognized structure as valid.
   *
   * @param body - Raw request body string to validate.
   * @returns A {@link ValidationResult} with the outcome of schema checks.
   */
  validateRequestPayload(body: string): ValidationResult {
    // Format 1: Form-encoded with f.req parameter
    const formParsed = parseFormEncodedFreq(body);
    if (formParsed !== null) {
      return { valid: true };
    }

    // Format 2: Raw JSON array
    const parsed = safeParse(body);
    if (parsed === null) {
      return { valid: false, reason: "body is not valid JSON or form-encoded with f.req", failedCheck: "request_shape" };
    }

    if (!Array.isArray(parsed)) {
      return { valid: false, reason: "body is not a JSON array or form-encoded f.req", failedCheck: "request_shape" };
    }

    return { valid: true };
  },

  /**
   * Validate the structural shape of a Gemini SSE response chunk.
   *
   * Accepts JSON-parseable values (arrays or objects) or empty/null signals.
   *
   * @param chunk - Raw SSE data chunk string to validate.
   * @returns A {@link ValidationResult} with the outcome of schema checks.
   */
  validateResponseChunk(chunk: string): ValidationResult {
    const trimmed = chunk.trim();
    if (trimmed === "" || trimmed === "null") return { valid: true };

    const parsed = safeParse(trimmed);
    if (parsed === null) {
      return { valid: false, reason: "response chunk is not valid JSON", failedCheck: "response_shape" };
    }

    return { valid: true };
  },

  /**
   * Replace the user's message in the Gemini POST body.
   *
   * Because Gemini's payload structure is deeply nested and opaque (both
   * form-encoded and raw JSON array), we locate the extracted original text
   * as a JSON-encoded substring and perform a targeted string substitution
   * rather than attempting full round-trip mutation.
   *
   * @param body - The original raw request body string (JSON or form-encoded).
   * @param newMessage - The replacement message text.
   * @returns The full modified body string, or `null` if the original
   *   message cannot be located in the body.
   */
  replaceUserMessage(body: string, newMessage: string): string | null {
    const original = this.extractUserMessage(body);
    if (original === null) return null;
    const escapedOrig = JSON.stringify(original).slice(1, -1);
    const escapedNew = JSON.stringify(newMessage).slice(1, -1);

    // Form-encoded path (current BardChatUi transport): the JSON payload lives
    // inside the URL-encoded `f.req` parameter, so a raw substring search on
    // `body` will not find `escapedOrig` for any message containing characters
    // that percent-encode (spaces, `@`, `+`, punctuation, etc.). Decode the
    // f.req value, substitute inside the decoded JSON, then splice the
    // re-encoded value back into the body while preserving every other
    // parameter (including `at` tokens) byte-for-byte.
    if (body.includes("f.req=")) {
      // Locate the f.req value span in the raw body without using
      // URLSearchParams (which would lose the original encoding of sibling
      // params on round-trip).
      const keyIdx = body.indexOf("f.req=");
      const valueStart = keyIdx + "f.req=".length;
      const ampIdx = body.indexOf("&", valueStart);
      const valueEnd = ampIdx === -1 ? body.length : ampIdx;
      const encodedValue = body.slice(valueStart, valueEnd);

      let decoded: string;
      try {
        decoded = decodeURIComponent(encodedValue);
      } catch {
        return null;
      }

      const idx = decoded.indexOf(escapedOrig);
      if (idx === -1) return null;
      const newDecoded =
        decoded.slice(0, idx) + escapedNew + decoded.slice(idx + escapedOrig.length);

      return body.slice(0, valueStart) + encodeURIComponent(newDecoded) + body.slice(valueEnd);
    }

    // Raw JSON body path (legacy RPC).
    const idx = body.indexOf(escapedOrig);
    if (idx === -1) return null;
    return body.slice(0, idx) + escapedNew + body.slice(idx + escapedOrig.length);
  }
};
