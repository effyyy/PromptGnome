/**
 * PII type badge with colored indicator dot.
 * Design system UI primitive — PromptGnome brand theme.
 * Pure component with no side effects or chrome.* API calls.
 * Architecture layer: UI (presentation primitive)
 */

/** Props for the PiiBadge component. */
interface PiiBadgeProps {
  /** PII type string to display. */
  type: string
  /** Tailwind class for the dot color. */
  dotColor?: string
}

/**
 * Inline badge for displaying a PII entity type.
 * @param props - PiiBadge props.
 * @returns A styled badge element.
 */
export function PiiBadge({ type, dotColor = "bg-[var(--danger)]" }: PiiBadgeProps) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[var(--danger-soft)] border border-[var(--danger)]/10 font-mono text-[9px] font-medium text-[var(--danger)]">
      <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
      {type}
    </span>
  )
}
