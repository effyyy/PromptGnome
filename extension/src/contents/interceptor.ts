/**
 * Fetch interceptor content script for PromptGnome.
 *
 * Runs in the MAIN world at document_start to monkey-patch `window.fetch`
 * before the host page makes any requests. Intercepts outgoing AI chat
 * messages for PII scanning and reads streamed responses for audit.
 *
 * Security: fail-open on all errors, no functions exposed on `window`,
 * transparent monkey-patch, no PII logged.
 */

import type { PlasmoCSConfig } from "plasmo"
import type { BaseProviderAdapter } from "~src/providers/base-adapter"
import { getAdapterForUrlWithPageContext } from "~src/providers/registry"
import { createLogger } from "~src/utils/logger"
import { parseSSEStream } from "~src/utils/sse-parser"
import {
  isTrustedWindowMessage,
  postTrustedWindowMessage,
} from "~src/utils/window-message"

export const config: PlasmoCSConfig = {
  matches: [
    "https://chatgpt.com/*",
    "https://chat.openai.com/*",
    "https://claude.ai/*",
    "https://gemini.google.com/*",
    "https://chat.deepseek.com/*",
    "https://www.perplexity.ai/*",
    "https://perplexity.ai/*",
    "https://grok.com/*",
    "https://x.com/i/grok*",
    "https://copilot.microsoft.com/*",
    "https://www.meta.ai/*",
    "https://meta.ai/*"
  ],
  world: "MAIN",
  run_at: "document_start",
  all_frames: true
}

const RESPONSE_TIMEOUT_MS = 30_000
const CHANNEL_OUTBOUND = "pii-shield:outbound"
const CHANNEL_RESPONSE = "pii-shield:response"
const CHANNEL_RESPONSE_COMPLETE = "pii-shield:response-complete"
const CHANNEL_RESTORE_DRAFT = "pii-shield:restore-draft"
const CHANNEL_SCAN_COMPLETE = "pii-shield:scan-complete"
const CHANNEL_REQUEST_SENT = "pii-shield:request-sent"

/**
 * Marker used to identify postMessage payloads belonging to PromptGnome.
 * Both the MAIN-world interceptor and the isolated-world overlay check for
 * this flag to ignore unrelated messages.
 */
const MSG_NAMESPACE = "__piiShield"

/** Shape of every cross-world postMessage payload. */
interface ShieldMessage {
  readonly [MSG_NAMESPACE_KEY: string]: unknown
  readonly __piiShield: true
  readonly channel: string
}

/** Payload dispatched on the outbound channel. */
interface OutboundPayload extends ShieldMessage {
  readonly channel: typeof CHANNEL_OUTBOUND
  readonly messageText: string
  readonly provider: string
  readonly requestId: string
  readonly originalBody: string
}

/** Payload expected on the response channel from the isolated world. */
interface ResponsePayload extends ShieldMessage {
  readonly channel: typeof CHANNEL_RESPONSE
  readonly requestId: string
  readonly action: "proceed" | "modify" | "block"
  readonly modifiedBody?: string
  /** Number of PII matches found during the scan (0 for clean scans). */
  readonly matchCount?: number
}

/** Payload dispatched when a streamed response finishes. */
interface ResponseCompletePayload extends ShieldMessage {
  readonly channel: typeof CHANNEL_RESPONSE_COMPLETE
  readonly provider: string
  readonly responseText: string
}

/** Payload dispatched after every scan completes (clean or with detections). */
interface ScanCompletePayload extends ShieldMessage {
  readonly channel: typeof CHANNEL_SCAN_COMPLETE
  readonly provider: string
  readonly matchCount: number
}

/** Type guard: is this MessageEvent data a Shield message? */
function isShieldMessage(data: unknown): data is ShieldMessage {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as Record<string, unknown>)[MSG_NAMESPACE] === true
  )
}

