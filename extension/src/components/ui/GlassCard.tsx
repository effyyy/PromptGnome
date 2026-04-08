/**
 * Dark surface card with cyan border and backdrop blur.
 * Design system UI primitive — PromptGnome brand theme.
 * Pure component with no side effects or chrome.* API calls.
 * Architecture layer: UI (presentation primitive)
 */
import type { ReactNode } from "react"

/** Props for the GlassCard component. */
interface GlassCardProps {
  /** Card content. */
  children: ReactNode
  /** Additional CSS classes. */
  className?: string
  /** When true, removes the cyan border. */
  noBorder?: boolean
}

/**
 * Dark surface card with optional cyan border and backdrop blur.
 * @param props - GlassCard props.
 * @returns A styled card container element.
 */
export function GlassCard({ children, className = "", noBorder = false }: GlassCardProps) {
  return (
    <div
      className={`
        rounded-xl p-4
        bg-[var(--bg-surface)] backdrop-blur-lg
        ${noBorder ? "" : "border border-cyber-soft"}
        ${className}
      `.trim()}
    >
      {children}
    </div>
  )
}
