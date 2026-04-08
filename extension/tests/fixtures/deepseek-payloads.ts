/**
 * Mock request/response payloads for DeepSeek adapter tests.
 *
 * Based on the DeepSeek OpenAI-compatible chat completion API format.
 * All content is synthetic — no real PII is included.
 */

/** Standard new-message request body with plain string content. */
export const validRequestBody = JSON.stringify({
  model: "deepseek-chat",
  messages: [
    {
      role: "system",
      content: "You are a helpful assistant."
    },
    {
      role: "user",
      content: "What is the capital of France?"
    }
  ],
  stream: true
});

/** Request body with an array-of-parts content format. */
export const arrayContentBody = JSON.stringify({
  model: "deepseek-chat",
  messages: [
    {
      role: "user",
      content: [{ type: "text", text: "Explain recursion please." }]
    }
  ],
  stream: true
});

/** Multi-turn conversation body — only the last user message should be extracted. */
export const multiTurnBody = JSON.stringify({
  model: "deepseek-chat",
  messages: [
    { role: "user", content: "Hi there" },
    { role: "assistant", content: "Hello! How can I help?" },
    { role: "user", content: "Explain quicksort." }
  ],
  stream: true
});

/** Body with the last message being an assistant turn (not user). */
export const lastMessageAssistantBody = JSON.stringify({
  model: "deepseek-chat",
  messages: [
    { role: "user", content: "Hello" },
    { role: "assistant", content: "Hi, how can I help?" }
  ],
  stream: true
});

/** Body with an empty messages array. */
export const emptyMessagesBody = JSON.stringify({
  model: "deepseek-chat",
  messages: [],
  stream: true
});

/** Non-JSON body. */
export const nonJsonBody = "model=deepseek-chat&message=hello";

/** Body missing the messages key entirely. */
export const missingMessagesBody = JSON.stringify({
  model: "deepseek-chat",
  stream: true
});

/** SSE data chunk with a text delta from the assistant. */
export const sseTextDelta = JSON.stringify({
  id: "chatcmpl-abc123",
  object: "chat.completion.chunk",
  model: "deepseek-chat",
  choices: [
    {
      index: 0,
      delta: { role: "assistant", content: "Paris is the capital of France." },
      finish_reason: null
    }
  ]
});

/** SSE data chunk with an empty delta (role-only handshake). */
export const sseRoleDelta = JSON.stringify({
  id: "chatcmpl-abc124",
  object: "chat.completion.chunk",
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

/** SSE final chunk with finish_reason set. */
export const sseFinishChunk = JSON.stringify({
  id: "chatcmpl-abc125",
  object: "chat.completion.chunk",
  choices: [
    {
      index: 0,
      delta: {},
      finish_reason: "stop"
    }
  ]
});

/** SSE data chunk that is not valid JSON. */
export const sseMalformed = "not valid json {{{";

/** SSE data chunk with empty content string. */
export const sseEmptyContent = JSON.stringify({
  id: "chatcmpl-abc126",
  object: "chat.completion.chunk",
  choices: [
    {
      index: 0,
      delta: { content: "" },
      finish_reason: null
    }
  ]
});
