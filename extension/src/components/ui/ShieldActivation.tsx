/**
 * Shield activation animation container with expanding rings and hex grid.
 * Used as background wrapper for the PII warning overlay modal.
 * Design system component — PromptGnome brand theme.
 * Architecture layer: UI (animation wrapper)
 *
 * Decorative elements (hex grid, expanding rings) are isolated inside their
 * own overflow-hidden wrapper so they never clip the modal content.
 */
import type { ReactNode } from "react"

/** Props for the ShieldActivation component. */
interface ShieldActivationProps {
  /** Modal content to render on top of the animation. */
  children: ReactNode
}

/**
 * Renders a hex grid background and 3 staggered expanding ring animations
 * behind the provided children.
 * @param props - ShieldActivation props.
 * @returns A relative container with hex grid, rings, and content.
 */
export function ShieldActivation({ children }: ShieldActivationProps) {
  return (
    <div className="relative">
      {/* Decorative elements — clipped to prevent 500px ring layout expansion */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        {/* Hex grid pattern */}
        <svg className="absolute inset-0 w-full h-full opacity-40" viewBox="0 0 460 320">
          <defs>
            <pattern id="hexagons" width="28" height="48.5" patternUnits="userSpaceOnUse" patternTransform="scale(1.5)">
              <polygon
                points="14,2 25.12,9.25 25.12,23.75 14,31 2.88,23.75 2.88,9.25"
                fill="none"
                stroke="rgba(0,229,160,0.03)"
                strokeWidth="0.5"
              />
              <polygon
                points="14,19 25.12,26.25 25.12,40.75 14,48 2.88,40.75 2.88,26.25"
                fill="none"
                stroke="rgba(0,229,160,0.03)"
                strokeWidth="0.5"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#hexagons)" />
        </svg>

        {/* Expanding shield rings — 3 staggered instances */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-shield-expand rounded-full border-[1.5px] border-cyber/15" />
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-shield-expand rounded-full border-[1.5px] border-cyber/15"
          style={{ animationDelay: "-1.3s" }}
        />
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-shield-expand rounded-full border-[1.5px] border-cyber/15"
          style={{ animationDelay: "-2.6s" }}
        />
      </div>

      {/* Content slot — NOT clipped by the decorative wrapper */}
      <div className="relative z-10">{children}</div>
    </div>
  )
}
