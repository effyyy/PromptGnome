/**
 * Vitest tests for the SSE parser.
 * Covers standard events, multi-line data, event types, partial chunks,
 * comments, empty events, retry fields, id fields, and edge cases.
 */
import { describe, it, expect } from "vitest"
import { parseSSEStream, type SSEEvent } from "~/src/utils/sse-parser"

/** Creates a ReadableStream from an array of string chunks. */
function chunkedStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  let index = 0
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index]))
        index++
      } else {
        controller.close()
      }
    },
  })
}

/** Creates a ReadableStream from a single SSE text block. */
function stream(text: string): ReadableStream<Uint8Array> {
  return chunkedStream([text])
}

/** Collects all events from the async generator into an array. */
async function collect(s: ReadableStream<Uint8Array>): Promise<SSEEvent[]> {
  const events: SSEEvent[] = []
  for await (const event of parseSSEStream(s)) {
    events.push(event)
  }
  return events
}

describe("parseSSEStream", () => {
  it("parses a single standard event", async () => {
    const events = await collect(stream("data: hello world\n\n"))
    expect(events).toHaveLength(1)
    expect(events[0].data).toBe("hello world")
    expect(events[0].event).toBeUndefined()
    expect(events[0].id).toBeUndefined()
    expect(events[0].retry).toBeUndefined()
  })

  it("parses multiple sequential events", async () => {
    const events = await collect(stream("data: first\n\ndata: second\n\ndata: third\n\n"))
    expect(events).toHaveLength(3)
    expect(events[0].data).toBe("first")
    expect(events[1].data).toBe("second")
    expect(events[2].data).toBe("third")
  })

  it("concatenates multi-line data fields with newlines", async () => {
    const events = await collect(stream("data: line one\ndata: line two\ndata: line three\n\n"))
    expect(events).toHaveLength(1)
    expect(events[0].data).toBe("line one\nline two\nline three")
  })

  it("parses event type field", async () => {
    const events = await collect(stream("event: update\ndata: payload\n\n"))
    expect(events).toHaveLength(1)
    expect(events[0].event).toBe("update")
    expect(events[0].data).toBe("payload")
  })

  it("parses id field", async () => {
    const events = await collect(stream("id: 42\ndata: with id\n\n"))
    expect(events).toHaveLength(1)
    expect(events[0].id).toBe("42")
    expect(events[0].data).toBe("with id")
  })

  it("parses retry field with valid integer", async () => {
    const events = await collect(stream("retry: 3000\ndata: reconnect info\n\n"))
    expect(events).toHaveLength(1)
    expect(events[0].retry).toBe(3000)
  })

  it("ignores retry field with non-integer value", async () => {
    const events = await collect(stream("retry: not-a-number\ndata: test\n\n"))
    expect(events).toHaveLength(1)
    expect(events[0].retry).toBeUndefined()
  })

  it("ignores comment lines (colon-prefixed)", async () => {
    const events = await collect(stream(": this is a comment\ndata: visible\n\n"))
    expect(events).toHaveLength(1)
    expect(events[0].data).toBe("visible")
  })

  it("ignores comment-only blocks without dispatching events", async () => {
    const events = await collect(stream(": comment one\n: comment two\n\ndata: after comments\n\n"))
    expect(events).toHaveLength(1)
    expect(events[0].data).toBe("after comments")
  })

  it("skips blank-line separators with no pending data", async () => {
    const events = await collect(stream("\n\n\ndata: after blanks\n\n"))
    expect(events).toHaveLength(1)
    expect(events[0].data).toBe("after blanks")
  })

  it("handles data split across multiple stream chunks", async () => {
    const events = await collect(chunkedStream(["dat", "a: split acr", "oss chunks\n\n"]))
    expect(events).toHaveLength(1)
    expect(events[0].data).toBe("split across chunks")
  })

  it("handles event boundary split across chunks", async () => {
    const events = await collect(chunkedStream(["data: first\n\ndata: sec", "ond\n\n"]))
    expect(events).toHaveLength(2)
    expect(events[0].data).toBe("first")
    expect(events[1].data).toBe("second")
  })

  it("handles newline split across chunks for multi-line data", async () => {
    const events = await collect(chunkedStream(["data: alpha\n", "data: beta\n\n"]))
    expect(events).toHaveLength(1)
    expect(events[0].data).toBe("alpha\nbeta")
  })

  it("handles data field with no space after colon", async () => {
    const events = await collect(stream("data:no-space\n\n"))
    expect(events).toHaveLength(1)
    expect(events[0].data).toBe("no-space")
  })

  it("handles data field with empty value", async () => {
    const events = await collect(stream("data:\n\n"))
    expect(events).toHaveLength(1)
    expect(events[0].data).toBe("")
  })

  it("handles data field with only a space (stripped to empty)", async () => {
    const events = await collect(stream("data: \n\n"))
    expect(events).toHaveLength(1)
    expect(events[0].data).toBe("")
  })

  it("handles field with no colon (value defaults to empty string)", async () => {
    const events = await collect(stream("data\n\n"))
    expect(events).toHaveLength(1)
    expect(events[0].data).toBe("")
  })

  it("dispatches pending event at end-of-stream without trailing blank line", async () => {
    const events = await collect(stream("data: no trailing newline"))
    expect(events).toHaveLength(1)
    expect(events[0].data).toBe("no trailing newline")
  })

  it("parses a complex event with all fields", async () => {
    const text = "id: evt-99\nevent: content_block_delta\nretry: 5000\ndata: line 1\ndata: line 2\n\n"
    const events = await collect(stream(text))
    expect(events).toHaveLength(1)
    expect(events[0]).toEqual({
      id: "evt-99",
      event: "content_block_delta",
      retry: 5000,
      data: "line 1\nline 2",
    })
  })

  it("handles \\r\\n line endings", async () => {
    const events = await collect(stream("data: crlf\r\n\r\n"))
    expect(events).toHaveLength(1)
    expect(events[0].data).toBe("crlf")
  })

  it("handles \\r line endings", async () => {
    const events = await collect(stream("data: cr-only\r\r"))
    expect(events).toHaveLength(1)
    expect(events[0].data).toBe("cr-only")
  })

  it("handles mixed event types in sequence", async () => {
    const text = [
      "event: message_start", "data: {\"type\":\"message_start\"}", "",
      "event: content_block_delta", "data: {\"delta\":{\"text\":\"Hi\"}}", "",
      "event: message_stop", "data: {\"type\":\"message_stop\"}", "",
    ].join("\n") + "\n"
    const events = await collect(stream(text))
    expect(events).toHaveLength(3)
    expect(events[0].event).toBe("message_start")
    expect(events[1].event).toBe("content_block_delta")
    expect(events[2].event).toBe("message_stop")
  })

  it("ignores unknown field names per the SSE spec", async () => {
    const events = await collect(stream("unknown: value\ndata: kept\n\n"))
    expect(events).toHaveLength(1)
    expect(events[0].data).toBe("kept")
    expect((events[0] as unknown as Record<string, unknown>)["unknown"]).toBeUndefined()
  })

  it("produces no events from an empty stream", async () => {
    const events = await collect(stream(""))
    expect(events).toHaveLength(0)
  })

  it("handles JSON data payloads from AI provider streams", async () => {
    const json = JSON.stringify({ choices: [{ delta: { content: "Hello" } }] })
    const events = await collect(stream(`data: ${json}\n\n`))
    expect(events).toHaveLength(1)
    expect(JSON.parse(events[0].data).choices[0].delta.content).toBe("Hello")
  })

  it("handles [DONE] sentinel used by ChatGPT", async () => {
    const text = "data: {\"choices\":[{\"delta\":{\"content\":\"Hi\"}}]}\n\ndata: [DONE]\n\n"
    const events = await collect(stream(text))
    expect(events).toHaveLength(2)
    expect(events[1].data).toBe("[DONE]")
  })

  it("rejects id fields containing null characters", async () => {
    const events = await collect(stream("id: bad\0id\ndata: test\n\n"))
    expect(events).toHaveLength(1)
    expect(events[0].id).toBeUndefined()
  })

  it("handles many small single-byte chunks", async () => {
    const events = await collect(chunkedStream("data: tiny\n\n".split("")))
    expect(events).toHaveLength(1)
    expect(events[0].data).toBe("tiny")
  })
})
