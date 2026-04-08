/**
 * MutationObserver-based DOM re-hydration for anonymized placeholders.
 * Listens for CHANNEL_RESPONSE_COMPLETE and replaces [TYPE_N] with originals.
 * Depends on placeholder-scanner for token detection and SessionMapper for lookups.
 * Architecture layer: Rehydration
 */

import { scanForPlaceholders } from "./placeholder-scanner"
import type { SessionMapper } from "~src/anonymization/session-mapper"
import { createLogger } from "~src/utils/logger"

const log = createLogger("dom-replacer")

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Inline style applied to the `<span>` elements that wrap re-hydrated values.
 * Uses inline styles (not CSS classes) because re-hydration runs in the host
 * page DOM, not inside the extension's shadow DOM.
 */
const HIGHLIGHT_STYLE =
  "background: rgba(0, 255, 200, 0.12); border-radius: 2px; padding: 0 2px;"

// ---------------------------------------------------------------------------
// DomReplacer
// ---------------------------------------------------------------------------

/**
 * Replaces `[TYPE_N]` placeholder tokens found in DOM text nodes with their
 * original PII values, wrapping each replacement in a highlighted `<span>`.
 *
 * Two usage patterns are supported:
 * 1. **Event-driven**: call {@link startObserving} to begin watching a target
 *    element.  When a `pii-shield:response-complete` window message arrives the
 *    replacer runs a full walk of the target subtree.
 * 2. **Direct**: call {@link replaceInNode} at any time to scan and replace
 *    placeholders within an arbitrary DOM node.
 *
 * @example
 * ```ts
 * const replacer = new DomReplacer()
 * replacer.startObserving(responseContainer, sessionMapper)
 * // …later…
 * replacer.stopObserving()
 * ```
 */
export class DomReplacer {
  private observer: MutationObserver | null = null
  private messageHandler: ((event: MessageEvent) => void) | null = null

  // -------------------------------------------------------------------------
  // startObserving
  // -------------------------------------------------------------------------

  /**
   * Start observing a DOM node and listen for the stream-completion signal.
   *
   * When a `window` message is received whose `data` object has both
   * `__piiShield: true` and `channel: "pii-shield:response-complete"`, a full
   * replacement pass is run on `targetNode`.
   *
   * A `MutationObserver` is also attached to `targetNode` for future use
   * (incremental replacement on streaming updates).
   *
   * @param targetNode - The DOM element containing the AI provider's response.
   * @param mapper - Session mapper that holds the placeholder ↔ value mappings.
   * @returns `void`
   * @throws Never — errors are swallowed to avoid breaking the host page.
   */
  startObserving(targetNode: Element, mapper: SessionMapper): void {
    log.info("Starting DOM observation for rehydration", {
      targetTag: targetNode.tagName.toLowerCase(),
      targetId: targetNode.id || "(none)",
    })

    this.messageHandler = (event: MessageEvent) => {
      try {
        const data: unknown = event.data
        if (
          typeof data === "object" &&
          data !== null &&
          (data as Record<string, unknown>)["__piiShield"] === true &&
          (data as Record<string, unknown>)["channel"] ===
            "pii-shield:response-complete"
        ) {
          log.info("Response-complete signal received — starting rehydration")
          const t0 = performance.now()
          this.replaceInNode(targetNode, mapper)
          log.info("Rehydration pass complete", {
            elapsedMs: (performance.now() - t0).toFixed(2),
          })
        }
      } catch {
        // Silently ignore parse / replacement errors to avoid breaking the page.
      }
    }

    window.addEventListener("message", this.messageHandler)

    this.observer = new MutationObserver(() => {
      // Reserved for future incremental replacement on streamed content.
    })
    this.observer.observe(targetNode, {
      childList: true,
      subtree: true,
      characterData: true,
    })
  }

  // -------------------------------------------------------------------------
  // stopObserving
  // -------------------------------------------------------------------------

