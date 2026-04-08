/**
 * Renders text with detected PII spans highlighted.
 * Matches the landing page demo style: red background tint, red text,
 * solid red bottom border, semi-bold weight.
 * Architecture layer: UI (presentation component)
 */

import type { PIIMatch } from "~src/detection/types"

/** Props for the PIIHighlight component */
interface PIIHighlightProps {
  /** Original text containing PII */
  text: string
  /** Array of PII matches to highlight */
  matches: PIIMatch[]
}

/**
 * Renders text with PII matches highlighted in demo-matching styled spans.
 * Non-PII text renders as plain text nodes.
 * @param props - Component props
 * @returns React element with highlighted text
 */
function PIIHighlight({ text, matches }: PIIHighlightProps) {
  if (matches.length === 0) {
    return <span style={{ color: '#c8d6e0' }}>{text}</span>
  }

  const sorted = [...matches].sort((a, b) => a.start - b.start)
  const segments: Array<{ text: string; isPII: boolean; type?: string }> = []
  let lastEnd = 0

  for (const match of sorted) {
    if (match.start > lastEnd) {
      segments.push({ text: text.slice(lastEnd, match.start), isPII: false })
    }
    segments.push({
      text: text.slice(match.start, match.end),
      isPII: true,
      type: match.type
    })
    lastEnd = match.end
  }

  if (lastEnd < text.length) {
    segments.push({ text: text.slice(lastEnd), isPII: false })
  }

  return (
    <span>
      {segments.map((seg, i) =>
        seg.isPII ? (
          <span
            key={i}
            style={{
              background: 'rgba(255, 107, 107, 0.15)',
              borderBottom: '2px solid #ff6b6b',
              padding: '1px 4px',
              borderRadius: '3px',
              color: '#ff6b6b',
              fontWeight: 600,
            }}
            title={seg.type?.replace(/_/g, " ")}
          >
            {seg.text}
          </span>
        ) : (
          <span key={i} style={{ color: '#c8d6e0' }}>
            {seg.text}
          </span>
        )
      )}
    </span>
  )
}

export default PIIHighlight
