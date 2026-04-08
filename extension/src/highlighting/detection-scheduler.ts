/**
 * Detection scheduler for the real-time PII highlighting feature.
 *
 * Orchestrates hybrid detection: instant regex on every keystroke (synchronous,
 * <10ms) followed by a debounced NER request for Pro users after 500ms of
 * inactivity. Results from both sources are merged and deduplicated before
 * the onMatches callback is invoked. Fail-open: any detection failure emits
 * empty matches rather than blocking the user.
 *
 * Layer: highlighting subsystem / orchestration
 * Dependencies: detectPII (regex-engine), chrome.runtime (NER via service worker),
 *               LocalAllowlist (filtering), types (PIIMatch, TextMapping, OnMatchesCallback)
 */

import type { PIIMatch } from "~src/detection/types"
import type { TextMapping, OnMatchesCallback } from "./types"
import type { LocalAllowlist } from "./local-allowlist"
import { detectPII } from "~src/detection/regex-engine"
import { createLogger } from "~src/utils/logger"

const log = createLogger("detection-scheduler")

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Milliseconds of inactivity before NER request is fired (Pro users only). */
const NER_DEBOUNCE_MS = 500

/** Milliseconds after which an outstanding NER request is abandoned. */
const NER_TIMEOUT_MS = 1000

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Options for {@link createDetectionScheduler}.
 */
export interface DetectionSchedulerOptions {
  /**
   * Callback invoked each time a new set of PII matches is available.
   * Called immediately with regex results, and again with merged results
   * once NER completes (Pro users only).
   */
  readonly onMatches: OnMatchesCallback

  /**
   * Whether the current user has an active Pro subscription.
   * Controls whether NER requests are issued after the debounce delay.
   */
  readonly isProUser: boolean

  /**
   * Optional allowlist used to filter out previously-dismissed false positives.
   * Filtering is asynchronous (hash-based lookup). Pass `null` to skip filtering.
   */
  readonly allowlist: LocalAllowlist | null
  /**
   * Provider key used when requesting NER from the background.
   * Defaults to `"unknown"` for non-provider-specific callers.
   */
  readonly provider?: string
}

/**
 * Handle returned by {@link createDetectionScheduler}.
 */
export interface DetectionScheduler {
  /**
   * Process a new text mapping snapshot.
   *
   * Runs regex detection synchronously and emits results immediately.
   * If the user is Pro, schedules (or resets) a debounced NER request.
   *
   * @param mapping - Fresh text snapshot from the input monitor.
   */
  handleTextChange(mapping: TextMapping): void

  /**
   * Tears down the scheduler.
   *
   * Cancels any pending debounce timer and prevents future callbacks.
   * Safe to call multiple times.
   */
  destroy(): void
}

// ---------------------------------------------------------------------------
// NER message types (narrowly typed to what this module needs)
// ---------------------------------------------------------------------------

interface ScanRequest {
  type: "SCAN_REQUEST"
  text: string
  provider: string
}

interface NERMatch {
  type: string
  value: string
  start: number
  end: number
  confidence: number
  source?: "regex" | "ner" | "both"
}

interface ScanResponse {
  matches?: NERMatch[]
  error?: string
}

// ---------------------------------------------------------------------------
// createDetectionScheduler
// ---------------------------------------------------------------------------

/**
 * Creates a hybrid detection scheduler that runs instant regex detection on
 * every text change and debounced NER for Pro users.
 *
 * @param options - Configuration options including callbacks and Pro status.
 * @returns A handle with {@link DetectionScheduler#handleTextChange} and
 *          {@link DetectionScheduler#destroy}.
 *
 * @example
 * ```ts
 * const scheduler = createDetectionScheduler({
 *   onMatches: (matches, mapping) => renderer.update(matches, mapping),
 *   isProUser: true,
 *   allowlist: myAllowlist,
 * })
 * inputMonitor.onTextChange = (mapping) => scheduler.handleTextChange(mapping)
 * // Later:
 * scheduler.destroy()
 * ```
 */
