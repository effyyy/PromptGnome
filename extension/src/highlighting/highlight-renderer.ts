/**
 * CSS Custom Highlight API renderer for real-time PII detection.
 *
 * Consumes PIIMatch[] and a TextMapping snapshot, registers named Highlight
 * objects via CSS.highlights.set(), and computes BadgePosition[] viewport
 * rectangles for the badge overlay component. Belongs to the highlighting
 * subsystem — sits between the detection scheduler and the badge overlay.
 */

import { createLogger } from "~src/utils/logger"
import type { PIIMatch, PIITypeId } from "~src/detection/types"
import type { TextMapping, BadgePosition } from "./types"
import { extractTextMapping } from "./input-monitor"

const log = createLogger("highlight-renderer")

// ---------------------------------------------------------------------------
// piiTypeToHighlightName
// ---------------------------------------------------------------------------

/**
 * Maps a PII entity type ID to the corresponding CSS Custom Highlight name.
 *
 * The returned string matches a `::highlight(<name>)` rule in
 * `highlight-styles.css`. Unknown types fall back to `"pii-generic"`.
 *
 * @param type - The PII entity type ID (e.g. `"EMAIL"`, `"PERSON_NAME"`).
 * @returns The CSS highlight name to use with `CSS.highlights.set()`.
 *
 * @example
 * ```ts
 * piiTypeToHighlightName("EMAIL")         // "pii-email"
 * piiTypeToHighlightName("PERSON_NAME")   // "pii-name"
 * piiTypeToHighlightName("UNKNOWN_TYPE")  // "pii-generic"
 * ```
 */
export function piiTypeToHighlightName(type: PIITypeId): string {
  switch (type) {
    case "EMAIL":           return "pii-email"
    case "SSN":             return "pii-ssn"
    case "CREDIT_CARD":     return "pii-credit-card"
    case "PHONE_US":
    case "PHONE_INTL":      return "pii-phone"
    case "IPV4":
    case "IPV6":            return "pii-ip"
    case "AWS_ACCESS_KEY":
    case "AWS_SECRET_KEY":
    case "GITHUB_TOKEN":
    case "STRIPE_KEY":
    case "GENERIC_API_KEY":
    case "OPENAI_KEY":
    case "ANTHROPIC_KEY":
    case "GOOGLE_AI_KEY":
    case "SLACK_TOKEN":
    case "PRIVATE_KEY":
    case "JWT_TOKEN":       return "pii-api-key"
    case "IBAN":            return "pii-iban"
    case "PASSPORT_US":     return "pii-passport"
    case "DRIVERS_LICENSE": return "pii-license"
    case "ZIP_CODE":        return "pii-zip"
    case "DATE_OF_BIRTH":   return "pii-dob"
    case "STREET_ADDRESS":  return "pii-address"
    case "PERSON_NAME":     return "pii-name"
    case "ORGANIZATION":    return "pii-organization"
    case "LOCATION":        return "pii-location"
    case "MEDICAL_TERM":    return "pii-medical"
    default:                return "pii-generic"
  }
}

// ---------------------------------------------------------------------------
// createRangeFromOffsets
// ---------------------------------------------------------------------------

/**
 * Creates a DOM {@link Range} from character indices into a {@link TextMapping}.
 *
 * Validates that the supplied indices are within bounds and that both boundary
 * positions resolve to non-null DOM nodes before constructing the Range.
 * Returns `null` on any failure — callers must not assume a Range is returned.
 *
 * @param mapping - The text mapping produced by the input monitor.
 * @param start   - Zero-based inclusive start character index.
 * @param end     - Zero-based exclusive end character index.
 * @returns A positioned {@link Range}, or `null` if the range cannot be created.
 *
 * @example
 * ```ts
 * const range = createRangeFromOffsets(mapping, 0, 5)
 * if (range !== null) {
 *   new Highlight(range) // use with CSS.highlights.set()
 * }
 * ```
 */