  /**
   * Stop observing and clean up all event listeners.
   *
   * Safe to call even if {@link startObserving} was never called.
   *
   * @returns `void`
   */
  stopObserving(): void {
    log.info("Stopping DOM observation")
    if (this.observer !== null) {
      this.observer.disconnect()
      this.observer = null
    }
    if (this.messageHandler !== null) {
      window.removeEventListener("message", this.messageHandler)
      this.messageHandler = null
    }
  }

  // -------------------------------------------------------------------------
  // replaceInNode
  // -------------------------------------------------------------------------

  /**
   * Walk all text nodes within `node` and replace any `[TYPE_N]` placeholders
   * with their original values from `mapper`.
   *
   * Each replacement is wrapped in a `<span data-pii-rehydrated="true">` with
   * a subtle background highlight.  Unknown placeholders (no mapper entry) are
   * left unchanged.
   *
   * @param node - Root node whose entire text-node subtree will be scanned.
   * @param mapper - Session mapper used to resolve placeholder → original value.
   * @returns `void`
   * @throws Never — errors are swallowed to avoid breaking the host page.
   * @example
   * ```ts
   * container.textContent = "Your email is [EMAIL_1]."
   * replacer.replaceInNode(container, mapper)
   * // container now contains a <span data-pii-rehydrated="true"> with the email
   * ```
   */
  replaceInNode(node: Node, mapper: SessionMapper): void {
    try {
      const textNodes = this.collectTextNodes(node)
      let replacedCount = 0
      for (const textNode of textNodes) {
        const text = textNode.textContent
        if (text) {
          const before = scanForPlaceholders(text)
          if (before.length > 0) {
            replacedCount += before.length
          }
        }
        this.replaceInTextNode(textNode, mapper)
      }
      log.info("replaceInNode scan complete", {
        textNodesScanned: textNodes.length,
        placeholdersFound: replacedCount,
      })
    } catch {
      // Fail silently — never break the host page.
    }
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Collect all text-node descendants of `root` into a flat array.
   *
   * @param root - The node to walk.
   * @returns Array of `Text` nodes in document order.
   */
  private collectTextNodes(root: Node): Text[] {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    const nodes: Text[] = []
    let current: Text | null
    while ((current = walker.nextNode() as Text | null) !== null) {
      nodes.push(current)
    }
    return nodes
  }

  /**
   * Replace all placeholders within a single text node.
   *
   * If no placeholders are found the node is left untouched.  If at least one
   * placeholder is found the text node is replaced with a `DocumentFragment`
   * that alternates plain text nodes with highlighted `<span>` elements.
   *
   * @param textNode - The text node to inspect and potentially replace.
   * @param mapper - Session mapper for reverse lookup.
   */
  private replaceInTextNode(textNode: Text, mapper: SessionMapper): void {
    const text = textNode.textContent
    if (!text) return

    const matches = scanForPlaceholders(text)
    if (matches.length === 0) return

    const fragment = document.createDocumentFragment()
    let lastIndex = 0

    for (const match of matches) {
      // Append any leading plain text before this placeholder.
      if (match.start > lastIndex) {
        fragment.appendChild(
          document.createTextNode(text.slice(lastIndex, match.start)),
        )
      }

      const original = mapper.getOriginalValue(match.placeholder)
      if (original !== null) {
        // Replace with a highlighted span.
        const span = document.createElement("span")
        span.textContent = original
        span.setAttribute("style", HIGHLIGHT_STYLE)
        span.setAttribute("data-pii-rehydrated", "true")
        fragment.appendChild(span)
      } else {
        // Unknown placeholder — leave it as plain text.
        fragment.appendChild(document.createTextNode(match.placeholder))
      }

      lastIndex = match.end
    }

    // Append any trailing plain text after the last placeholder.
    if (lastIndex < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(lastIndex)))
    }

    textNode.parentNode?.replaceChild(fragment, textNode)
  }
}
