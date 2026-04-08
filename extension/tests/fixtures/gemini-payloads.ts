/**
 * Mock request/response payloads for Gemini adapter tests.
 *
 * Based on observed Gemini API traffic patterns. Gemini uses deeply
 * nested JSON arrays with a proprietary RPC format.
 */

/** Request body with message at path [0, 2, 0, 0]. */
export const validRequestBodyPath0200 = JSON.stringify([
  [
    null,
    null,
    [["How do I write a Python function?"]]
  ]
]);

/** Request body with message at path [0, 2, 0]. */
export const validRequestBodyPath020 = JSON.stringify([
  [
    null,
    null,
    ["Tell me about machine learning"]
  ]
]);

/** Request body with message at path [2, 0, 0]. */
export const validRequestBodyPath200 = JSON.stringify([
  null,
  null,
  [["What is recursion?"]]
]);

/**
 * Deeply nested body without the chat-envelope leading-nulls signature.
 *
 * Pre-fix this body matched via the recursive `findFirstString` fallback
 * and was returned as a "user message", causing false positives that
 * wedged Gemini's bootstrap. Post-fix it must return `null`.
 */
export const deepNestedBody = JSON.stringify([
  [
    [
      [
        [
          "Deeply nested question about APIs"
        ]
      ]
    ]
  ]
]);

/**
 * Realistic Gemini bootstrap batchexecute body. Uses the standard Google
 * batchexecute envelope `[[[rpcid_string, args_json_string, null, idx]]]`
 * with no leading-nulls header. This is the shape Gemini fires dozens of
 * times during page init. The adapter MUST return `null` for these — if
 * it doesn't, the XHR interceptor defers `send()` waiting for an overlay
 * decision and the page never finishes initialising (black screen).
 */
export const bootstrapBatchexecuteBody = `at=SNlM0e_token&f.req=${encodeURIComponent(
  JSON.stringify([
    [
      ["abc123Rpc", JSON.stringify(["config", "value", 42]), null, "1"],
      ["def456Rpc", JSON.stringify({ flag: true }), null, "2"],
    ],
    null,
    "batch-id-1",
  ])
)}`;

/**
 * Realistic Gemini bootstrap batchexecute body where the first element of
 * `f.req[0][0]` is itself a string (the rpcid) — the canonical Google
 * batchexecute shape. Pre-fix this matched path `[0,0,0]` and was treated
 * as a user message of "abc123Rpc". Post-fix it must return `null`.
 */
export const bootstrapBatchexecuteShortBody = `f.req=${encodeURIComponent(
  JSON.stringify([[["abc123Rpc", "[\"x\"]", null, "1"]]])
)}`;

/**
 * Form-encoded chat send wrapped in a real batchexecute envelope. The
 * inner args string contains the chat envelope with leading nulls. The
 * adapter MUST extract the user message via the variant-C re-parse path.
 */
export const chatBatchexecuteEnvelopeBody = `at=token&f.req=${encodeURIComponent(
  JSON.stringify([
    [
      [
        "MkEWBc",
        JSON.stringify([[null, null, [["What is recursion?"]]]]),
        null,
        "1",
      ],
    ],
    null,
    "batch-id-2",
  ])
)}`;

/** Form-encoded body whose extracted "message" is whitespace-only — must be rejected. */
export const whitespaceOnlyBody = `f.req=${encodeURIComponent(
  JSON.stringify([null, null, [["   \t\n  "]]])
)}`;

/** Empty array body. */
export const emptyArrayBody = JSON.stringify([]);

/** Non-JSON body. */
export const nonJsonBody = "binary-looking-data-here";

/** Object instead of array (unexpected format). */
export const objectBody = JSON.stringify({
  query: "This is not how Gemini sends data"
});

/** Response chunk with text at path [0, 0]. */
export const sseResponsePath00 = JSON.stringify([
  ["Here is how you write a Python function:"]
]);

/** Response chunk with text at path [0, 2, 0, 0]. */
export const sseResponsePath0200 = JSON.stringify([
  [
    null,
    null,
    [["def hello(): print('hello')"]]
  ]
]);

/** Response chunk that is an empty array (completion signal). */
export const sseEmptyArray = JSON.stringify([]);

/** Response chunk that is null (completion signal). */
export const sseNull = "null";

/** Response chunk that is empty string. */
export const sseEmpty = "";

/** Response chunk with non-text data (numbers). */
export const sseNumericData = JSON.stringify([
  [42, 100, 200]
]);

/** Response chunk that is not valid JSON. */
export const sseMalformed = ")]}'not-json";

/** Response chunk with nested empty arrays. */
export const sseNestedEmpty = JSON.stringify([[[]]]);

/** Form-encoded request body with f.req parameter (current BardChatUi format). */
export const formEncodedBody = `at=SNlM0e_token_here&f.req=${encodeURIComponent(JSON.stringify([
  [
    null,
    null,
    [["How do I write a Python function?"]]
  ]
]))}`;

/**
 * Real-world Gemini StreamGenerate body (BardChatUi 2026-04 format).
 *
 * `f.req` is `[null, "<json-string>"]` where the inner string re-parses to
 * `[["<message>", 0, null, null, null, null, 0], ["en-GB"], [...ids...], "<token>", ...]`.
 * Captured from a live POST to
 * `gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate`.
 */
export const realStreamGenerateBody = `f.req=${encodeURIComponent(
  JSON.stringify([
    null,
    JSON.stringify([
      ["What is the meaning of life?", 0, null, null, null, null, 0],
      ["en-GB"],
      ["c_abc", "r_def", "rc_ghi", null, null, null, null, null, null, ""],
      "!token",
      "hash",
      null,
      [1],
      1,
    ]),
  ])
)}&at=token`;

/** Form-encoded body with no f.req param (invalid). */
export const formEncodedNoFreq = "at=SNlM0e_token_here&other_param=value";
