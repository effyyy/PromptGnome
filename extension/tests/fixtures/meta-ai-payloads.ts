/**
 * Mock request/response payloads for Meta AI adapter tests.
 *
 * Meta AI uses GraphQL: request bodies carry `{ query, variables }` where
 * the user message lives in `variables`. Both flat and nested variable
 * structures are covered. All content is synthetic — no real PII is included.
 */

/** GraphQL mutation with `variables.message` (most common format). */
export const graphqlMessageBody = JSON.stringify({
  doc_id: "1234567890",
  query: "mutation SendMessage($message: String!) { sendMessage(message: $message) { id } }",
  variables: {
    message: "What is the Fermi paradox?"
  }
});

/** GraphQL mutation with `variables.text` field. */
export const graphqlTextBody = JSON.stringify({
  doc_id: "9876543210",
  query: "mutation AiChat($text: String!) { aiChat(text: $text) { response } }",
  variables: {
    text: "Summarise the history of the internet."
  }
});

/** GraphQL mutation with nested `variables.input.message`. */
export const graphqlNestedInputBody = JSON.stringify({
  doc_id: "1122334455",
  query: "mutation Chat($input: ChatInput!) { chat(input: $input) { content } }",
  variables: {
    input: {
      message: "How does HTTPS work?",
      threadId: "thread-abc"
    }
  }
});

/** Direct messaging endpoint with top-level `message` field. */
export const directMessageBody = JSON.stringify({
  message: "Tell me a fun fact about octopuses.",
  sessionId: "sess-001"
});

/** Body with variables but no message key. */
export const noMessageInVariablesBody = JSON.stringify({
  doc_id: "0000000000",
  query: "query GetThread { thread { id } }",
  variables: {
    threadId: "thread-xyz"
  }
});

/** Body with empty `variables.message`. */
export const emptyMessageBody = JSON.stringify({
  doc_id: "1111111111",
  variables: { message: "" }
});

/** Non-JSON body. */
export const nonJsonBody = "doc_id=123&variables={}";

/** SSE chunk with `data.text` streaming delta. */
export const sseDataTextChunk = JSON.stringify({
  data: {
    text: "The Fermi paradox questions why",
    status: "streaming"
  }
});

/** SSE chunk with `data.message.content`. */
export const sseDataMessageContent = JSON.stringify({
  data: {
    message: {
      id: "msg-001",
      content: "we haven't detected alien civilisations.",
      role: "assistant"
    }
  }
});

/** SSE chunk with direct top-level `text` field. */
export const sseDirectText = JSON.stringify({
  text: "Despite billions of stars, the universe seems silent."
});

/** SSE chunk with OpenAI-compat `choices[0].delta.content`. */
export const sseChatDelta = JSON.stringify({
  choices: [
    {
      delta: { content: "One explanation is the Great Filter hypothesis." },
      finish_reason: null
    }
  ]
});

/** SSE stream completion signal. */
export const sseDone = "[DONE]";

/** SSE completion with `type: "complete"`. */
export const sseTypeComplete = JSON.stringify({
  type: "complete",
  data: {}
});

/** SSE completion with `done: true`. */
export const sseDoneTrue = JSON.stringify({
  done: true,
  sessionId: "sess-001"
});

/** SSE data chunk that is not valid JSON. */
export const sseMalformed = "<<<not json>>>";

/** SSE chunk with empty `data.text`. */
export const sseEmptyDataText = JSON.stringify({
  data: { text: "" }
});

/** Form-encoded request body (current primary format for meta.ai). */
export const formEncodedBody = `doc_id=7783822248314888&variables=${encodeURIComponent(JSON.stringify({
  message: {
    id: "msg-uuid-001",
    text: "What is the Fermi paradox?"
  },
  externalConversationId: "conv-uuid-001",
  offlineThreadingId: "thread-001",
  attachments: [],
  botRequestSource: "WEB_CHAT"
}))}&fb_dtsg=csrf_token_here&__a=1`;

/** Form-encoded body without message in variables. */
export const formEncodedNoMessage = `doc_id=6946734308765963&variables=${encodeURIComponent(JSON.stringify({
  threadId: "thread-xyz"
}))}&fb_dtsg=csrf_token`;
