/**
 * Toggle switch for enabling/disabling PII protection.
 * Shows current protection status with visual indicator.
 * Architecture layer: UI (presentation component)
 */
import { CyanToggle } from "~src/components/ui/CyanToggle"

/** Props for the ProtectionToggle component */
interface ProtectionToggleProps {
  /** Whether protection is currently enabled */
  enabled: boolean
  /** Called when the toggle state changes */
  onToggle: (enabled: boolean) => void
}

/**
 * Protection on/off toggle with status indicator.
 * @param props - Component props
 * @returns React element with toggle switch
 */
function ProtectionToggle({ enabled, onToggle }: ProtectionToggleProps) {
  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-2">
        <div
          className={`w-2 h-2 rounded-full transition-colors ${
            enabled ? "bg-[var(--success)] shadow-[0_0_6px_rgba(74,222,128,0.5)]" : "bg-[var(--text-muted)]"
          }`}
        />
        <span className="text-sm font-sans font-medium text-[var(--text-primary)]">
          {enabled ? "Protection Active" : "Protection Off"}
        </span>
      </div>
      <CyanToggle checked={enabled} onChange={onToggle} />
    </div>
  )
}

export default ProtectionToggle
