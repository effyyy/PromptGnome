/**
 * Shared helper utilities for all regex detection modules.
 * Provides the DetectorMatch type, DetectorFn type, and low-level scanning
 * helpers used by regex-engine.ts, regex-engine-credentials.ts, and
 * regex-engine-context.ts.
 * Architecture layer: Detection (shared internals)
 */

/** Result from a single detector function */
export interface DetectorMatch {
  type: string
  value: string
  start: number
  end: number
  confidence: number
}

/** A detector function scans text and returns all matches */
export type DetectorFn = (text: string) => DetectorMatch[]

/**
 * Scans text with a regex and returns all non-overlapping matches.
 * @param text - Input text to scan
 * @param pattern - Global regex pattern
 * @param type - PII type identifier
 * @param confidence - Base confidence score
 * @returns Array of detector matches
 */
export function scanWithRegex(
  text: string,
  pattern: RegExp,
  type: string,
  confidence: number
): DetectorMatch[] {
  const matches: DetectorMatch[] = []
  let match: RegExpExecArray | null
  const regex = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g")
  while ((match = regex.exec(text)) !== null) {
    matches.push({
      type,
      value: match[0],
      start: match.index,
      end: match.index + match[0].length,
      confidence
    })
    if (match[0].length === 0) {
      regex.lastIndex++
    }
  }
  return matches
}

/**
 * Checks if a position in text has a contextual trigger phrase before it.
 * @param text - Full text
 * @param start - Start position of the match
 * @param triggers - Array of trigger phrases to look for
 * @returns true if a trigger phrase precedes the match
 */
export function hasContextTrigger(text: string, start: number, triggers: string[]): boolean {
  const preceding = text.slice(Math.max(0, start - 100), start).toLowerCase()
  return triggers.some((trigger) => preceding.includes(trigger.toLowerCase()))
}
