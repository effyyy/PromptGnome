/**
 * Input monitor for contenteditable elements used by AI chatbot providers.
 *
 * Walks the DOM tree of a contenteditable element, extracts plain text, and
 * builds a per-character offset mapping back to the source Text nodes so that
 * callers can construct Selection / Range objects without re-walking the DOM.
 * Layer: highlighting subsystem — feeds TextMapping snapshots to the detection
 * scheduler on every user edit.
 */

import { createLogger } from "~src/utils/logger"
import type { TextMapping, TextNodeOffset, OnTextChangeCallback } from "./types"

const log = createLogger("input-monitor")

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * HTML tag names that represent block-level boundaries.
 * A synthetic newline character is inserted into the plain-text output
 * before descending into these elements so that paragraphs remain separated.
 */
const BLOCK_TAGS = new Set([
  "P", "DIV", "LI", "H1", "H2", "H3", "H4", "H5", "H6",
  "BLOCKQUOTE", "PRE", "TR",
])

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Options accepted by {@link createInputMonitor}.
 */
export interface InputMonitorOptions {
  /** The contenteditable element to monitor. */
  readonly inputElement: HTMLElement
  /** Called each time the plain-text content of the element changes. */
  readonly onTextChange: OnTextChangeCallback
}

// ---------------------------------------------------------------------------
// extractTextMapping
// ---------------------------------------------------------------------------

/**
 * Mutable accumulator used internally by {@link walkNode}.
 */
interface WalkAccumulator {
  chars: string[]
  offsets: Array<TextNodeOffset | null>
}

/**
 * Inserts a synthetic newline character with a null offset into the accumulator.
 *
 * @param acc - The walk accumulator to mutate.
 */
function pushNewline(acc: WalkAccumulator): void {
  acc.chars.push("\n")
  acc.offsets.push(null)
}

/**
 * Recursively walks a DOM node, appending plain-text characters and their
 * corresponding {@link TextNodeOffset} entries to {@link acc}.
 *
 * Block-level elements get a preceding newline; BR elements get a newline
 * and stop recursion. Text nodes contribute their characters directly.
 * All other node types are silently skipped.
 *
 * @param node - The current DOM node to walk.
 * @param acc  - Accumulator that collects chars and offsets.
 * @param isRoot - True only for the top-level element (suppresses leading newline).
 */
function walkNode(node: Node, acc: WalkAccumulator, isRoot: boolean): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node as Text
    const content = text.data
    for (let i = 0; i < content.length; i++) {
      acc.chars.push(content[i])
      acc.offsets.push({ node: text, offset: i })
    }
    return
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return
  }

  const el = node as Element
  const tag = el.tagName

  if (tag === "BR") {
    pushNewline(acc)
    return
  }

  const isBlock = BLOCK_TAGS.has(tag)
  if (isBlock && !isRoot) {
    pushNewline(acc)
  }

  for (let i = 0; i < el.childNodes.length; i++) {
    walkNode(el.childNodes[i], acc, false)
  }
}

/**
 * Extracts the plain text and per-character DOM offset mapping from a
 * contenteditable element or native input/textarea.
 *
 * For contenteditable elements, walks the DOM tree and builds per-character
 * offsets to the source {@link Text} nodes. For textarea/input elements,
 * reads `.value` directly (child text nodes do not reflect the current value)
 * and sets all offsets to `null` since CSS Custom Highlight ranges cannot
 * target text inside native form controls.
 *
 * The returned {@link TextMapping} snapshot is immutable — callers must call
 * this function again after each edit to get a fresh snapshot.
 *
 * Block-level boundaries (P, DIV, BR, LI, H1-H6, BLOCKQUOTE, PRE, TR) are
 * represented as `"\n"` characters with `null` offsets in the mapping.
 *
 * @param element - The contenteditable, textarea, or input element to extract from.
 * @returns A {@link TextMapping} with `plainText` and `offsets` arrays of equal length.
 *
 * @example
 * ```ts
 * const mapping = extractTextMapping(document.querySelector('[contenteditable]')!)
 * console.log(mapping.plainText)        // "Hello\nWorld"
 * console.log(mapping.offsets.length)   // === mapping.plainText.length
 * ```
 */
