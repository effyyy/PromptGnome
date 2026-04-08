/**
 * JetBrains Mono uppercase label for section headers.
 * Design system UI primitive — Toxic Cyan theme.
 * Pure component with no side effects or chrome.* API calls.
 * Architecture layer: UI (presentation primitive)
 */
import type { ReactNode } from "react"

/** Props for the MonoLabel component. */
interface MonoLabelProps {
  /** Label content. */
  children: ReactNode
  /** Additional CSS classes. */
  className?: string
}

/**
 * Mono uppercase section label with cyan dim color.
 * @param props - MonoLabel props.
 * @returns A styled label element.
 */
export function MonoLabel({ children, className = "" }: MonoLabelProps) {
  return (
    <div className={`font-mono text-[9px] font-medium uppercase tracking-[2px] text-cyber-dim ${className}`}>
      {children}
    </div>
  )
}