export function createDetectionScheduler(
  options: DetectionSchedulerOptions,
): DetectionScheduler {
  const { onMatches, isProUser, allowlist, provider = "unknown" } = options

  let destroyed = false
  let nerDebounceTimer: ReturnType<typeof setTimeout> | null = null
  let generation = 0
  let lastRegexMatches: PIIMatch[] = []
  let lastMapping: TextMapping | null = null

  // -------------------------------------------------------------------------
  // handleTextChange
  // -------------------------------------------------------------------------

  /**
   * Processes a new text mapping: runs regex synchronously, emits immediately,
   * then schedules NER if the user is Pro.
   */
  function handleTextChange(mapping: TextMapping): void {
    if (destroyed) return

    lastMapping = mapping
    const currentGen = ++generation

    // --- Regex detection (synchronous, instant) ---
    const regexMatches = runRegexDetection(mapping.plainText)
    lastRegexMatches = regexMatches

    // Emit regex-only results immediately (async to allow allowlist filtering)
    void emitFiltered(regexMatches, mapping, onMatches, allowlist, "regex-immediate")

    // --- NER debounce (Pro users only) ---
    if (!isProUser) return

    cancelNERDebounce()

    nerDebounceTimer = setTimeout(() => {
      nerDebounceTimer = null
      if (destroyed) return
      if (currentGen !== generation) return // stale — text changed again

      void runNERAndMerge(mapping, currentGen, regexMatches)
    }, NER_DEBOUNCE_MS)
  }

  // -------------------------------------------------------------------------
  // runNERAndMerge
  // -------------------------------------------------------------------------

  /**
   * Sends the NER scan request to the service worker, awaits the response
   * within the timeout budget, merges with regex results, and emits.
   */
  async function runNERAndMerge(
    mapping: TextMapping,
    capturedGen: number,
    capturedRegex: PIIMatch[],
  ): Promise<void> {
    const nerMatches = await sendNERRequest(mapping.plainText, provider)

    if (destroyed) return
    if (capturedGen !== generation) {
      log.debug("runNERAndMerge: discarding stale NER result", { capturedGen, generation })
      return
    }

    const merged = mergeMatches(capturedRegex, nerMatches)
    await emitFiltered(merged, mapping, onMatches, allowlist, "ner-merged")
  }

  // -------------------------------------------------------------------------
  // destroy
  // -------------------------------------------------------------------------

  function destroy(): void {
    if (destroyed) return
    destroyed = true
    cancelNERDebounce()
    lastMapping = null
    lastRegexMatches = []
    log.debug("destroy: scheduler torn down")
  }

  // -------------------------------------------------------------------------
  // Private helpers (closures)
  // -------------------------------------------------------------------------

  function cancelNERDebounce(): void {
    if (nerDebounceTimer !== null) {
      clearTimeout(nerDebounceTimer)
      nerDebounceTimer = null
    }
  }

  // Suppress unused-variable lint on lastMapping/lastRegexMatches
  void lastMapping
  void lastRegexMatches

  return { handleTextChange, destroy }
}

// ---------------------------------------------------------------------------
// Module-level helpers (pure, testable)
// ---------------------------------------------------------------------------

/**
 * Runs regex detection on the given text. Returns an empty array on failure
 * (fail-open contract).
 *
 * @param text - Plain text to scan.
 * @returns Array of regex-sourced PIIMatch instances.
 */
function runRegexDetection(text: string): PIIMatch[] {
  try {
    return detectPII(text)
  } catch (err) {
    log.error("runRegexDetection: detectPII threw — returning empty", {
      err: String(err),
    })
    return []
  }
}

/**
 * Sends a SCAN_REQUEST to the service worker and resolves with NER matches.
 * Aborts and returns empty array if the response exceeds {@link NER_TIMEOUT_MS}.
 *
 * @param text - Plain text to send for NER analysis.
 * @returns Promise resolving to an array of NER-sourced PIIMatch instances.
 */
async function sendNERRequest(text: string, provider: string): Promise<PIIMatch[]> {
  try {
    // chrome.runtime is unavailable in MAIN world content scripts.
    // Bail immediately to avoid noisy errors — regex-only results are used.
    if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
      return []
    }

    const message: ScanRequest = { type: "SCAN_REQUEST", text, provider }

    const responsePromise = new Promise<ScanResponse>((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (response: ScanResponse | undefined) => {
          if (chrome.runtime.lastError) {
            log.warn("sendNERRequest: chrome.runtime.lastError")
            resolve({})
            return
          }
          resolve(response ?? {})
        })
      } catch (err) {
        log.warn("sendNERRequest: sendMessage threw", { err: String(err) })
        resolve({})
      }
    })

    const timeoutPromise = new Promise<ScanResponse>((resolve) =>
      setTimeout(() => {
        log.warn("sendNERRequest: NER response timed out", {
          timeoutMs: NER_TIMEOUT_MS,
        })
        resolve({})
      }, NER_TIMEOUT_MS),
    )

    const response = await Promise.race([responsePromise, timeoutPromise])

    if (response.error) {
      log.warn("sendNERRequest: service worker returned error", {
        error: response.error,
      })
      return []
    }

    if (!Array.isArray(response.matches)) return []

    return response.matches.map(
      (m): PIIMatch => ({
        type: m.type,
        value: m.value,
        start: m.start,
        end: m.end,
        confidence: m.confidence,
        source: "ner" as const,
      }),
    )
  } catch (err) {
    log.error("sendNERRequest: unexpected error", { err: String(err) })
    return []
  }
}