export function extractTextMapping(element: HTMLElement): TextMapping {
  // Native input/textarea: read .value directly. Child text nodes only
  // reflect the initial HTML content, not the current user-typed value.
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
    const text = element.value
    const offsets: Array<null> = new Array(text.length).fill(null)
    return { plainText: text, offsets, sourceElement: element }
  }

  const acc: WalkAccumulator = { chars: [], offsets: [] }
  walkNode(element, acc, true)
  return {
    plainText: acc.chars.join(""),
    offsets: acc.offsets,
    sourceElement: element,
  }
}

// ---------------------------------------------------------------------------
// createInputMonitor
// ---------------------------------------------------------------------------

/**
 * Polling interval for textarea/input elements whose `.value` changes are
 * invisible to MutationObserver (e.g. programmatic clears after send).
 */
const TEXTAREA_POLL_INTERVAL_MS = 200

/**
 * Creates an input monitor that watches a contenteditable element or
 * textarea/input for changes and fires {@link InputMonitorOptions.onTextChange}
 * with a fresh {@link TextMapping} whenever the plain-text content changes.
 *
 * For contenteditable elements, monitoring uses both an `input` event listener
 * and a {@link MutationObserver} so that programmatic DOM mutations (e.g.
 * paste, autocomplete) are also captured.
 *
 * For textarea/input elements, a polling interval supplements the `input`
 * event because {@link MutationObserver} does not fire when `.value` is
 * changed programmatically (e.g. when the provider clears the field after
 * sending a message).
 *
 * Changes that produce identical plain-text to the previous snapshot are
 * silently deduplicated — the callback is NOT fired a second time.
 *
 * An initial extraction is performed immediately on creation and the callback
 * is fired once to prime the caller's state.
 *
 * Errors in text extraction or the callback are caught and logged as warnings
 * so that the monitored element's normal behaviour is never interrupted.
 *
 * @param options - {@link InputMonitorOptions} containing the element and callback.
 * @returns A cleanup function. Call it to remove the event listener and
 *          disconnect the MutationObserver / polling interval.
 *
 * @example
 * ```ts
 * const stop = createInputMonitor({
 *   inputElement: document.querySelector('[contenteditable]')!,
 *   onTextChange: (mapping) => { console.log(mapping.plainText) },
 * })
 * // Later:
 * stop()
 * ```
 */
export function createInputMonitor(options: InputMonitorOptions): () => void {
  const { inputElement, onTextChange } = options
  let lastPlainText: string | null = null

  /**
   * Extracts the current mapping and fires the callback if the text changed.
   * All errors are caught and logged — never rethrown.
   */
  function handleChange(): void {
    try {
      const mapping = extractTextMapping(inputElement)
      if (mapping.plainText === lastPlainText) {
        return
      }
      lastPlainText = mapping.plainText
      onTextChange(mapping)
    } catch (err) {
      log.warn("Failed to extract text mapping", { error: String(err) })
    }
  }

  // Attach input event listener (works for both contenteditable and textarea).
  inputElement.addEventListener("input", handleChange)

  const isNativeInput =
    inputElement instanceof HTMLTextAreaElement ||
    inputElement instanceof HTMLInputElement

  let observer: MutationObserver | null = null
  let pollId: ReturnType<typeof setInterval> | null = null

  if (isNativeInput) {
    // Textarea/input: MutationObserver does not fire when .value is changed
    // programmatically (e.g. provider clearing input after send). Poll as a
    // fallback so highlights are cleared promptly.
    pollId = setInterval(handleChange, TEXTAREA_POLL_INTERVAL_MS)
  } else {
    // Contenteditable: MutationObserver catches programmatic DOM mutations.
    observer = new MutationObserver(() => {
      handleChange()
    })
    observer.observe(inputElement, {
      childList: true,
      subtree: true,
      characterData: true,
    })
  }

  // Fire initial extraction.
  handleChange()

  /**
   * Cleanup function — removes the event listener and disconnects the
   * observer / polling interval. Safe to call multiple times.
   */
  return function cleanup(): void {
    inputElement.removeEventListener("input", handleChange)
    if (observer !== null) {
      observer.disconnect()
      observer = null
    }
    if (pollId !== null) {
      clearInterval(pollId)
      pollId = null
    }
  }
}