export function createRangeFromOffsets(
  mapping: TextMapping,
  start: number,
  end: number,
): Range | null {
  try {
    const len = mapping.offsets.length

    // Validate indices.
    if (start < 0 || end > len || start >= end) {
      return null
    }

    const startPos = mapping.offsets[start]
    // `end` is exclusive; the range endpoint lives at index `end - 1`.
    const endPos = mapping.offsets[end - 1]

    if (startPos === null || endPos === null) {
      return null
    }

    const range = document.createRange()
    range.setStart(startPos.node, startPos.offset)
    // The Range end must be offset + 1 to include the character at `end - 1`.
    range.setEnd(endPos.node, endPos.offset + 1)
    return range
  } catch (err) {
    log.warn("createRangeFromOffsets failed", { error: String(err) })
    return null
  }
}

// ---------------------------------------------------------------------------
// HighlightRenderer
// ---------------------------------------------------------------------------

/** Set of all highlight names currently registered with CSS.highlights. */
type ActiveHighlightNames = Set<string>

/**
 * Renders CSS Custom Highlight API highlights for a set of PII matches and
 * computes floating badge positions for the badge overlay component.
 *
 * Lifecycle:
 * 1. Construct with the badge container element.
 * 2. Call `update()` each time a new detection result arrives.
 * 3. Call `reposition()` on scroll/resize events.
 * 4. Call `destroy()` when the monitored element is removed.
 *
 * @example
 * ```ts
 * const renderer = new HighlightRenderer(badgeContainer)
 * const badges = renderer.update(matches, mapping)
 * // badges is BadgePosition[] for the badge overlay component
 * ```
 */
export class HighlightRenderer {
  private _activeNames: ActiveHighlightNames = new Set()

  /**
   * @param _badgeContainer - Element used as a coordinate reference for badge
   *                          layout (reserved for future overlay anchoring use).
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_badgeContainer: HTMLElement) {
    // _badgeContainer is accepted for API compatibility and future use.
  }

  /**
   * Clears previous highlights, registers new CSS Custom Highlights for each
   * PII match group, and computes badge positions.
   *
   * Groups matches by their CSS highlight name so that a single
   * {@link Highlight} object is created per style category.
   *
   * @param matches - PII matches from the detection pipeline.
   * @param mapping - Text mapping snapshot corresponding to the matches.
   * @returns Array of badge positions for the badge overlay component.
   *          Empty if CSS Custom Highlight API is unavailable or no matches
   *          produced valid ranges.
   */
  update(
    matches: readonly PIIMatch[],
    mapping: TextMapping,
  ): BadgePosition[] {
    this._clearHighlights()

    if (matches.length === 0) {
      return []
    }

    return this._renderAndPosition(matches, mapping)
  }

  /**
   * Recomputes badge positions using the most recently supplied matches and
   * mapping without re-running detection or re-registering highlights.
   *
   * Intended to be called on scroll and resize events.
   *
   * @returns Updated badge positions, or an empty array if no previous update
   *          has been called.
   */
  reposition(
    matches: readonly PIIMatch[],
    mapping: TextMapping,
  ): BadgePosition[] {
    if (matches.length === 0 || mapping.offsets.length === 0) {
      return []
    }

    return this._computeBadgePositions(matches, mapping)
  }

