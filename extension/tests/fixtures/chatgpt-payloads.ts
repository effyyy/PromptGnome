/**
 * Mock request/response payloads for ChatGPT adapter tests.
 *
 * Based on observed ChatGPT API traffic patterns.
 */

/** Standard new-message request body. */
export const validRequestBody = JSON.stringify({
  action: "next",
  messages: [
    {
      id: "msg-abc123",
      author: { role: "user" },
      content: {
        content_type: "text",
        parts: ["What is the capital of France?"]
      },
      metadata: {}
    }
  ],
  parent_message_id: "parent-xyz789",
  model: "gpt-4o",
  timezone_offset_min: -60
});

/** Edit-message request body (user corrects a previous message). */
export const editMessageBody = JSON.stringify({
  action: "variant",
  messages: [
    {
      id: "msg-old-111",
      author: { role: "user" },
      content: {
        content_type: "text",
        parts: ["Original question"]
      }
    },
    {
      id: "msg-edit-222",
      author: { role: "user" },
      content: {
        content_type: "text",
        parts: ["Updated question about TypeScript"]
      }
    }
  ],
  parent_message_id: "parent-abc",
  model: "gpt-4o"
});

/** Multi-part content (e.g. image + text). */
export const multiPartBody = JSON.stringify({
  action: "next",
  messages: [
    {
      id: "msg-multi",
      author: { role: "user" },
      content: {
        content_type: "multimodal_text",
        parts: [
          { content_type: "image_asset_pointer", asset_pointer: "file://img" },
          "Describe this image"
        ]
      }
    }
  ],
  model: "gpt-4o"
});

/** Body with empty messages array. */
export const emptyMessagesBody = JSON.stringify({
  action: "next",
  messages: [],
  model: "gpt-4o"
});

/** Non-JSON body (e.g. form-encoded). */
export const nonJsonBody = "action=next&message=hello";

/** Body with missing content parts. */
export const missingPartsBody = JSON.stringify({
  action: "next",
  messages: [
    {
      id: "msg-no-parts",
      author: { role: "user" },
      content: { content_type: "text" }
    }
  ]
});

/** SSE data chunk with assistant response. */
export const sseAssistantResponse = JSON.stringify({
  message: {
    id: "msg-resp-001",
    author: { role: "assistant" },
    content: {
      content_type: "text",
      parts: ["The capital of France is Paris."]
    },
    status: "in_progress"
  },
  conversation_id: "conv-123",
  error: null
});

/** SSE data chunk with system message (should be skipped). */
export const sseSystemMessage = JSON.stringify({
  message: {
    id: "msg-sys-001",
    author: { role: "system" },
    content: {
      content_type: "text",
      parts: ["System prompt text"]
    }
  }
});

/** SSE stream completion signal. */
export const sseDone = "[DONE]";

/** SSE data chunk that is not valid JSON. */
export const sseMalformed = "not valid json {{{";

/** SSE data chunk with empty content parts. */
export const sseEmptyParts = JSON.stringify({
  message: {
    id: "msg-empty",
    author: { role: "assistant" },
    content: {
      content_type: "text",
      parts: []
    }
  }
});
