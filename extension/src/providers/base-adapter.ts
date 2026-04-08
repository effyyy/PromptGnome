/**
 * Base adapter interface for AI provider integrations.
 *
 * Each provider adapter knows how to extract user messages from outgoing
 * request bodies and parse streamed response text from SSE data. Adapters
 * are intentionally stateless so a single instance can handle concurrent
 * requests.
 *
 * Architecture layer: Providers
 */

/**
 * Result of structural validation on a provider's request/response payload.
 * Used to detect API changes at runtime and fail open gracefully.
 */
export interface ValidationResult {
  valid: boolean;
  reason?: string;
  failedCheck?: 'request_shape' | 'response_shape' | 'dom_selectors' | 'endpoint_pattern';
}

/**
 * Contract that every provider adapter must implement.
 *
 * Implementations must be defensive: never throw on malformed input,
 * return `null` when extraction is not possible.
 */
export interface BaseProviderAdapter {
  /** Human-readable provider name (e.g. "ChatGPT", "Claude"). */
  readonly name: string;

  /** Hostname patterns this adapter handles (matched against `location.hostname`). */
  readonly hostPatterns: RegExp[];

  /** URL path pattern that identifies the conversation API endpoint. */
  readonly urlPattern: RegExp;

  /**
   * Extract the user's latest message text from an outgoing request body.
   *
   * @param body - Raw request body string (usually JSON).
   * @returns The extracted message text, or `null` if extraction fails.
   */
  extractUserMessage(body: string): string | null;

  /**
   * Extract assistant response text from a single SSE data chunk.
   *
   * @param sseData - The raw `data:` payload from an SSE line.
   * @param eventType - Optional SSE event type (e.g. `content_block_delta`).
   * @returns The extracted text fragment, or `null` if not a text event.
   */
  extractResponseText(sseData: string, eventType?: string): string | null;

  /**
   * Determine whether an SSE event signals the end of the stream.
   *
   * @param sseData - The raw `data:` payload from an SSE line.
   * @param eventType - Optional SSE event type.
   * @returns `true` when the stream is complete.
   */
  isStreamComplete(sseData: string, eventType?: string): boolean;

  /**
   * Replace the user's message text in the request body with a new value.
   * Inverse of {@link extractUserMessage}.
   *
   * @param body - The original raw request body string (JSON).
   * @param newMessage - The replacement message text.
   * @returns The full modified body string, or `null` on parse failure.
   */
  replaceUserMessage(body: string, newMessage: string): string | null;

  /** CSS selectors for the submit/send button. Used by file-interceptor. */
  readonly submitButtonSelectors?: readonly string[];

  /** CSS selectors for file input elements. Used by file-interceptor. */
  readonly fileInputSelectors?: readonly string[];

  /**
   * Validate the structural shape of an outgoing request payload.
   *
   * @param body - Raw request body string to validate.
   * @returns A {@link ValidationResult} indicating whether the payload matches the expected schema.
   */
  validateRequestPayload(body: string): ValidationResult;

  /**
   * Validate the structural shape of an incoming SSE response chunk.
   *
   * @param chunk - Raw SSE data chunk string to validate.
   * @returns A {@link ValidationResult} indicating whether the chunk matches the expected schema.
   */
  validateResponseChunk(chunk: string): ValidationResult;
}
