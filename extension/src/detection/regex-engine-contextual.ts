/**
 * Contextual PII detection using trigger-phrase-driven capture.
 * Instead of pattern-matching the PII value directly, this module detects
 * natural-language phrases ("my password is", "ssn:") and then captures
 * the value that follows using smart boundary rules.
 * Architecture layer: Detection (contextual sub-module)
 */

import type { DetectorMatch } from "./regex-helpers"

// ---------------------------------------------------------------------------
// captureSmartBoundary
// ---------------------------------------------------------------------------

/** Result from captureSmartBoundary containing the captured value and its end index */
export interface SmartBoundaryResult {
  /** The captured value string (trimmed, length-checked) */
  value: string
  /** Exclusive end index in the original text */
  end: number
}

/**
 * Captures a PII value from `text` starting at `startIndex` using smart
 * boundary detection rules:
 *
 * 1. Skips leading whitespace (spaces and tabs).
 * 2. If the first non-whitespace char is a quote (`"`, `'`, `` ` ``), captures
 *    until the matching close quote. Falls through to unquoted if not found.
 * 3. Otherwise stops at a natural delimiter (`,` `.` `;` `!` `?`), a newline,
 *    or a stop word (`and`, `but`, `so`, `then`, `also`, `which`, `where`,
 *    `while`) that is preceded by a space and followed by space / end-of-string
 *    / punctuation / newline. Stop words embedded inside a word are ignored.
 * 4. Trims trailing whitespace from the captured value.
 * 5. Enforces a minimum length of 2 and truncates at 200 characters.
 *
 * @param text - The full input text.
 * @param startIndex - Index in `text` at which to begin capture (typically
 *   just after the trigger phrase).
 * @returns `{ value, end }` on success, or `null` if the captured value is
 *   too short or the capture position is out of range.
 * @example
 * captureSmartBoundary('password is "hunter2" ok', 12)
 * // => { value: 'hunter2', end: 21 }
 */
export function captureSmartBoundary(
  text: string,
  startIndex: number
): SmartBoundaryResult | null {
  if (startIndex >= text.length) return null

  // 1. Skip leading whitespace
  let pos = startIndex
  while (pos < text.length && (text[pos] === " " || text[pos] === "\t")) {
    pos++
  }

  if (pos >= text.length) return null

  const QUOTE_CHARS = new Set(['"', "'", "`"])

  // 2. Quoted capture
  if (QUOTE_CHARS.has(text[pos])) {
    const openQuote = text[pos]
    const contentStart = pos + 1
    const closeIndex = text.indexOf(openQuote, contentStart)
    if (closeIndex !== -1) {
      const value = text.slice(contentStart, closeIndex)
      if (value.length < 2) return null
      return { value: value.slice(0, 200), end: closeIndex + 1 }
    }
    // No matching close quote — fall through to unquoted capture from contentStart
    pos = contentStart
  }

  // 3. Unquoted capture
  const contentStart = pos
  const DELIMITERS = new Set([",", ".", ";", "!", "?"])
  const STOP_WORDS = ["and", "but", "so", "then", "also", "which", "where", "while"]

  let captureEnd = text.length

  outer: for (let i = contentStart; i < text.length; i++) {
    const ch = text[i]

    // Stop at natural delimiter
    if (DELIMITERS.has(ch)) {
      captureEnd = i
      break
    }

    // Stop at newline
    if (ch === "\n" || ch === "\r") {
      captureEnd = i
      break
    }

    // Stop word check: must be preceded by a space
    if (ch === " ") {
      for (const word of STOP_WORDS) {
        const afterWord = i + 1 + word.length
        // Check the stop word matches exactly at i+1
        if (
          text.slice(i + 1, i + 1 + word.length).toLowerCase() === word
        ) {
          // Verify the stop word is not embedded inside a longer word:
          // next char after stop word must be space, end-of-string, punctuation, or newline
          if (afterWord >= text.length) {
            captureEnd = i
            break outer
          }
          const nextChar = text[afterWord]
          if (
            nextChar === " " ||
            nextChar === "\n" ||
            nextChar === "\r" ||
            DELIMITERS.has(nextChar)
          ) {
            captureEnd = i
            break outer
          }
        }
      }
    }
  }

  // Extract and trim trailing whitespace
  let value = text.slice(contentStart, captureEnd).trimEnd()

  if (value.length < 2) return null
  if (value.length > 200) value = value.slice(0, 200)

  return { value, end: contentStart + value.length }
}

