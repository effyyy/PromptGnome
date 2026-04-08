/**
 * Mock request/response payloads for Perplexity adapter tests.
 *
 * Covers both search-query mode (top-level `query` field) and chat mode
 * (OpenAI-compatible `messages` array). All content is synthetic.
 */

/** Current SSE endpoint request body with `query_str` field. */
export const sseQueryBody = JSON.stringify({
  query_str: "What are the benefits of TypeScript?",
  search_focus: "internet",
  language: "en-US",
  timezone: "America/New_York",
  frontend_session_id: "sess-abc123",
  version: "2.13"
});

/** Legacy search-mode request body with a top-level `query` field. */
export const searchQueryBody = JSON.stringify({
  query: "What are the benefits of TypeScript?",
  search_focus: "internet",
  language: "en"
});

/** Chat-mode request body with an OpenAI-compatible `messages` array. */
export const chatMessagesBody = JSON.stringify({
  model: "pplx-70b-chat",
  messages: [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: "Explain async/await in JavaScript." }
  ],
  stream: true
});

/** Multi-turn chat body — last user message should be extracted. */
export const multiTurnChatBody = JSON.stringify({
  model: "pplx-70b-chat",
  messages: [
    { role: "user", content: "What is TypeScript?" },
    { role: "assistant", content: "TypeScript is a typed superset of JavaScript." },
    { role: "user", content: "How does it compare to Flow?" }
  ],
  stream: true
});

/** Body with an empty query string. */
export const emptyQueryBody = JSON.stringify({
  query: "",
  search_focus: "internet"
});

/** Body with an empty messages array. */
export const emptyMessagesBody = JSON.stringify({
  model: "pplx-70b-chat",
  messages: []
});

/** Non-JSON body. */
export const nonJsonBody = "query=hello+world";

/** SSE chunk with `output` field (search/summarisation stream). */
export const sseOutputChunk = JSON.stringify({
  output: "TypeScript adds static typing to JavaScript.",
  status: "streaming"
});

/** SSE chunk with OpenAI-compat `choices[0].delta.content`. */
export const sseChatDelta = JSON.stringify({
  id: "chatcmpl-xyz",
  choices: [
    {
      index: 0,
      delta: { content: "TypeScript is a typed superset." },
      finish_reason: null
    }
  ]
});

/** SSE chunk with legacy `text` field. */
export const sseLegacyText = JSON.stringify({
  text: "TypeScript enables better IDE support."
});

/** SSE stream completion with `[DONE]`. */
export const sseDone = "[DONE]";

/** SSE completion signal with `status: "completed"`. */
export const sseStatusCompleted = JSON.stringify({
  status: "completed",
  output: ""
});

/** SSE chunk with a `finish_reason` (OpenAI-compat end). */
export const sseFinishChunk = JSON.stringify({
  id: "chatcmpl-xyz2",
  choices: [
    {
      index: 0,
      delta: {},
      finish_reason: "stop"
    }
  ]
});

/** SSE data chunk that is not valid JSON. */
export const sseMalformed = "{{broken json}}";

/** SSE chunk with an empty `output` field. */
export const sseEmptyOutput = JSON.stringify({
  output: "",
  status: "streaming"
});

/** SSE chunk with real `status`+`text` streaming format (current). */
export const sseRealStreamChunk = JSON.stringify({
  status: "generating",
  backend_uuid: "be-uuid-001",
  answer_generator_type: "CLAUDE",
  text: "TypeScript adds static typing to JavaScript."
});
