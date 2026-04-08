/**
 * Secondary/subtle action button.
 * Design system component — Toxic Cyan theme.
 * Architecture layer: UI (presentation primitive)
 */
import type { ReactNode, MouseEventHandler } from "react"

/** Props for the GhostButton component. */
interface GhostButtonProps {
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
 * Secondary ghost button with subtle background.
 * @param props - GhostButton props.
 * @returns A styled button element.
 */
export function GhostButton({ children, onClick, disabled = false, className = "" }: GhostButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        px-4 py-2.5 rounded-lg font-sans font-semibold text-sm
        transition-all duration-200
        ${disabled
          ? "opacity-40 cursor-not-allowed text-[var(--text-muted)] bg-white/[0.02]"
          : "text-[var(--text-secondary)] bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.08] hover:text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-cyber focus:ring-offset-2 focus:ring-offset-void"
        }
        ${className}
      `.trim()}
    >
      {children}
    </button>
  )
}