/* IIFE closure -- nothing leaks to the global scope. */
;(function interceptorMain(): void {
  const log = createLogger("interceptor")
  const originalFetch = window.fetch.bind(window)
  const OriginalRequest = window.Request
  const OriginalHeaders = window.Headers
  const OriginalResponse = window.Response

  /** Current page hostname, captured once at init for cross-origin matching. */
  const pageHostname = window.location.hostname

  /** Running counter of all intercepted fetch calls for tracing. */
  let fetchCallCount = 0

  /** Generate a random ID for correlating outbound/response events. */
  function generateRequestId(): string {
    const buf = new Uint8Array(16)
    crypto.getRandomValues(buf)
    return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("")
  }

  /** Read body text from a Request, returning `null` on failure. */
  async function readBodyText(request: Request): Promise<string | null> {
    try {
      const text = await request.clone().text()
      log.debug("Body read", { byteLength: text.length, url: request.url.slice(0, 80) })
      return text
    } catch {
      log.warn("Failed to read request body", { url: request.url.slice(0, 80) })
      return null
    }
  }

  /**
   * Wait for a `pii-shield:response` postMessage matching the given
   * request ID. Resolves with the payload, or `null` on timeout.
   */
  function waitForResponse(requestId: string): Promise<ResponsePayload | null> {
    log.debug("Waiting for overlay decision", { requestId: requestId.slice(0, 8) })
    return new Promise<ResponsePayload | null>((resolve) => {
      let settled = false
      const startTime = performance.now()
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true
          window.removeEventListener("message", handler)
          log.debug("Response timeout — proceeding with original request", {
            requestId: requestId.slice(0, 8),
            waitedMs: Math.round(performance.now() - startTime),
          })
          resolve(null)
        }
      }, RESPONSE_TIMEOUT_MS)

      function handler(evt: MessageEvent): void {
        try {
          if (evt.origin !== window.location.origin) return
          if (!isTrustedWindowMessage(evt)) return

          const data = evt.data
          if (!isShieldMessage(data)) return
          if (data.channel !== CHANNEL_RESPONSE) return
          const payload = data as ResponsePayload
          if (payload.requestId === requestId && !settled) {
            settled = true
            clearTimeout(timer)
            window.removeEventListener("message", handler)
            log.info("Overlay decision received", {
              requestId: requestId.slice(0, 8),
              action: payload.action,
              waitedMs: Math.round(performance.now() - startTime),
              hasModifiedBody: payload.modifiedBody !== undefined,
            })
            resolve(payload)
          }
        } catch { /* ignore malformed messages */ }
      }
      window.addEventListener("message", handler)
    })
  }

  /** Build a new Request with a replaced body, preserving all other props. */
  function buildModifiedRequest(original: Request, newBody: string): Request {
    log.debug("Building modified request", {
      url: original.url.slice(0, 80),
      newBodyLen: newBody.length,
    })
    return new OriginalRequest(original.url, {
      method: original.method,
      headers: new OriginalHeaders(original.headers),
      body: newBody,
      mode: original.mode,
      credentials: original.credentials,
      cache: original.cache,
      redirect: original.redirect,
      referrer: original.referrer,
      referrerPolicy: original.referrerPolicy,
      integrity: original.integrity,
      signal: original.signal
    })
  }

  /**
   * Tee a fetch Response so the page gets the original stream
   * while we read the clone to accumulate streamed text.
   */
  function teeAndReadSSE(response: Response, adapter: BaseProviderAdapter): Response {
    try {
      if (!response.body) {
        log.warn("Response has no body to tee", { provider: adapter.name, status: response.status })
        return response
      }
      log.debug("Tee-ing SSE response stream", { provider: adapter.name, status: response.status })
      const [pageStream, readStream] = response.body.tee()
      consumeSSEStream(readStream, adapter).catch(() => {/* swallow */})
      return new OriginalResponse(pageStream, {
        status: response.status,
        statusText: response.statusText,
        headers: new OriginalHeaders(response.headers)
      })
    } catch {
      log.warn("Failed to tee response stream, returning original", { provider: adapter.name })
      return response
    }
  }

  /** Read an SSE stream to completion and dispatch a completion event. */
  async function consumeSSEStream(
    stream: ReadableStream<Uint8Array>,
    adapter: BaseProviderAdapter
  ): Promise<void> {
    const chunks: string[] = []
    let eventCount = 0
    log.debug("SSE stream reader started", { provider: adapter.name })
    try {
      for await (const sseEvent of parseSSEStream(stream)) {
        eventCount++
        const text = adapter.extractResponseText(sseEvent.data, sseEvent.event)
        if (text !== null) {
          chunks.push(text)
          log.debug("SSE chunk received", {
            provider: adapter.name,
            chunkLen: text.length,
            totalChunks: chunks.length,
            eventType: sseEvent.event ?? "(none)",
          })
        }
        if (adapter.isStreamComplete(sseEvent.data, sseEvent.event)) {
          log.debug("SSE stream complete signal received", { provider: adapter.name, eventCount })
          break
        }
      }
    } catch {
      log.warn("SSE stream reading encountered an error", { provider: adapter.name, eventCount })
    }

    if (chunks.length > 0) {
      const fullText = chunks.join("")
      const complete: ResponseCompletePayload = {
        __piiShield: true,
        channel: CHANNEL_RESPONSE_COMPLETE,
        provider: adapter.name,
        responseText: fullText,
      }
      postTrustedWindowMessage(complete)
      log.info("Response stream fully accumulated — postMessage dispatched", {
        provider: adapter.name,
        chunkCount: chunks.length,
        totalChars: fullText.length,
        totalEvents: eventCount,
      })
    } else {
      log.debug("SSE stream produced no usable text chunks", { provider: adapter.name, eventCount })
    }
  }

  /**
   * Handle a fetch call that matched a provider adapter. Extracts the user
   * message, dispatches for PII scanning, waits for a decision, and
   * optionally modifies the outgoing body.
   */
  async function handleMatchedRequest(
    request: Request,
    adapter: BaseProviderAdapter
  ): Promise<Response> {
    log.group(`handleMatchedRequest — ${adapter.name}`)
    log.info("Matched request entering pipeline", {
      provider: adapter.name,
      method: request.method,
      url: request.url.slice(0, 100),
    })

    const bodyText = await readBodyText(request)
    if (bodyText === null || bodyText.length === 0) {
      const logFn = request.method === "POST" ? log.info : log.debug
      logFn("Body empty/unreadable — skipping PII scan", {
        provider: adapter.name,
        method: request.method,
      })
      log.groupEnd()
      return callOriginalAndMaybeTee(request, adapter)
    }

    const userMessage = adapter.extractUserMessage(bodyText)
    if (userMessage === null) {
      log.info("No user message extracted from body — skipping PII scan", {
        provider: adapter.name,
        method: request.method,
        bodyLen: bodyText.length,
      })
      log.groupEnd()
      return callOriginalAndMaybeTee(request, adapter)
    }

    // Defense-in-depth: never delay a request waiting for an overlay
    // decision when the extracted "message" is structurally implausible
    // (empty, all-whitespace, or pathologically large). The same class of
    // bug that wedged Gemini's bootstrap with the recursive-search
    // fallback must not be reachable through any future adapter
    // regression.
    if (
      userMessage.trim().length === 0 ||
      userMessage.length > 200_000
    ) {
      log.warn("Extracted message failed sanity check — skipping PII scan", {
        provider: adapter.name,
        messageLen: userMessage.length,
      })
      log.groupEnd()
      return callOriginalAndMaybeTee(request, adapter)
    }

    log.info("User message extracted", {
      provider: adapter.name,
      messageLen: userMessage.length,
    })

    const requestId = generateRequestId()
    const outbound: OutboundPayload = {
      __piiShield: true,
      channel: CHANNEL_OUTBOUND,
      messageText: userMessage,
      provider: adapter.name,
      requestId,
      originalBody: bodyText,
    }
    log.info("Dispatching outbound postMessage for PII scan", {
      channel: CHANNEL_OUTBOUND,
      provider: adapter.name,
      requestId: requestId.slice(0, 8),
      messageLen: userMessage.length,
    })
    postTrustedWindowMessage(outbound)

    const decision = await waitForResponse(requestId)

    // Notify the overlay about every completed scan so it can update the
    // nudge counter and optionally show the "Did we miss something?" toast.
    const scanComplete: ScanCompletePayload = {
      __piiShield: true,
      channel: CHANNEL_SCAN_COMPLETE,
      provider: adapter.name,
      matchCount: decision?.matchCount ?? 0,
    }
    postTrustedWindowMessage(scanComplete)
    log.debug("Scan-complete event dispatched", {
      provider: adapter.name,
      matchCount: scanComplete.matchCount,
    })

    if (decision === null || decision.action === "proceed") {
      log.info("Action: PROCEED — sending original request", {
        provider: adapter.name,
        requestId: requestId.slice(0, 8),
        timedOut: decision === null,
      })
      postTrustedWindowMessage({
        __piiShield: true,
        channel: CHANNEL_REQUEST_SENT,
        provider: adapter.name,
      })
      log.groupEnd()
      return callOriginalAndMaybeTee(request, adapter)
    }

    if (decision.action === "block") {
      log.info("Action: BLOCK — request suppressed by user", {
        provider: adapter.name,
        requestId: requestId.slice(0, 8),
      })
      postTrustedWindowMessage({
        __piiShield: true,
        channel: CHANNEL_RESTORE_DRAFT,
        provider: adapter.name,
        messageText: userMessage,
      } satisfies ShieldMessage & { channel: string; provider: string; messageText: string | null })
      log.groupEnd()
      return new OriginalResponse("", { status: 200, statusText: "Blocked by PromptGnome" })
    }

    if (decision.action === "modify" && decision.modifiedBody !== undefined) {
      log.info("Action: MODIFY — sending anonymised request", {
        provider: adapter.name,
        requestId: requestId.slice(0, 8),
        modifiedBodyLen: decision.modifiedBody.length,
      })
      postTrustedWindowMessage({
        __piiShield: true,
        channel: CHANNEL_REQUEST_SENT,
        provider: adapter.name,
      })
      log.groupEnd()
      return callOriginalAndMaybeTee(buildModifiedRequest(request, decision.modifiedBody), adapter)
    }

    log.warn("Unknown action — falling through to original request", {
      action: (decision as ResponsePayload).action,
      requestId: requestId.slice(0, 8),
    })
    log.groupEnd()
    return callOriginalAndMaybeTee(request, adapter)
  }

  /** Call original fetch; if response is SSE, tee the stream for reading. */
  async function callOriginalAndMaybeTee(
    request: Request,
    adapter: BaseProviderAdapter
  ): Promise<Response> {
    log.debug("Calling original fetch", { url: request.url.slice(0, 100) })
    const response = await originalFetch(request)
    const ct = response.headers.get("content-type") ?? ""
    log.debug("Original fetch response received", {
      status: response.status,
      contentType: ct,
      isSSE: ct.includes("text/event-stream"),
    })
    return ct.includes("text/event-stream") ? teeAndReadSSE(response, adapter) : response
  }

  /** Extract a URL string from the various forms accepted by fetch(). */
  function resolveUrl(input: RequestInfo | URL): string | null {
    try {
      if (typeof input === "string") {
        // Resolve relative URLs (e.g. "/api/organizations/.../completion")
        // against the current page origin so hostname extraction works.
        try {
          return new URL(input, window.location.origin).href
        } catch {
          return input
        }
      }
      if (input instanceof URL) return input.href
      if (input instanceof OriginalRequest) return input.url
      return null
    } catch { return null }
  }

  // --- Monkey-patch window.fetch ---

  window.fetch = async function patchedFetch(
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    const callId = ++fetchCallCount
    try {
      const url = resolveUrl(input)
      if (url === null) {
        log.debug("fetch() called with unresolvable input — passing through", { callId })
        return originalFetch(input, init)
      }

      const adapter = getAdapterForUrlWithPageContext(url, pageHostname)
      if (adapter === null) {
        // Non-conversation requests (telemetry, analytics, sentinel pings,
        // etc.) are expected and frequent — log at debug to avoid console noise.
        const method = (init?.method ?? (input instanceof OriginalRequest ? input.method : "GET")).toUpperCase()
        if (method === "POST" && url.includes(pageHostname)) {
          log.debug("fetch() POST to current host — no adapter match", {
            callId,
            url: url.slice(0, 120),
          })
        }
        return originalFetch(input, init)
      }

      log.debug("fetch() — ADAPTER MATCHED, intercepting", {
        callId,
        provider: adapter.name,
        url: url.slice(0, 100),
      })

      const request = input instanceof OriginalRequest
        ? input : new OriginalRequest(input, init)
      return await handleMatchedRequest(request, adapter)
    } catch (err) {
      log.error("Interceptor error, falling through to original fetch", {
        callId,
        error: err instanceof Error ? err.name : "unknown-error",
      })
      return originalFetch(input, init)
    }
  }

  // Make the patch transparent to toString() / name inspection.
  Object.defineProperty(window.fetch, "toString", {
    value: () => "function fetch() { [native code] }",
    writable: true, configurable: true, enumerable: false
  })
  Object.defineProperty(window.fetch, "name", {
    value: "fetch", writable: false, configurable: true, enumerable: false
  })

  // --- Monkey-patch XMLHttpRequest ---
  //
  // Some providers (notably Gemini's BardChatUi StreamGenerate endpoint)
  // dispatch chat requests via XHR rather than fetch. We mirror the fetch
  // pipeline here: capture URL+body, extract user message, await overlay
  // decision via postMessage, then proceed / modify / block before calling
  // the original send(). Response-side teeing is intentionally omitted —
  // the providers that use XHR (Gemini) don't use SSE anyway, and DOM
  // re-hydration covers the response path.

  const OriginalXHR = window.XMLHttpRequest
  const origXhrOpen = OriginalXHR.prototype.open
  const origXhrSend = OriginalXHR.prototype.send

  interface ShieldXhr extends XMLHttpRequest {
    __piiShieldUrl?: string
    __piiShieldMethod?: string
  }

  let xhrCallCount = 0

  OriginalXHR.prototype.open = function patchedOpen(
    this: ShieldXhr,
    method: string,
    url: string | URL,
    ...rest: unknown[]
  ): void {
    try {
      this.__piiShieldMethod = String(method ?? "GET").toUpperCase()
      const urlStr = typeof url === "string" ? url : url.href
      try {
        this.__piiShieldUrl = new URL(urlStr, window.location.origin).href
      } catch {
        this.__piiShieldUrl = urlStr
      }
    } catch {
      /* ignore — fall through to original */
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (origXhrOpen as any).call(this, method, url, ...rest)
  } as typeof XMLHttpRequest.prototype.open

  OriginalXHR.prototype.send = function patchedSend(
    this: ShieldXhr,
    body?: Document | XMLHttpRequestBodyInit | null
  ): void {
    const callId = ++xhrCallCount
    const url = this.__piiShieldUrl
    try {
      if (!url) return origXhrSend.call(this, body as never)

      const adapter = getAdapterForUrlWithPageContext(url, pageHostname)
      if (adapter === null) return origXhrSend.call(this, body as never)

      // We can only inspect string bodies (form-encoded or raw JSON). Other
      // body types (FormData, Blob, ArrayBuffer) are passed through untouched.
      if (typeof body !== "string") {
        log.debug("xhr() matched but body is not a string — passing through", {
          callId,
          provider: adapter.name,
          bodyType: body === null ? "null" : typeof body,
        })
        return origXhrSend.call(this, body as never)
      }

      const userMessage = adapter.extractUserMessage(body)
      if (userMessage === null) {
        log.info("xhr() matched but no user message extracted — passing through", {
          callId,
          provider: adapter.name,
          bodyLen: body.length,
        })
        return origXhrSend.call(this, body as never)
      }

      // Defense-in-depth: an adapter regression that returned an
      // implausible string (empty, all-whitespace, or oversized) must NOT
      // cause the XHR to be held waiting for an overlay decision. Holding
      // bootstrap RPCs is what historically broke Gemini's init and
      // produced a black screen. Reject obvious structural false
      // positives here as a last line of defence.
      const trimmedMessage = userMessage.trim()
      const MAX_INTERCEPTABLE_MESSAGE_LEN = 200_000
      if (
        trimmedMessage.length === 0 ||
        userMessage.length > MAX_INTERCEPTABLE_MESSAGE_LEN
      ) {
        log.warn("xhr() extracted message failed sanity check — passing through", {
          callId,
          provider: adapter.name,
          messageLen: userMessage.length,
          trimmedLen: trimmedMessage.length,
        })
        return origXhrSend.call(this, body as never)
      }

      log.debug("xhr() — ADAPTER MATCHED, intercepting", {
        callId,
        provider: adapter.name,
        url: url.slice(0, 100),
        messageLen: userMessage.length,
      })

      const requestId = generateRequestId()
      const outbound: OutboundPayload = {
        __piiShield: true,
        channel: CHANNEL_OUTBOUND,
        messageText: userMessage,
        provider: adapter.name,
        requestId,
        originalBody: body,
      }
      postTrustedWindowMessage(outbound)

      // Defer the actual send until the overlay decision arrives. XHR allows
      // send() to be called any time after open() — the page is already in an
      // async wait via readystatechange handlers, so a few hundred ms of delay
      // is invisible.
      waitForResponse(requestId)
        .then((decision) => {
          const scanComplete: ScanCompletePayload = {
            __piiShield: true,
            channel: CHANNEL_SCAN_COMPLETE,
            provider: adapter.name,
            matchCount: decision?.matchCount ?? 0,
          }
          postTrustedWindowMessage(scanComplete)

          if (decision === null || decision.action === "proceed") {
            postTrustedWindowMessage({
              __piiShield: true,
              channel: CHANNEL_REQUEST_SENT,
              provider: adapter.name,
            })
            origXhrSend.call(this, body as never)
            return
          }

          if (decision.action === "block") {
            log.info("xhr() Action: BLOCK — request suppressed by user", {
              callId,
              provider: adapter.name,
            })
            postTrustedWindowMessage({
              __piiShield: true,
              channel: CHANNEL_RESTORE_DRAFT,
              provider: adapter.name,
              messageText: userMessage,
            } satisfies ShieldMessage & { channel: string; provider: string; messageText: string | null })
            // send() was never called, so the XHR sits in OPENED state. The
            // page will time out its own request — acceptable feedback for a
            // user-initiated block.
            return
          }

          if (decision.action === "modify" && decision.modifiedBody !== undefined) {
            log.info("xhr() Action: MODIFY — sending anonymised request", {
              callId,
              provider: adapter.name,
              modifiedBodyLen: decision.modifiedBody.length,
            })
            postTrustedWindowMessage({
              __piiShield: true,
              channel: CHANNEL_REQUEST_SENT,
              provider: adapter.name,
            })
            origXhrSend.call(this, decision.modifiedBody as never)
            return
          }

          log.warn("xhr() unknown action — falling through to original send", {
            callId,
            action: (decision as ResponsePayload).action,
          })
          origXhrSend.call(this, body as never)
        })
        .catch((err: unknown) => {
          log.error("xhr() interceptor error, falling through", {
            callId,
            error: err instanceof Error ? err.name : "unknown-error",
          })
          try { origXhrSend.call(this, body as never) } catch { /* ignore */ }
        })

      return
    } catch (err) {
      log.error("xhr() interceptor exception, falling through", {
        callId,
        error: err instanceof Error ? err.name : "unknown-error",
      })
      return origXhrSend.call(this, body as never)
    }
  } as typeof XMLHttpRequest.prototype.send

  Object.defineProperty(OriginalXHR.prototype.open, "toString", {
    value: () => "function open() { [native code] }",
    writable: true, configurable: true, enumerable: false,
  })
  Object.defineProperty(OriginalXHR.prototype.send, "toString", {
    value: () => "function send() { [native code] }",
    writable: true, configurable: true, enumerable: false,
  })

  // Use warn level so this message is always visible regardless of log level
  // settings — confirms the interceptor is running on every page load.
  log.debug("Fetch + XHR interceptor installed — window.fetch and XMLHttpRequest are now patched", {
    timeout: RESPONSE_TIMEOUT_MS,
    hostname: window.location.hostname,
  })
})()
