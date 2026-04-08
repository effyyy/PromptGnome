/**
 * Individual step component for the onboarding flow.
 * Renders a step with title, description, and content slot.
 * Architecture layer: UI (presentation component)
 */
import { GhostButton } from "~src/components/ui/GhostButton"
import { CyanButton } from "~src/components/ui/CyanButton"

/** Props for the OnboardingStep component */
interface OnboardingStepProps {
  /** Step number (1-3) */
  step: number
  /** Total number of steps */
  totalSteps: number
  /** Step title */
  title: string
  /** Step description */
  description: string
  /** Step content (React children) */
  children: React.ReactNode
  /** Called when Next is clicked */
  onNext: () => void
  /** Called when Back is clicked */
  onBack?: () => void
  /** Label for the next button */
  nextLabel?: string
}

/**
 * Renders a single onboarding step with navigation.
 * @param props - Component props
 * @returns React element for the onboarding step
 */
function OnboardingStep({
  step,
  totalSteps,
  title,
  description,
  children,
  onNext,
  onBack,
  nextLabel = "Next"
}: OnboardingStepProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Progress dots */}
      <div className="flex justify-center gap-2 mb-6">
        {Array.from({ length: totalSteps }, (_, i) => (
          <div
            key={i}
            className={`w-2 h-2 rounded-full transition-all duration-300 ${
              i + 1 === step
                ? "bg-cyber shadow-cyber-sm scale-110"
                : i + 1 < step
                ? "bg-cyber/60"
                : "bg-cyber/15"
            }`}
          />
        ))}
      </div>

      {/* Content */}
      <div className="flex-1">
        <h2 className="text-xl font-sans font-bold text-[var(--text-primary)] mb-2">{title}</h2>
        {description && (
          <p className="text-sm font-sans text-[var(--text-secondary)] mb-6">{description}</p>
        )}
        {children}
      </div>

      {/* Navigation */}
      <div className="flex gap-3 mt-6">
        {onBack && (
          <GhostButton onClick={onBack} className="flex-1">
            Back
          </GhostButton>
        )}
        <CyanButton onClick={onNext} className="flex-1">
          {nextLabel}
        </CyanButton>
      </div>
    </div>
  )
}

export default OnboardingStep