// ---------------------------------------------------------------------------
// TriggerDef and TRIGGERS catalog
// ---------------------------------------------------------------------------

/**
 * Defines a single contextual trigger entry: a set of phrases that introduce
 * a PII value, the PII type label, the capture strategy, and an optional
 * structural validator regex.
 */
interface TriggerDef {
  readonly phrases: readonly string[]
  readonly piiType: string
  readonly captureMode: "freeform" | "structural" | "age-pattern"
  readonly structuralValidator?: RegExp
  /**
   * Optional post-match validator. Receives the captured value and returns
   * true if it should be emitted, false to discard. Used to apply digit-rule
   * checks (Luhn for cards, area/group/serial validation for SSNs) that the
   * shape regex alone cannot enforce.
   */
  readonly postValidator?: (value: string) => boolean
}

/**
 * Luhn checksum used by the contextual credit-card validator.
 */
function luhnCheckContextual(digits: string): boolean {
  const nums = digits.replace(/\D/g, "")
  if (nums.length < 12 || nums.length > 19) return false
  let sum = 0
  let alternate = false
  for (let i = nums.length - 1; i >= 0; i--) {
    let n = parseInt(nums[i], 10)
    if (alternate) {
      n *= 2
      if (n > 9) n -= 9
    }
    sum += n
    alternate = !alternate
  }
  return sum % 10 === 0
}

/**
 * SSN digit-rule validator: rejects invalid area numbers (000, 666, 900-999),
 * 00 group, 0000 serial, the well-known invalid 078-05-1120, and 9 repeated
 * digits.
 */
function isValidSSNContextual(value: string): boolean {
  const digits = value.replace(/\D/g, "")
  if (digits.length !== 9) return false
  const area = parseInt(digits.slice(0, 3), 10)
  const group = digits.slice(3, 5)
  const serial = digits.slice(5)
  if (area === 0 || area === 666 || area >= 900) return false
  if (group === "00" || serial === "0000") return false
  if (digits === "078051120") return false
  if (/^(\d)\1{8}$/.test(digits)) return false
  return true
}

/**
 * Full catalog of trigger phrase definitions covering credentials, contact
 * information, identity documents, financial data, and personal attributes.
 */
