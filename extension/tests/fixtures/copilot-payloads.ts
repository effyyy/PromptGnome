/**
 * Mock request/response payloads for Microsoft Copilot adapter tests.
 *
 * Covers three observed request formats: the simple `message` string, the
 * OpenAI-compatible `messages` array, and the legacy Sydney `arguments`
 * structure. All content is synthetic — no real PII is included.
 */

/** Simple direct-chat body with top-level `message` string. */
export const simpleMessageBody = JSON.stringify({
  message: "How do I reverse a linked list?",
  conversationId: "conv-abc123",
  clientId: "client-xyz"
});

/** OpenAI-compatible `messages` array format. */
export const chatMessagesBody = JSON.stringify({
  model: "copilot",
  messages: [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: "Explain dependency injection." }
  ],
  stream: true
});

/** Multi-turn OpenAI-compat body — last user message should be extracted. */
export const multiTurnBody = JSON.stringify({
  messages: [
    { role: "user", content: "What is a closure?" },
    { role: "assistant", content: "A closure captures variables from its outer scope." },
    { role: "user", content: "Give me a JavaScript example." }
  ]
});

/** Legacy Sydney `arguments` format (BingChat-era). */
export const sydneyBody = JSON.stringify({
  arguments: [
    {
      messages: [
        {
          author: "user",
          text: "What is the boiling point of water?"
        }
      ],
      conversationId: "conv-sydney-001",
      source: "cib"
    }
  ],
  invocationId: "0",
  target: "chat",
  type: 4
});

/** Body with no recognisable message field. */
export const noMessageBody = JSON.stringify({
  conversationId: "conv-empty",
  clientId: "client-empty"
});

/** Body with empty messages array. */
export const emptyMessagesBody = JSON.stringify({
  messages: []
});

/** Non-JSON body. */
export const nonJsonBody = "message=hello+world&conversationId=conv1";

/** SSE chunk with direct `text` string. */
export const sseTextChunk = JSON.stringify({
  text: "To reverse a linked list, iterate and re-link nodes.",
  type: "delta"
});

/** SSE chunk with OpenAI-compat `choices[0].delta.content`. */
export const sseChatDelta = JSON.stringify({
  id: "copilot-resp-001",
  choices: [
    {
      index: 0,
      delta: { content: "Dependency injection decouples component creation." },
      finish_reason: null
    }
  ]
});

/** SSE stream completion signal. */
export const sseDone = "[DONE]";

/** SSE final payload with `type: "final"`. */
export const sseFinalType = JSON.stringify({
  type: "final",
  conversationId: "conv-abc123"
});

/** SSE chunk with `finish_reason` set. */
export const sseFinishChunk = JSON.stringify({
  choices: [
    {
      index: 0,
      delta: {},
      finish_reason: "stop"
    }
  ]
});

/** SSE data chunk that is not valid JSON. */
export const sseMalformed = "}{broken";

/** SSE chunk with empty text field. */
export const sseEmptyText = JSON.stringify({
  text: "",
  type: "delta"
});

/** SignalR WebSocket frame (type 4) with arguments[0].message.text (current primary). */
export const signalRChatFrame = JSON.stringify({
  arguments: [
    {
      source: "cib",
      optionsSets: ["deepleo"],
      isStartOfSession: true,
      message: {
        locale: "en-US",
        market: "en-US",
        author: "user",
        inputMethod: "Keyboard",
        text: "How do I reverse a linked list?",
        messageType: "Chat"
      },
      conversationSignature: "sig-abc123",
      participant: { id: "client-001" },
      conversationId: "conv-ws-001"
    }
  ],
  invocationId: "0",
  target: "chat",
  type: 4
}) + "\u001e";

/** SignalR WebSocket response frame (type 1) with streaming text. */
export const signalRResponseFrame = JSON.stringify({
  type: 1,
  arguments: [
    {
      messages: [
        {
          text: "To reverse a linked list, iterate through nodes and re-link pointers.",
          author: "bot",
          messageType: "Chat",
          contentOrigin: "DeepLeo"
        }
      ]
    }
  ],
  invocationId: "0"
}) + "\u001e";
