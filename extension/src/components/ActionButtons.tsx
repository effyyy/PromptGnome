/**
 * Action buttons for the PII warning overlay.
 * Provides Edit Message, Send Anyway, and Auto-Anonymize options.
 * Architecture layer: UI (presentation component)
 */
import { CyanButton } from "~src/components/ui/CyanButton"
import { GhostButton } from "~src/components/ui/GhostButton"
import { SuccessButton } from "~src/components/ui/SuccessButton"

/** Props for the ActionButtons component */
interface ActionButtonsProps {
  /** Called when user chooses to go back and edit the message */
  onEditMessage: () => void
  /** Called when user chooses to send the message despite PII */
  onSendAnyway: () => void
  /** Called when user wants to auto-anonymize */
  onAutoAnonymize: () => void
}

/**
 * Renders the action buttons for the PII warning overlay.
 * @param props - Component props
 * @returns React element with action buttons
 */
function ActionButtons({
  onEditMessage,
  onSendAnyway,
  onAutoAnonymize,
}: ActionButtonsProps) {
  return (
    <div className="flex flex-col gap-2.5">
      {/* Primary safe action */}
      <CyanButton onClick={onEditMessage} className="w-full justify-center py-2.5 text-sm">
        Edit Message
      </CyanButton>

      {/* Secondary actions in a row */}
      <div className="flex gap-2">
        <GhostButton onClick={onSendAnyway} className="flex-1 justify-center text-sm">
          Send Anyway
        </GhostButton>

        <SuccessButton
          onClick={onAutoAnonymize}
          className="flex-1 justify-center relative text-sm"
        >
          Auto-Anonymize
        </SuccessButton>
      </div>
    </div>
  )
}

export default ActionButtons