const TRIGGERS: readonly TriggerDef[] = [
  // ---- Credentials (freeform) ----
  {
    phrases: ["my password is", "password:", "password is", "the password is", "passwd:", "pwd:", "pwd is"],
    piiType: "PASSWORD",
    captureMode: "freeform",
  },
  {
    phrases: ["my pin is", "pin:", "pin code:", "pin code is", "my pin code is"],
    piiType: "PIN",
    captureMode: "freeform",
  },
  {
    phrases: ["passphrase:", "passphrase is", "my passphrase is", "the passphrase is"],
    piiType: "PASSPHRASE",
    captureMode: "freeform",
  },
  {
    phrases: ["secret key:", "secret:", "my secret is", "the secret is"],
    piiType: "SECRET",
    captureMode: "freeform",
  },
  {
    phrases: ["login:", "username:", "my username is", "user:", "my login is"],
    piiType: "USERNAME",
    captureMode: "freeform",
  },

  // ---- Contact (structural) ----
  {
    phrases: [
      "my email is",
      "email:",
      "email me at",
      "reach me at",
      "my email address is",
      "e-mail:",
    ],
    piiType: "EMAIL",
    captureMode: "structural",
    structuralValidator:
      /[a-zA-Z0-9](?:[a-zA-Z0-9._%+\-]*[a-zA-Z0-9])?@[a-zA-Z0-9](?:[a-zA-Z0-9.\-]*[a-zA-Z0-9])?\.[a-zA-Z]{2,}/,
  },
  {
    phrases: [
      "my phone is",
      "phone:",
      "call me at",
      "my number is",
      "my phone number is",
      "reach me on",
      "cell:",
      "mobile:",
      "tel:",
    ],
    piiType: "PHONE_US",
    captureMode: "structural",
    structuralValidator:
      /(?:\+?1[-.\s]?)?(?:\(\d{3}\)|\d{3})[-.\s]?\d{3}[-.\s]?\d{4}/,
  },

  // ---- Identity (mixed) ----
  {
    phrases: [
      "my ssn is",
      "ssn:",
      "social security:",
      "social security number is",
      "my social is",
    ],
    piiType: "SSN",
    captureMode: "structural",
    structuralValidator: /\d{3}[-\s]?\d{2}[-\s]?\d{4}/,
    postValidator: isValidSSNContextual,
  },
  {
    phrases: [
      "passport number:",
      "passport:",
      "my passport is",
      "passport no:",
      "passport #",
    ],
    piiType: "PASSPORT_US",
    captureMode: "freeform",
  },
  {
    phrases: [
      "driver's license:",
      "drivers license:",
      "license number:",
      "dl:",
      "dl#",
      "my license is",
    ],
    piiType: "DRIVERS_LICENSE",
    captureMode: "freeform",
  },
  {
    phrases: ["tax id:", "tax id is", "my tax id is", "tin:", "ein:"],
    piiType: "US_EIN",
    captureMode: "structural",
    structuralValidator: /\d{2}-?\d{7}/,
  },

  // ---- Financial (mixed) ----
  {
    phrases: [
      "account number:",
      "account number is",
      "my account is",
      "acct:",
      "acct#",
      "my account number is",
    ],
    piiType: "BANK_ACCOUNT",
    captureMode: "freeform",
  },
  {
    phrases: [
      "routing number:",
      "routing number is",
      "routing:",
      "aba:",
      "my routing number is",
    ],
    piiType: "ROUTING_NUMBER",
    captureMode: "freeform",
  },
  {
    phrases: [
      "card number:",
      "card number is",
      "my card is",
      "my card number is",
      "cc:",
      "credit card:",
    ],
    piiType: "CREDIT_CARD",
    captureMode: "structural",
    structuralValidator: /\d[\d\s-]{11,18}\d/,
    postValidator: luhnCheckContextual,
  },

  // ---- Personal (freeform) ----
  {
    phrases: [
      "my address is",
      "i live at",
      "address:",
      "my home address is",
      "mailing address:",
      "street address:",
    ],
    piiType: "STREET_ADDRESS",
    captureMode: "freeform",
  },
  {
    phrases: [
      "my date of birth is",
      "dob:",
      "date of birth:",
      "i was born on",
      "birthday:",
      "born on",
    ],
    piiType: "DATE_OF_BIRTH",
    captureMode: "freeform",
  },
  {
    phrases: ["my name is", "name:", "full name:", "my full name is"],
    piiType: "PERSON_NAME",
    captureMode: "freeform",
  },
  {
    phrases: ["my age is", "age:"],
    piiType: "AGE",
    captureMode: "freeform",
  },
  {
    phrases: ["i am"],
    piiType: "AGE",
    captureMode: "age-pattern",
  },
]

// ---------------------------------------------------------------------------
// detectContextualPII
// ---------------------------------------------------------------------------

/**
 * Detects PII values in `text` by scanning for trigger phrases and capturing
 * the value that follows using the configured capture mode.
 *
 * Capture modes:
 * - `freeform`: delegates to `captureSmartBoundary`.
 * - `structural`: skips whitespace then applies `structuralValidator` at
 *   position 0 of the remaining text; emits the first match.
 * - `age-pattern`: matches `\s+(\d{1,3})\s+years?\s+old` immediately after
 *   the trigger phrase.
 *
 * Word-boundary enforcement: the character immediately before a trigger phrase
 * must be start-of-string, space, tab, newline, or carriage return to prevent
 * matching inside compound words (e.g., "repassword" must not match "password").
 *
 * All detected matches carry confidence 0.99.
 *
 * @param text - The message text to scan.
 * @returns Array of `DetectorMatch` objects, one per detected PII value.
 * @example
 * detectContextualPII("my password is hunter2")
 * // => [{ type: 'PASSWORD', value: 'hunter2', start: 15, end: 22, confidence: 0.99 }]
 */