  /**
   * Removes all CSS Custom Highlights registered by this renderer.
   *
   * Call this when the monitored element is unmounted or the extension is
   * disabled to avoid leaving stale highlights in the document.
   */
  destroy(): void {
    this._clearHighlights()
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Removes all highlight names previously registered via CSS.highlights.set().
   */
  private _clearHighlights(): void {
    if (typeof CSS === "undefined" || !CSS.highlights) {
      return
    }

    for (const name of this._activeNames) {
      try {
        CSS.highlights.delete(name)
      } catch (err) {
        log.warn("Failed to delete highlight", { name, error: String(err) })
      }
    }
    this._activeNames.clear()
  }

  /**
   * Registers CSS Custom Highlights and computes badge positions in one pass.
   *
   * @param matches - PII matches to render.
   * @param mapping - Text mapping for DOM position resolution.
   * @returns Badge positions array.
   */
  private _renderAndPosition(
    matches: readonly PIIMatch[],
    mapping: TextMapping,
  ): BadgePosition[] {
    if (typeof CSS === "undefined" || !CSS.highlights) {
      log.warn("CSS Custom Highlight API not available")
      return []
    }

    // Textarea/input: CSS Custom Highlights cannot target native form control
    // text. Use a temporary mirror overlay for badge positioning only.
    if (mapping.sourceElement instanceof HTMLTextAreaElement) {
      return this._computeTextareaBadgePositions(matches, mapping.sourceElement)
    }

    // Contenteditable: refresh stale text node references before rendering.
    // React/SPA frameworks may replace DOM nodes between detection and render.
    let effectiveMapping = mapping
    if (this._hasStaleNodes(mapping)) {
      effectiveMapping = this._refreshMapping(mapping)
    }

    // Group ranges by highlight name.
    const groups = new Map<string, Range[]>()

    for (const match of matches) {
      const range = createRangeFromOffsets(effectiveMapping, match.start, match.end)
      if (range === null) {
        continue
      }

      const name = piiTypeToHighlightName(match.type)
      const existing = groups.get(name)
      if (existing !== undefined) {
        existing.push(range)
      } else {
        groups.set(name, [range])
      }
    }

    // Register one Highlight object per highlight name.
    for (const [name, ranges] of groups) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const highlight = new (Highlight as any)(...ranges)
        CSS.highlights.set(name, highlight)
        this._activeNames.add(name)
      } catch (err) {
        log.warn("Failed to register highlight", { name, error: String(err) })
      }
    }

