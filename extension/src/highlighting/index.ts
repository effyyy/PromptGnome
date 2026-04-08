/**
 * Integration module for the real-time PII highlighting subsystem.
 *
 * Wires together InputMonitor → DetectionScheduler → HighlightRenderer with
 * optional LocalAllowlist filtering and FeedbackQueue reporting. This is the
 * single public entry-point consumed by the Plasmo content script.
 *
 * Layer: highlighting subsystem / integration
 * Dependencies: input-monitor, detection-scheduler, highlight-renderer,
 *               local-allowlist, feedback-queue, context-classifier, types
 */

import { createLogger } from "~src/utils/logger"
import type { PIIMatch, PIITypeId } from "~src/detection/types"
import type { BadgePosition, FeedbackVerdict, TextMapping } from "./types"
import { createInputMonitor } from "./input-monitor"
import { createDetectionScheduler } from "./detection-scheduler"
import { HighlightRenderer } from "./highlight-renderer"
import { LocalAllowlist, hashText } from "./local-allowlist"
import { FeedbackQueue } from "./feedback-queue-port"
import { classifyContext } from "./context-classifier"

const log = createLogger("highlighting-pipeline")

// ---------------------------------------------------------------------------
// Default feedback queue settings
// ---------------------------------------------------------------------------

/** Flush interval in milliseconds for the feedback queue (15 minutes). */
const FEEDBACK_FLUSH_INTERVAL_MS = 15 * 60 * 1000

/** Maximum items before an immediate flush is triggered. */
const FEEDBACK_MAX_BATCH_SIZE = 20

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Options accepted by {@link createHighlightingPipeline}.
 *
 * @example
 * ```ts
 * const options: HighlightingPipelineOptions = {
 *   inputElement: document.querySelector('[contenteditable]')!,
 *   badgeContainer: document.getElementById('badge-container')!,
 *   isProUser: false,
 *   feedbackEnabled: true,
 *   // feedbackEndpoint injected by the Pro build only
 *   onBadgesUpdate: (badges) => renderBadges(badges),
 * }
 * ```
 */
export interface HighlightingPipelineOptions {
  /** Provider key for the current page (e.g. "CHATGPT"). */
  readonly provider?: string
  /** The contenteditable element to monitor for text changes. */
  readonly inputElement: HTMLElement
  /** Container element used as the coordinate reference for badge layout. */
  readonly badgeContainer: HTMLElement
  /**
   * Whether the current user has an active Pro subscription.
   *
   * Enables NER-backed entity detection and the feedback submission path.
   */
  readonly isProUser: boolean
  /**
   * Whether to show the feedback UI on PII badges and enqueue dismissal
   * signals to the backend.
   */
  readonly feedbackEnabled: boolean
  /**
   * URL of the detection-feedback backend endpoint.
   *
   * Only used when `feedbackEnabled` is `true`. The queue sends
   * `POST { feedbacks: FeedbackPayload[] }` to this endpoint.
   */
  readonly feedbackEndpoint?: string
  /**
   * Called each time the set of badge positions changes.
   *
   * Receives the latest computed badge positions so the caller can update
   * whatever overlay component renders the badges. Called with an empty
   * array when all highlights are cleared.
   *
   * @param badges - The latest badge positions (may be empty).
   */
  readonly onBadgesUpdate: (badges: readonly BadgePosition[]) => void
}

/**
 * Handle returned by {@link createHighlightingPipeline}.
 *
 * @example
 * ```ts
 * const pipeline = await createHighlightingPipeline(options)
 * // Respond to a user dismissing a PII badge:
 * await pipeline.handleDismiss(0, "not_pii")
 * // Tear down on navigation or unmount:
 * pipeline.cleanup()
 * ```
 */
export interface HighlightingPipelineHandle {
  /**
   * Tears down the entire pipeline.
   *
   * Stops the input monitor, destroys the detection scheduler, destroys the
   * renderer, destroys the feedback queue, and removes all scroll/resize
   * listeners. Safe to call multiple times.
   */
  cleanup: () => void