/**
 * Merges regex and NER matches, deduplicating overlapping spans.
 *
 * When two matches share the same span, the one with higher confidence is
 * kept and its source is set to `"both"`. Non-overlapping matches from both
 * sources are combined and sorted by position.
 *
 * @param regexMatches - Matches produced by the regex engine (source: "regex").
 * @param nerMatches   - Matches produced by the NER service (source: "ner").
 * @returns Deduplicated, position-sorted array of PIIMatch instances.
 */
export function mergeMatches(
  regexMatches: readonly PIIMatch[],
  nerMatches: readonly PIIMatch[],
): PIIMatch[] {
  if (nerMatches.length === 0) return [...regexMatches]
  if (regexMatches.length === 0) return [...nerMatches]

  const all = [...regexMatches, ...nerMatches]
  all.sort((a, b) => a.start - b.start || b.confidence - a.confidence)

  const result: PIIMatch[] = []

  for (const candidate of all) {
    const overlappingIndex = findOverlappingIndex(result, candidate)

    if (overlappingIndex === -1) {
      result.push({ ...candidate })
      continue
    }

    const existing = result[overlappingIndex]
    const isSameSpan = existing.start === candidate.start && existing.end === candidate.end
    const bothSources = existing.source !== candidate.source

    if (candidate.confidence > existing.confidence) {
      result[overlappingIndex] = {
        ...candidate,
        source: isSameSpan && bothSources ? "both" : candidate.source,
      }
    } else if (isSameSpan && bothSources) {
      result[overlappingIndex] = { ...existing, source: "both" }
    }
    // Otherwise keep existing (higher or equal confidence)
  }

  return result
}

/**
 * Finds the index of the first entry in `sorted` that overlaps `candidate`.
 *
 * Two matches overlap when one's span intersects the other's.
 *
 * @param sorted    - Already-accumulated result array (sorted by start).
 * @param candidate - The match being considered for insertion.
 * @returns Index of the overlapping entry, or `-1` if no overlap exists.
 */
function findOverlappingIndex(sorted: PIIMatch[], candidate: PIIMatch): number {
  for (let i = sorted.length - 1; i >= 0; i--) {
    const existing = sorted[i]
    if (existing.end <= candidate.start) break // all earlier entries are clear
    if (existing.start < candidate.end) return i // overlap found
  }
  return -1
}

/**
 * Filters matches against the allowlist (async, hash-based) and emits via
 * the onMatches callback. Always emits even if filtering fails (fail-open).
 *
 * @param matches   - Detected PII matches to potentially filter.
 * @param mapping   - Text mapping associated with this detection cycle.
 * @param callback  - The onMatches callback to invoke with filtered results.
 * @param allowlist - Optional allowlist for false-positive suppression.
 * @param phase     - Diagnostic label for log messages.
 */
async function emitFiltered(
  matches: readonly PIIMatch[],
  mapping: TextMapping,
  callback: OnMatchesCallback,
  allowlist: LocalAllowlist | null,
  phase: string,
): Promise<void> {
  try {
    let filtered = matches

    if (allowlist !== null && matches.length > 0) {
      filtered = await filterAllowlisted(matches, allowlist)
    }

    log.debug(`emitFiltered [${phase}]`, {
      total: matches.length,
      afterFilter: filtered.length,
    })

    callback(filtered, mapping)
  } catch (err) {
    log.error(`emitFiltered [${phase}]: unexpected error — emitting unfiltered`, {
      err: String(err),
    })
    callback(matches, mapping)
  }
}

/**
 * Removes matches that the user has previously dismissed (false positives).
 *
 * Uses the async `isDismissed` path on the {@link LocalAllowlist} which
 * computes the SHA-256 hash internally. Runs all hash lookups in parallel.
 *
 * @param matches   - Matches to filter.
 * @param allowlist - Allowlist to check against.
 * @returns Filtered matches with allowlisted entries removed.
 */
async function filterAllowlisted(
  matches: readonly PIIMatch[],
  allowlist: LocalAllowlist,
): Promise<readonly PIIMatch[]> {
  const dismissed = await Promise.all(
    matches.map((m) => allowlist.isDismissed(m.value, m.type)),
  )
  return matches.filter((_, i) => !dismissed[i])
}
