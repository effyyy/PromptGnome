/**
 * Category toggle switches for quick PII type enable/disable.
 * Groups PII types using the canonical PII_CATEGORIES from constants.
 * Architecture layer: UI (presentation component)
 */
import { PII_CATEGORIES } from "~src/shared/constants"
import { CyanToggle } from "~src/components/ui/CyanToggle"
import { MonoLabel } from "~src/components/ui/MonoLabel"

/** Derived category list from the canonical PII_CATEGORIES definition */
const CATEGORIES = Object.entries(PII_CATEGORIES).map(([name, types]) => ({
  name,
  types,
}))

/** Props for the CategoryToggles component */
interface CategoryTogglesProps {
  /** Record of PII type ID to enabled status */
  enabledTypes: Record<string, boolean>
  /** Called when a category's enabled status changes */
  onToggleCategory: (types: readonly string[], enabled: boolean) => void
}

/**
 * Displays category toggles for quick toggling of PII type groups.
 * @param props - Component props
 * @returns React element with category toggles
 */
function CategoryToggles({ enabledTypes, onToggleCategory }: CategoryTogglesProps) {
  return (
    <div className="space-y-1.5 py-2">
      <MonoLabel className="mb-2">Detection Categories</MonoLabel>
      {CATEGORIES.map((cat) => {
        const allEnabled = cat.types.every((t) => enabledTypes[t] !== false)
        return (
          <div key={cat.name} className="flex items-center justify-between py-1">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-sans text-[var(--text-secondary)]">{cat.name}</span>
              <span className="text-[10px] font-mono text-[var(--text-muted)]">({cat.types.length})</span>
            </div>
            <CyanToggle
              checked={allEnabled}
              onChange={(checked) => onToggleCategory(cat.types, checked)}
            />
          </div>
        )
      })}
    </div>
  )
}

export default CategoryToggles
