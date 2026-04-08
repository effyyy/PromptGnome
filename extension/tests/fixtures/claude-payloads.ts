/**
 * Mock request/response payloads for Claude adapter tests.
 *
 * Based on observed Claude API traffic patterns.
 */

/** Standard conversation request body with nested completion.prompt (current format). */
export const validRequestBody = JSON.stringify({
  completion: {
    prompt: "Explain quantum computing in simple terms",
    timezone: "America/New_York",
    model: "claude-opus-4-5"
  },
  organization_uuid: "org-abc123",
  conversation_uuid: "conv-xyz789",
  text: "Explain quantum computing in simple terms",
  attachments: []
});

/** Legacy request body with top-level prompt field. */
export const legacyPromptBody = JSON.stringify({
  prompt: "Explain quantum computing in simple terms",
  model: "claude-sonnet-4-20250514",
  max_tokens: 4096,
  timezone: "America/New_York"
});

/** Request body with top-level text field only (append_message format). */
export const textFieldBody = JSON.stringify({
  organization_uuid: "org-abc123",
  conversation_uuid: "conv-xyz789",
  text: "Explain quantum computing in simple terms",
  attachments: []
});

/** Request body with empty prompt in completion. */
export const emptyPromptBody = JSON.stringify({
  completion: { prompt: "", model: "claude-opus-4-5" },
  text: ""
});

/** Request body with no prompt field at all. */
export const missingPromptBody = JSON.stringify({
  completion: { model: "claude-opus-4-5" },
  organization_uuid: "org-abc123"
});

/** Non-JSON body. */
export const nonJsonBody = "prompt=hello&model=claude";

/** Request body where prompt is a number (wrong type). */
export const wrongTypePromptBody = JSON.stringify({
  completion: { prompt: 42, model: "claude-opus-4-5" }
});

/** SSE content_block_delta event with text. */
export const sseTextDelta = JSON.stringify({
  type: "content_block_delta",
  index: 0,
  delta: {
    type: "text_delta",
    text: "Quantum computing uses "
  }
});

/** SSE content_block_delta event with a different delta type (e.g. thinking). */
export const sseThinkingDelta = JSON.stringify({
  type: "content_block_delta",
  index: 0,
  delta: {
    type: "thinking_delta",
    thinking: "Let me consider the best way to explain this..."
  }
});

/** SSE content_block_start event (not a delta, should return null). */
export const sseContentBlockStart = JSON.stringify({
  type: "content_block_start",
  index: 0,
  content_block: {
    type: "text",
    text: ""
  }
});

/** SSE message_stop event signaling stream completion. */
export const sseMessageStop = JSON.stringify({
  type: "message_stop"
});

/** SSE message_delta event (not text content). */
export const sseMessageDelta = JSON.stringify({
  type: "message_delta",
  delta: {
    stop_reason: "end_turn",
    stop_sequence: null
  },
  usage: {
    output_tokens: 150
  }
});

/** SSE data that is not valid JSON. */
export const sseMalformed = "{incomplete json";

/** SSE ping event. */
export const ssePing = JSON.stringify({
  type: "ping"
});
