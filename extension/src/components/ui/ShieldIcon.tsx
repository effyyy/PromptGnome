/**
 * PromptGnome logo icon with emerald glow.
 * Design system UI primitive — PromptGnome brand theme.
 * Pure component with no side effects or chrome.* API calls.
 * Architecture layer: UI (presentation primitive)
 */

/** Props for the ShieldIcon component. */
interface ShieldIconProps {
  /** Icon size in pixels. */
  size?: number
  /** Whether to apply the pulsing glow animation. */
  animate?: boolean
}

/**
 * Gnome logo icon with optional animated emerald glow.
 * Matches the landing page mascot: gnome hat with shield emblem.
 * @param props - ShieldIcon props.
 * @returns A styled gnome icon element.
 */
export function ShieldIcon({ size = 40, animate = false }: ShieldIconProps) {
  return (
    <div
      className={`
        flex items-center justify-center rounded-lg
        border-[1.5px] border-cyber/45
        bg-cyber/[0.03]
        ${animate ? "animate-icon-glow" : "shadow-cyber-sm"}
      `}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 40 40"
        fill="none"
        style={{ width: size * 0.65, height: size * 0.65 }}
        aria-hidden="true"
      >
        {/* Gnome hat */}
        <path
          d="M20 2 L30 18 L10 18 Z"
          fill="url(#hat-gradient)"
          stroke="#00e5a0"
          strokeWidth="0.5"
        />
        {/* Shield emblem on hat */}
        <path
          d="M20 8 L23 11 L23 14 L20 16 L17 14 L17 11 Z"
          fill="none"
          stroke="#ffb347"
          strokeWidth="1"
        />
        {/* Face */}
        <circle
          cx="20"
          cy="25"
          r="8"
          fill="#0e1628"
          stroke="#00e5a0"
          strokeWidth="1"
        />
        {/* Eyes */}
        <circle cx="17" cy="24" r="1.5" fill="#00e5a0" />
        <circle cx="23" cy="24" r="1.5" fill="#00e5a0" />
        {/* Smile */}
        <path
          d="M17 27 Q20 30 23 27"
          fill="none"
          stroke="#00e5a0"
          strokeWidth="0.8"
          strokeLinecap="round"
        />
        <defs>
          <linearGradient id="hat-gradient" x1="20" y1="2" x2="20" y2="18" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#00e5a0" />
            <stop offset="100%" stopColor="#007a54" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  )
}