export function detectContextualPII(text: string): DetectorMatch[] {
  const raw: Array<DetectorMatch & { triggerStart: number }> = []
  const lower = text.toLowerCase()

  for (const trigger of TRIGGERS) {
    for (const phrase of trigger.phrases) {
      const phraseLen = phrase.length
      let searchFrom = 0

      while (searchFrom < lower.length) {
        const idx = lower.indexOf(phrase, searchFrom)
        if (idx === -1) break

        // Word-boundary check: char before the trigger must be a word boundary
        if (idx > 0) {
          const charBefore = lower[idx - 1]
          if (
            charBefore !== " " &&
            charBefore !== "\t" &&
            charBefore !== "\n" &&
            charBefore !== "\r"
          ) {
            searchFrom = idx + 1
            continue
          }
        }

        const afterTrigger = idx + phraseLen

        if (trigger.captureMode === "age-pattern") {
          // Match: \s+(\d{1,3})\s+years?\s+old
          const agePattern = /^\s+(\d{1,3})\s+years?\s+old/i
          const remaining = text.slice(afterTrigger)
          const ageMatch = agePattern.exec(remaining)
          if (ageMatch) {
            const ageValue = ageMatch[1]
            // Find start of the digit in original text
            const digitOffset = ageMatch[0].indexOf(ageMatch[1])
            const valueStart = afterTrigger + digitOffset
            raw.push({
              type: trigger.piiType,
              value: ageValue,
              start: valueStart,
              end: valueStart + ageValue.length,
              confidence: 0.99,
              triggerStart: idx,
            })
          }
          searchFrom = idx + 1
          continue
        }

        if (trigger.captureMode === "structural") {
          // Skip whitespace after trigger
          let pos = afterTrigger
          while (pos < text.length && (text[pos] === " " || text[pos] === "\t")) {
            pos++
          }
          if (pos >= text.length) {
            searchFrom = idx + 1
            continue
          }
          const remaining = text.slice(pos)
          const validator = trigger.structuralValidator
          if (!validator) {
            searchFrom = idx + 1
            continue
          }
          // Apply validator anchored at position 0
          const anchoredSrc = validator.source
          const anchored = new RegExp("^" + anchoredSrc, validator.flags.replace("g", ""))
          const m = anchored.exec(remaining)
          if (m) {
            const value = m[0]
            if (!trigger.postValidator || trigger.postValidator(value)) {
              raw.push({
                type: trigger.piiType,
                value,
                start: pos,
                end: pos + value.length,
                confidence: 0.99,
                triggerStart: idx,
              })
            }
          }
          searchFrom = idx + 1
          continue
        }

        // freeform
        const captured = captureSmartBoundary(text, afterTrigger)
        if (captured) {
          const valueOffset = text.slice(afterTrigger).indexOf(captured.value)
          const valueStart = afterTrigger + valueOffset
          raw.push({
            type: trigger.piiType,
            value: captured.value,
            start: valueStart,
            end: valueStart + captured.value.length,
            confidence: 0.99,
            triggerStart: idx,
          })
        }
        searchFrom = idx + 1
      }
    }
  }

  return deduplicateMatches(raw)
}

/**
 * Removes duplicate matches that arose from overlapping trigger phrases
 * (e.g., "password is" matching inside "my password is").
 *
 * For each group of same-type matches whose value spans overlap, keeps only
 * the match whose trigger started earliest in the text (i.e., the longer,
 * more-specific trigger phrase that consumed more leading context).
 *
 * @param matches - Raw matches with an extra `triggerStart` field.
 * @returns Deduplicated array of `DetectorMatch` objects.
 */
function deduplicateMatches(
  matches: Array<DetectorMatch & { triggerStart: number }>
): DetectorMatch[] {
  // Sort by triggerStart ascending (earlier trigger = more specific/longer)
  const sorted = [...matches].sort((a, b) => a.triggerStart - b.triggerStart)
  const kept: Array<DetectorMatch & { triggerStart: number }> = []

  for (const candidate of sorted) {
    // Check if this candidate overlaps with any already-kept match of the same type
    const overlaps = kept.some(
      (k) =>
        k.type === candidate.type &&
        candidate.start < k.end &&
        candidate.end > k.start
    )
    if (!overlaps) {
      kept.push(candidate)
    }
  }

  // Strip the internal triggerStart field from the output
  return kept.map(({ triggerStart: _ts, ...match }) => match)
}
