/**
 * Toggle switch with cyan gradient glow.
 * Design system component — PromptGnome brand theme.
 * Architecture layer: UI (presentation primitive)
 */

/** Props for the CyanToggle component. */
interface CyanToggleProps {
  /** Current checked state. */
  checked: boolean
  /** Called with the new value when toggled. */
  onChange: (checked: boolean) => void
  /** Whether the toggle is disabled. */
  disabled?: boolean
  /** Optional label displayed to the left. */
  label?: string
}

/**
 * Toggle switch with cyan glow when active.
 * @param props - CyanToggle props.
 * @returns A styled toggle switch element.
 */
export function CyanToggle({ checked, onChange, disabled = false, label }: CyanToggleProps) {
  const handleClick = () => {
    if (!disabled) {
      onChange(!checked)
    }
  }

  return (
    <label className={`inline-flex items-center shrink-0 ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}>
      {label && <span className="text-[var(--text-secondary)] text-sm font-sans">{label}</span>}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={disabled ? undefined : handleClick}
        disabled={disabled}
        className={`
          relative w-10 h-5 shrink-0 overflow-hidden rounded-full transition-colors duration-200
          ${checked
            ? "bg-gradient-to-r from-cyber/50 to-cyber/35 shadow-cyber-sm"
            : "bg-white/[0.08]"
          }
        `}
      >
        <span
          className={`
            absolute left-0.5 top-0.5 w-4 h-4 rounded-full shadow transition-transform duration-200
            ${checked
              ? "translate-x-5 bg-[var(--text-primary)]"
              : "bg-[var(--text-muted)]"
            }
          `}
        />
      </button>
    </label>
  )
}