    return this._computeBadgePositions(matches, effectiveMapping)
  }

  /**
   * Computes viewport-relative bounding rectangles for each match.
   *
   * For contenteditable elements, positions are derived from per-character
   * DOM ranges. For textarea/input elements (where ranges cannot be created),
   * falls back to the source element's bounding rect so badges still render.
   *
   * Badges whose computed position falls outside the input element's visible
   * bounding rect are excluded so they do not overflow the prompt box when
   * the user has typed a large message that scrolls internally.
   *
   * @param matches - PII matches for which to compute positions.
   * @param mapping - Text mapping for DOM position resolution.
   * @returns Array of badge positions (one per match that produces a valid range).
   */
  private _computeBadgePositions(
    matches: readonly PIIMatch[],
    mapping: TextMapping,
  ): BadgePosition[] {
    // Textarea: use temporary mirror for per-character positioning.
    if (mapping.sourceElement instanceof HTMLTextAreaElement) {
      return this._computeTextareaBadgePositions(matches, mapping.sourceElement)
    }

    // Contenteditable: refresh stale text node references.
    let effectiveMapping = mapping
    if (this._hasStaleNodes(mapping)) {
      effectiveMapping = this._refreshMapping(mapping)
    }

    const positions: BadgePosition[] = []

    // Compute the effective visible rect for clipping badges. Start with the
    // input element's border box, then intersect with the closest scrollable
    // ancestor's rect. This handles the common case where a contenteditable
    // grows taller than its scroll container (e.g. ChatGPT, Claude prompt
    // boxes): the element's own getBoundingClientRect() returns its full
    // height, but text scrolled out of the scroll container should not show
    // badges.
    let clipRect: DOMRect | null = null
    if (effectiveMapping.sourceElement) {
      try {
        clipRect = effectiveMapping.sourceElement.getBoundingClientRect()

        // Walk up to the closest scrollable ancestor and intersect rects.
        let parent = effectiveMapping.sourceElement.parentElement
        while (parent !== null && parent !== document.documentElement) {
          try {
            const style = getComputedStyle(parent)
            const oy = style.overflowY
            const o = style.overflow
            if (
              oy === "auto" || oy === "scroll" || oy === "hidden" ||
              o === "auto" || o === "scroll" || o === "hidden"
            ) {
              const parentRect = parent.getBoundingClientRect()
              // Intersect: the visible area is where both rects overlap.
              const top = Math.max(clipRect.top, parentRect.top)
              const bottom = Math.min(clipRect.bottom, parentRect.bottom)
              const left = Math.max(clipRect.left, parentRect.left)
              const right = Math.min(clipRect.right, parentRect.right)
              clipRect = new DOMRect(left, top, Math.max(0, right - left), Math.max(0, bottom - top))
              break
            }
          } catch {
            // getComputedStyle may throw in sandboxed iframes — skip.
          }
          parent = parent.parentElement
        }
      } catch {
        // Fail-open: no clipping applied.
      }
    }

    for (let i = 0; i < matches.length; i++) {
      const match = matches[i]
      const range = createRangeFromOffsets(effectiveMapping, match.start, match.end)

      try {
        let rect: DOMRect | null = null

        if (range !== null) {
          rect = range.getBoundingClientRect()
        } else if (effectiveMapping.sourceElement) {
          // Fallback: use the element's bounding rect when per-character
          // positioning is unavailable.
          rect = effectiveMapping.sourceElement.getBoundingClientRect()
        }

        if (rect !== null) {
          // Clip: skip badges whose highlight rect falls outside the input
          // element's visible area. The badge renders ~22px above the
          // highlight, so allow a small margin above the clip top.
          if (clipRect !== null) {
            const BADGE_HEIGHT_PX = 22
            const MARGIN_PX = 4
            if (
              rect.bottom < clipRect.top ||
              rect.top - BADGE_HEIGHT_PX > clipRect.bottom + MARGIN_PX
            ) {
              continue
            }
          }

          positions.push({
            matchIndex: i,
            type: match.type,
            rect,
            confidence: match.confidence,
          })
        }
      } catch (err) {
        log.warn("getBoundingClientRect failed", { index: i, error: String(err) })
      }
    }

    return positions
  }

  // -------------------------------------------------------------------------
  // Stale node detection and textarea mirror helpers
  // -------------------------------------------------------------------------

  /**
   * Checks whether the mapping's text node references are stale (disconnected).
   *
   * Returns `false` when all offsets are `null` (textarea/input case) since
   * that is handled separately via the textarea mirror path.
   *
   * @param mapping - Text mapping to check.
   * @returns `true` if the first non-null text node reference is disconnected.
   */
  private _hasStaleNodes(mapping: TextMapping): boolean {
    for (const offset of mapping.offsets) {
      if (offset !== null) {
        return !offset.node.isConnected
      }
    }
    return false
  }

  /**
   * Re-extracts a fresh text mapping from the source element.
   *
   * Returns the original mapping if the source element is unavailable or
   * the text has changed (making match character indices invalid).
   *
   * @param mapping - The potentially stale mapping.
   * @returns A fresh mapping with connected nodes, or the original if
   *          re-extraction is not possible.
   */
  private _refreshMapping(mapping: TextMapping): TextMapping {
    if (!mapping.sourceElement) return mapping
    try {
      const fresh = extractTextMapping(mapping.sourceElement)
      if (fresh.plainText !== mapping.plainText) {
        // Text changed — match indices are invalid with the fresh mapping.
        return mapping
      }
      return fresh
    } catch {
      return mapping
    }
  }

  /**
   * Creates a temporary mirror div positioned over a textarea element.
   *
   * The mirror replicates the textarea's text layout (font, padding,
   * dimensions, white-space, word-wrap) so that DOM Ranges created on its
   * text nodes produce viewport-relative bounding rects that align with
   * the textarea's visible text. Callers MUST remove the mirror from the
   * DOM when done (e.g. in a `finally` block).
   *
   * @param textarea - The textarea element to mirror.
   * @returns A positioned div appended to `document.documentElement`.
   */
  private _createTextareaMirror(textarea: HTMLTextAreaElement): HTMLDivElement {
    const mirror = document.createElement("div")
    const cs = getComputedStyle(textarea)
    const rect = textarea.getBoundingClientRect()

    const stylesToCopy = [
      "fontFamily", "fontSize", "fontWeight", "fontStyle", "fontVariant",
      "lineHeight", "letterSpacing", "wordSpacing", "textTransform",
      "textIndent", "textAlign",
      "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
      "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
      "boxSizing", "whiteSpace", "wordWrap", "overflowWrap", "wordBreak",
      "tabSize", "direction",
    ]

    mirror.style.position = "fixed"
    mirror.style.top = `${rect.top}px`
    mirror.style.left = `${rect.left}px`
    mirror.style.width = `${rect.width}px`
    mirror.style.height = `${rect.height}px`
    mirror.style.overflow = "hidden"
    mirror.style.visibility = "hidden"
    mirror.style.pointerEvents = "none"
    mirror.style.zIndex = "-99999"

    for (const prop of stylesToCopy) {
      const kebab = prop.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)
      ;(mirror.style as unknown as Record<string, string>)[prop] =
        cs.getPropertyValue(kebab)
    }

    mirror.textContent = textarea.value

    document.documentElement.appendChild(mirror)

    // Sync scroll AFTER appending (scrollTop only works on rendered elements).
    mirror.scrollTop = textarea.scrollTop
    mirror.scrollLeft = textarea.scrollLeft

    return mirror
  }

  /**
   * Computes badge positions for textarea inputs using a temporary mirror.
   *
   * Creates a hidden div with the same text layout as the textarea, builds
   * DOM Ranges on its text nodes, measures their viewport rects, then
   * removes the mirror. Badges are clipped to the textarea's visible area.
   *
   * @param matches  - PII matches to position.
   * @param textarea - The source textarea element.
   * @returns Badge positions with viewport-relative rects.
   */
  private _computeTextareaBadgePositions(
    matches: readonly PIIMatch[],
    textarea: HTMLTextAreaElement,
  ): BadgePosition[] {
    const mirror = this._createTextareaMirror(textarea)
    try {
      const positions: BadgePosition[] = []
      const textNode = mirror.firstChild
      if (!(textNode instanceof Text)) return positions

      let clipRect: DOMRect | null = null
      try {
        clipRect = textarea.getBoundingClientRect()
      } catch {
        // Fail-open: no clipping applied.
      }

      for (let i = 0; i < matches.length; i++) {
        const match = matches[i]
        try {
          if (
            match.start < 0 ||
            match.end > textNode.length ||
            match.start >= match.end
          ) {
            continue
          }

          const range = document.createRange()
          range.setStart(textNode, match.start)
          range.setEnd(textNode, match.end)
          const rect = range.getBoundingClientRect()

          // Skip zero-size rects (hidden or collapsed text).
          if (rect.width === 0 && rect.height === 0) continue

          // Clip to the textarea's visible area.
          if (clipRect !== null) {
            const BADGE_HEIGHT_PX = 22
            const MARGIN_PX = 4
            if (
              rect.bottom < clipRect.top ||
              rect.top - BADGE_HEIGHT_PX > clipRect.bottom + MARGIN_PX
            ) {
              continue
            }
          }

          positions.push({
            matchIndex: i,
            type: match.type,
            rect,
            confidence: match.confidence,
          })
        } catch (err) {
          log.warn("textarea badge position failed", {
            index: i,
            error: String(err),
          })
        }
      }

      return positions
    } finally {
      mirror.remove()
    }
  }

}