  /**
   * Records a user dismissal of a specific PII badge.
   *
   * Adds the matched value to the local allowlist, optionally enqueues an
   * anonymized feedback payload, and re-runs detection so the dismissed
   * badge disappears immediately.
   *
   * @param matchIndex     - Zero-based index into the most recent matches array.
   * @param verdict        - `"not_pii"` or `"wrong_type"`.
   * @param correctedType  - The type the user believes is correct (only for `"wrong_type"`).
   * @returns A promise that resolves when the dismissal has been recorded.
   */
  handleDismiss: (
    matchIndex: number,
    verdict: FeedbackVerdict,
    correctedType?: PIITypeId,
  ) => Promise<void>
}

// ---------------------------------------------------------------------------
// findScrollParent
// ---------------------------------------------------------------------------

/**
 * Walks up the DOM parent chain from `element` and returns the first ancestor
 * whose computed `overflow` or `overflow-y` style is `"auto"` or `"scroll"`.
 *
 * Falls back to `window` (represented as `null`) when no scrolling ancestor
 * is found.
 *
 * @param element - The starting element for the upward traversal.
 * @returns The first scrolling ancestor, or `null` if the scroll context is `window`.
 *
 * @example
 * ```ts
 * const scrollParent = findScrollParent(inputEl)
 * const target = scrollParent ?? window
 * target.addEventListener("scroll", onScroll)
 * ```
 */
export function findScrollParent(element: HTMLElement): HTMLElement | null {
  let current = element.parentElement

  while (current !== null && current !== document.documentElement) {
    try {
      const style = getComputedStyle(current)
      const overflow = style.overflow
      const overflowY = style.overflowY
      if (
        overflow === "auto" ||
        overflow === "scroll" ||
        overflowY === "auto" ||
        overflowY === "scroll"
      ) {
        return current
      }
    } catch {
      // getComputedStyle may throw in sandboxed iframes — skip silently.
    }
    current = current.parentElement
  }

  return null
}

// ---------------------------------------------------------------------------
// createHighlightingPipeline
// ---------------------------------------------------------------------------

/**
 * Initialises and connects all highlighting subsystem modules.
 *
 * Performs the following setup in order:
 * 1. Load the {@link LocalAllowlist} from storage.
 * 2. Construct the {@link HighlightRenderer}.
 * 3. Optionally construct and load the {@link FeedbackQueue}.
 * 4. Construct the {@link DetectionScheduler} with an `onMatches` handler
 *    that updates the renderer and forwards badge positions to the caller.
 * 5. Construct the {@link InputMonitor} wired to the scheduler.
 * 6. Register scroll/resize listeners for badge repositioning (rAF-throttled).
 *
 * @param options - Pipeline configuration. See {@link HighlightingPipelineOptions}.
 * @returns A promise that resolves to a {@link HighlightingPipelineHandle}
 *          with `cleanup` and `handleDismiss` methods.
 *
 * @throws Never — errors during initialisation are caught and logged.
 *
 * @example
 * ```ts
 * const pipeline = await createHighlightingPipeline({
 *   inputElement: chatInput,
 *   badgeContainer: badgeOverlay,
 *   isProUser: true,
 *   feedbackEnabled: true,
 *   // feedbackEndpoint injected by the Pro build only
 *   onBadgesUpdate: updateBadgeOverlay,
 * })
 * ```
 */
