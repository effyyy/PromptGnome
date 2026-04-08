/**
 * Generic Server-Sent Events parser for AI provider response streams.
 * Implements the SSE specification (https://html.spec.whatwg.org/multipage/server-sent-events.html)
 * with support for partial chunk reassembly across stream boundaries.
 */

/**
 * A single SSE event parsed from the stream.
 */
export interface SSEEvent {
  /** The event type field (defaults to undefined if not specified). */
  event?: string
  /** The data payload, with multi-line values joined by newlines. */
  data: string
  /** The last event ID string. */
  id?: string
  /** Reconnection time in milliseconds. */
  retry?: number
}

/**
 * Internal mutable state for the event currently being assembled
 * from successive field lines before a blank-line dispatch.
 */
interface PendingEvent {
  event: string | undefined
  dataLines: string[]
  id: string | undefined
  retry: number | undefined
}

/**
 * Creates a fresh pending event with empty state.
 */
function createPendingEvent(): PendingEvent {
  return { event: undefined, dataLines: [], id: undefined, retry: undefined }
}

/**
 * Returns true when the pending event carries at least one data line,
 * meaning it should be dispatched.
 */
function hasPendingData(pending: PendingEvent): boolean {
  return pending.dataLines.length > 0
}

/**
 * Converts a pending event into a finalized SSEEvent.
 */
function finalizePendingEvent(pending: PendingEvent): SSEEvent {
  const result: SSEEvent = {
    data: pending.dataLines.join("\n"),
  }
  if (pending.event !== undefined) {
    result.event = pending.event
  }
  if (pending.id !== undefined) {
    result.id = pending.id
  }
  if (pending.retry !== undefined) {
    result.retry = pending.retry
  }
  return result
}

/**
 * Applies a single SSE field line to the pending event accumulator.
 * Handles the field names: data, event, id, retry.
 * Lines starting with a colon are comments and are ignored.
 */
function applyFieldLine(
  line: string,
  pending: PendingEvent
): void {
  if (line.startsWith(":")) {
    return
  }

  const colonIdx = line.indexOf(":")
  let field: string
  let value: string

  if (colonIdx === -1) {
    field = line
    value = ""
  } else {
    field = line.slice(0, colonIdx)
    value = line.slice(colonIdx + 1)
    if (value.startsWith(" ")) {
      value = value.slice(1)
    }
  }

  switch (field) {
    case "data":
      pending.dataLines.push(value)
      break
    case "event":
      pending.event = value
      break
    case "id":
      if (!value.includes("\0")) {
        pending.id = value
      }
      break
    case "retry": {
      const parsed = parseInt(value, 10)
      if (!isNaN(parsed) && String(parsed) === value.trim()) {
        pending.retry = parsed
      }
      break
    }
    default:
      break
  }
}

/**
 * Parses a ReadableStream of raw bytes into an async generator of SSE events.
 *
 * Handles:
 * - Multi-line `data:` fields (concatenated with newlines)
 * - `event`, `id`, and `retry` fields
 * - Comment lines (prefixed with `:`)
 * - Partial chunks split across stream reads
 * - Blank-line event dispatch per the SSE specification
 *
 * @param stream - A ReadableStream of UTF-8 encoded bytes (e.g. from fetch)
 * @yields Parsed SSEEvent objects as they become complete
 *
 * @example
 * ```ts
 * for await (const event of parseSSEStream(response.body!)) {
 *   console.log(event.event, event.data);
 * }
 * ```
 */
export async function* parseSSEStream(
  stream: ReadableStream<Uint8Array>
): AsyncGenerator<SSEEvent> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let pending = createPendingEvent()

  try {
    while (true) {
      const { done, value } = await reader.read()

      if (done) {
        break
      }

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split(/\r\n|\r|\n/)
      buffer = lines.pop() ?? ""

      for (const line of lines) {
        if (line === "") {
          if (hasPendingData(pending)) {
            yield finalizePendingEvent(pending)
          }
          pending = createPendingEvent()
        } else {
          applyFieldLine(line, pending)
        }
      }
    }

    buffer += decoder.decode()
    if (buffer !== "") {
      applyFieldLine(buffer, pending)
    }
    if (hasPendingData(pending)) {
      yield finalizePendingEvent(pending)
    }
  } finally {
    reader.releaseLock()
  }
}
