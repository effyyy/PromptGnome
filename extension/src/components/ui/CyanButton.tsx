/**
 * Primary action button with cyan border and glow.
 * Design system component — PromptGnome brand theme.
 * Architecture layer: UI (presentation primitive)
 */
import type { ReactNode, MouseEventHandler } from "react"

/** Props for the CyanButton component. */
interface CyanButtonProps {
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
 * Primary action button with cyan accent border and glow effect.
 * @param props - CyanButton props.
 * @returns A styled button element.
 */
export function CyanButton({ children, onClick, disabled = false, className = "" }: CyanButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        px-4 py-2.5 rounded-lg font-sans font-semibold text-sm
        transition-all duration-200
        ${disabled
          ? "opacity-40 cursor-not-allowed bg-cyber/5 text-cyber-dim border border-cyber-soft"
          : "bg-cyber/10 text-[#5dffc1] border border-cyber/20 hover:bg-cyber/20 hover:shadow-cyber focus:outline-none focus:ring-2 focus:ring-cyber focus:ring-offset-2 focus:ring-offset-void"
        }
        ${className}
      `.trim()}
    >
      {children}
    </button>
  )
}