export async function createHighlightingPipeline(
  options: HighlightingPipelineOptions,
): Promise<HighlightingPipelineHandle> {
  const {
    provider = "unknown",
    inputElement,
    badgeContainer,
    isProUser,
    feedbackEnabled,
    feedbackEndpoint,
    onBadgesUpdate,
  } = options

  // -------------------------------------------------------------------------
  // Step 1: Initialise LocalAllowlist
  // -------------------------------------------------------------------------

  const allowlist = new LocalAllowlist()
  try {
    await allowlist.load()
    log.debug("createHighlightingPipeline: allowlist loaded")
  } catch (err) {
    log.error("createHighlightingPipeline: allowlist.load failed — continuing", {
      err: String(err),
    })
  }

  // -------------------------------------------------------------------------
  // Step 2: Create HighlightRenderer
  // -------------------------------------------------------------------------

  const renderer = new HighlightRenderer(badgeContainer)

  // -------------------------------------------------------------------------
  // Step 3: Optionally create FeedbackQueue
  // -------------------------------------------------------------------------

  let feedbackQueue: FeedbackQueue | null = null
  if (feedbackEnabled && feedbackEndpoint) {
    feedbackQueue = new FeedbackQueue({
      endpoint: feedbackEndpoint,
      flushIntervalMs: FEEDBACK_FLUSH_INTERVAL_MS,
      maxBatchSize: FEEDBACK_MAX_BATCH_SIZE,
    })
    try {
      await feedbackQueue.load()
      log.debug("createHighlightingPipeline: feedbackQueue loaded")
    } catch (err) {
      log.error("createHighlightingPipeline: feedbackQueue.load failed — queue still active", {
        err: String(err),
      })
    }
  }

  // -------------------------------------------------------------------------
  // Mutable state shared between the pipeline callbacks
  // -------------------------------------------------------------------------

  let currentMatches: readonly PIIMatch[] = []
  let currentMapping: TextMapping | null = null

  // -------------------------------------------------------------------------
  // Step 4: Create DetectionScheduler with onMatches callback
  // -------------------------------------------------------------------------

  const scheduler = createDetectionScheduler({
    onMatches: (matches, mapping) => {
      currentMatches = matches
      currentMapping = mapping

      const badges = renderer.update(matches, mapping)
      try {
        onBadgesUpdate(badges)
      } catch (err) {
        log.error("createHighlightingPipeline: onBadgesUpdate threw", {
          err: String(err),
        })
      }
    },
    isProUser,
    allowlist,
    provider,
  })

  // -------------------------------------------------------------------------
  // Step 5: Create InputMonitor
  // -------------------------------------------------------------------------

  const stopMonitor = createInputMonitor({
    inputElement,
    onTextChange: (mapping) => {
      scheduler.handleTextChange(mapping)
    },
  })

  // -------------------------------------------------------------------------
  // Step 6: Scroll/resize repositioning (rAF-throttled)
  // -------------------------------------------------------------------------

  let repositionRafId: number | null = null

  function handleReposition(): void {
    if (repositionRafId !== null) return // already queued

    repositionRafId = requestAnimationFrame(() => {
      repositionRafId = null

      if (currentMatches.length === 0 || currentMapping === null) return

      try {
        const badges = renderer.reposition(currentMatches, currentMapping)
        onBadgesUpdate(badges)
      } catch (err) {
        log.warn("createHighlightingPipeline: reposition threw", {
          err: String(err),
        })
      }
    })
  }

  const scrollTarget: HTMLElement | Window =
    findScrollParent(inputElement) ?? window

  scrollTarget.addEventListener("scroll", handleReposition, { passive: true })
  window.addEventListener("resize", handleReposition, { passive: true })

  // ResizeObserver on the input element catches composer growth that does
  // NOT fire scroll/resize events. Necessary but not sufficient: in Gemini
  // the Quill editor stays the same size while a *parent* wrapper grows
  // upward (the composer is anchored to the viewport bottom), so the input
  // element only translates and ResizeObserver does not fire.
  let resizeObserver: ResizeObserver | null = null
  if (typeof ResizeObserver !== "undefined") {
    try {
      resizeObserver = new ResizeObserver(() => {
        handleReposition()
      })
      resizeObserver.observe(inputElement)
      // Also observe a few ancestors so wrapper growth (Gemini) triggers
      // reposition. We stop at document.body to avoid observing the entire
      // page.
      let ancestor = inputElement.parentElement
      let depth = 0
      while (ancestor !== null && ancestor !== document.body && depth < 5) {
        resizeObserver.observe(ancestor)
        ancestor = ancestor.parentElement
        depth++
      }
    } catch (err) {
      log.warn("createHighlightingPipeline: ResizeObserver setup failed", {
        err: String(err),
      })
    }
  }

  // Position-poll fallback: rAF-driven check that compares the input element's
  // viewport rect frame-to-frame and triggers reposition on any change. This
  // catches the case where a parent translates the input element without any
  // size change (Gemini composer slide-in animations, transform-driven moves)
  // — situations where neither scroll, resize, nor ResizeObserver fires.
  // The poll only runs while there are active matches to avoid wasting frames.
  let lastInputTop = 0
  let lastInputLeft = 0
  let positionPollRafId: number | null = null
  function pollInputPosition(): void {
    positionPollRafId = null
    if (currentMatches.length === 0 || currentMapping === null) {
      return
    }
    try {
      const rect = inputElement.getBoundingClientRect()
      if (rect.top !== lastInputTop || rect.left !== lastInputLeft) {
        lastInputTop = rect.top
        lastInputLeft = rect.left
        handleReposition()
      }
    } catch {
      /* fail-open */
    }
    positionPollRafId = requestAnimationFrame(pollInputPosition)
  }
  positionPollRafId = requestAnimationFrame(pollInputPosition)

  // Also listen for scroll events on the input element itself.
  // When a large message overflows the prompt box, the contenteditable element
  // scrolls internally. findScrollParent walks from the *parent* up, so it
  // misses the element's own overflow. Without this listener, badges would
  // not reposition (and clip) as the user scrolls within the input.
  const inputScrollsInternally =
    scrollTarget !== (inputElement as EventTarget)
  if (inputScrollsInternally) {
    inputElement.addEventListener("scroll", handleReposition, { passive: true })
  }

  log.debug("createHighlightingPipeline: pipeline initialised")

  // -------------------------------------------------------------------------
  // cleanup
  // -------------------------------------------------------------------------

  let cleanedUp = false

  function cleanup(): void {
    if (cleanedUp) return
    cleanedUp = true

    stopMonitor()
    scheduler.destroy()
    renderer.destroy()
    feedbackQueue?.destroy()

    scrollTarget.removeEventListener("scroll", handleReposition)
    window.removeEventListener("resize", handleReposition)
    if (inputScrollsInternally) {
      inputElement.removeEventListener("scroll", handleReposition)
    }
    if (positionPollRafId !== null) {
      cancelAnimationFrame(positionPollRafId)
      positionPollRafId = null
    }
    if (resizeObserver !== null) {
      try {
        resizeObserver.disconnect()
      } catch {
        /* ignore */
      }
      resizeObserver = null
    }

    if (repositionRafId !== null) {
      cancelAnimationFrame(repositionRafId)
      repositionRafId = null
    }

    log.debug("createHighlightingPipeline: cleanup complete")
  }

  // -------------------------------------------------------------------------
  // handleDismiss
  // -------------------------------------------------------------------------

  /**
   * Handles a user dismissal of a PII badge.
   *
   * @param matchIndex    - Index into `currentMatches`.
   * @param verdict       - User verdict on the detection.
   * @param correctedType - Optional corrected type for `"wrong_type"` verdicts.
   */
  async function handleDismiss(
    matchIndex: number,
    verdict: FeedbackVerdict,
    correctedType?: PIITypeId,
  ): Promise<void> {
    try {
      const match = currentMatches[matchIndex]
      if (match === undefined) {
        log.warn("handleDismiss: matchIndex out of bounds", { matchIndex })
        return
      }

      // Record in local allowlist (silently hashes the value)
      await allowlist.dismiss(match.value, match.type)
      log.debug("handleDismiss: allowlist updated", {
        type: match.type,
        verdict,
      })

      // Enqueue anonymized feedback if the queue is active
      if (feedbackQueue !== null && currentMapping !== null) {
        try {
          const textHash = await hashText(match.value)
          const contextCategory = classifyContext(
            currentMapping.plainText,
            match.start,
            match.end,
          )

          await feedbackQueue.enqueue({
            textHash,
            detectedType: match.type,
            verdict,
            correctedType,
            source: match.source,
            confidence: match.confidence,
            contextCategory,
            reputationScore: 0,
          })
        } catch (err) {
          log.error("handleDismiss: feedbackQueue.enqueue threw — continuing", {
            err: String(err),
          })
        }
      }

      // Re-run detection to reflect the allowlist change immediately.
      // Re-use the current mapping if available so we don't need a new DOM walk.
      if (currentMapping !== null) {
        scheduler.handleTextChange(currentMapping)
      }
    } catch (err) {
      log.error("handleDismiss: unexpected error", { err: String(err) })
    }
  }

  return { cleanup, handleDismiss }
}
