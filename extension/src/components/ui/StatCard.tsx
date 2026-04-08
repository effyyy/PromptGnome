/**
 * Stat display card with mono-font number and label.
 * Design system UI primitive — PromptGnome brand theme.
 * Pure component with no side effects or chrome.* API calls.
 * Architecture layer: UI (presentation primitive)
 */

/** Props for the StatCard component. */
interface StatCardProps {
  /** Numeric or string value to display. */
  value: string | number
  /** Label shown below the value. */
  label: string
  /** Visual variant — 'danger' highlights in red. */
  variant?: "default" | "danger"
  /** Additional CSS classes. */
  className?: string
}

/**
 * Compact stat card displaying a value with a mono-font label.
 * @param props - StatCard props.
 * @returns A styled stat display element.
 */
export function StatCard({ value, label, variant = "default", className = "" }: StatCardProps) {
  const valueColor = variant === "danger" ? "text-[var(--danger)]" : "text-[#5dffc1]"
  const borderColor = variant === "danger" ? "border-[var(--danger)]/10" : "border-cyber-soft"
  const bgColor = variant === "danger" ? "bg-[var(--danger)]/[0.03]" : "bg-cyber/[0.02]"

  return (
    <div className={`${borderColor} ${bgColor} border rounded-lg p-3 text-center ${className}`}>
      <div className={`font-mono text-lg font-bold ${valueColor}`}>{value}</div>
      <div className="font-mono text-[8px] uppercase tracking-widest text-[var(--text-muted)] mt-1">{label}</div>
    </div>
  )
}
