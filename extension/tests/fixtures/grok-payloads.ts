/**
 * Mock request/response payloads for Grok adapter tests.
 *
 * Covers both the primary `messages` array format and the simplified
 * top-level `message` string format used in embedded X (Twitter) contexts.
 * All content is synthetic — no real PII is included.
 */

/** Current X surface request body with `responses` array (primary format). */
export const validRequestBody = JSON.stringify({
  responses: [
    {
      message: "What is the speed of light?",
      sender: 1,
      fileAttachments: []
    }
  ],
  systemPromptName: "",
  grokModelOptionId: "grok-3",
  conversationId: "conv-abc123",
  returnSearchResults: true,
  returnCitations: true,
  promptMetadata: {
    promptSource: "NATURAL",
    action: "CHAT"
  }
});

/** Multi-turn responses body — last response message should be extracted. */
export const multiTurnBody = JSON.stringify({
  responses: [
    { message: "Hello Grok!", sender: 1 },
    { message: "Hello! How can I help?", sender: 2 },
    { message: "Tell me about black holes.", sender: 1 }
  ],
  grokModelOptionId: "grok-3",
  conversationId: "conv-xyz789"
});

/** Legacy OpenAI-like `messages` array format. */
export const messagesFormatBody = JSON.stringify({
  model: "grok-2",
  messages: [
    { role: "user", content: "What is the speed of light?" }
  ],
  stream: true
});

/** Simplified embedded format with top-level `message` string. */
export const embeddedFormatBody = JSON.stringify({
  message: "Summarise the latest tech news.",
  context: "x-embed"
});

/** Body with empty messages array. */
export const emptyMessagesBody = JSON.stringify({
  model: "grok-2",
  messages: [],
  stream: true
});

/** Body where the last message role is assistant (not user). */
export const lastMessageAssistantBody = JSON.stringify({
  model: "grok-2",
  messages: [
    { role: "user", content: "Hi" },
    { role: "assistant", content: "Hi there!" }
  ]
});

/** Non-JSON body. */
export const nonJsonBody = "message=hello+world";

/** SSE data chunk with OpenAI-compat `choices[0].delta.content`. */
export const sseChatDelta = JSON.stringify({
  id: "chatcmpl-grok001",
  object: "chat.completion.chunk",
  model: "grok-2",
  choices: [
    {
      index: 0,
      delta: { role: "assistant", content: "Light travels at 299,792 km/s." },
      finish_reason: null
    }
  ]
});

/** SSE data chunk with top-level `token` field. */
export const sseTokenChunk = JSON.stringify({
  token: " in a vacuum.",
  model: "grok-2"
});

/** SSE data chunk with role-only delta (no content). */
export const sseRoleDelta = JSON.stringify({
  id: "chatcmpl-grok002",
  choices: [
    {
      index: 0,
      delta: { role: "assistant" },
      finish_reason: null
    }
  ]
});

/** SSE stream completion signal. */
export const sseDone = "[DONE]";

/** SSE final chunk with `finish_reason` set. */
export const sseFinishChunk = JSON.stringify({
  id: "chatcmpl-grok003",
  choices: [
    {
      index: 0,
      delta: {},
      finish_reason: "stop"
    }
  ]
});

/** SSE data chunk that is not valid JSON. */
export const sseMalformed = "{malformed{{json";

/** SSE data chunk with empty content. */
export const sseEmptyContent = JSON.stringify({
  choices: [
    {
      index: 0,
      delta: { content: "" },
      finish_reason: null
    }
  ]
});

/** JSONL response chunk with `result.message` (X surface primary format). */
export const jsonlResultMessage = JSON.stringify({
  result: {
    sender: "ASSISTANT",
    message: "Light travels at approximately 299,792 km/s in a vacuum.",
    query: "",
    feedbackLabels: [],
    followUpSuggestions: [],
    toolsUsed: [],
    citedWebResults: [],
    webResults: []
  }
});
