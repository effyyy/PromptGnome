/**
 * Green accent button for positive actions (Auto-Anonymize).
 * Design system component — Toxic Cyan theme.
 * Architecture layer: UI (presentation primitive)
 */
import type { ReactNode, MouseEventHandler } from "react"

/** Props for the SuccessButton component. */
interface SuccessButtonProps {
  /** Button content. */
  children: ReactNode
  /** Click handler. */
  onClick: MouseEventHandler<HTMLButtonElement>
  /** Whether the button is disabled. */
  disabled?: boolean
  /** Additional CSS classes. */
  className?: string
}

/**
 * Green accent button for positive/success actions.
 * @param props - SuccessButton props.
 * @returns A styled button element.
 */
export function SuccessButton({ children, onClick, disabled = false, className = "" }: SuccessButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        px-4 py-2.5 rounded-lg font-sans font-semibold text-sm
        transition-all duration-200
        ${disabled
          ? "opacity-40 cursor-not-allowed text-[var(--text-muted)] bg-[var(--success-soft)] border border-[var(--success)]/10"
          : "bg-[var(--success-soft)] text-[var(--success)] border border-[var(--success)]/20 hover:bg-[var(--success)]/20 hover:shadow-[0_0_12px_rgba(34,197,94,0.15)] focus:outline-none focus:ring-2 focus:ring-[var(--success)] focus:ring-offset-2 focus:ring-offset-void"
        }
        ${className}
      `.trim()}
    >
      {children}
    </button>
  )
}
