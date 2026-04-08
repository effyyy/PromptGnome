/**
 * Null-object port for the FeedbackTab component.
 *
 * In the Free build the feedback tab is not functional — Pro users access
 * detection-accuracy feedback through the Pro-only FeedbackTab implementation.
 * This stub renders a placeholder so the Free build compiles without the Pro
 * dependency.
 *
 * Architecture layer: UI / Port component (Free)
 */

/**
 * Free-tier placeholder for the feedback tab.
 * Renders a simple message directing users to the Pro version.
 *
 * @returns React element with upgrade prompt
 */
function FeedbackTab(): JSX.Element {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-6 text-center">
        <p className="text-sm font-sans text-[var(--text-muted)]">
          Detection accuracy feedback is available in the Pro version.
        </p>
      </div>
    </div>
  );
}

export default FeedbackTab;
