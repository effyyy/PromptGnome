/**
 * Null-object port for the TelemetryConsent component.
 *
 * Provides a noop React component so Free-tier files can import the symbol
 * without requiring the Pro implementation. The component is never rendered
 * in the Free build because all call sites are gated behind PRO_BUILD.
 *
 * Architecture layer: UI / Port component (Free)
 */

/** Props for the TelemetryConsent component. */
interface TelemetryConsentProps {
  /** Called when the user makes a consent decision. */
  readonly onDecision: (enabled: boolean) => void;
}

/**
 * Noop telemetry consent component.
 * Renders nothing in the Free build.
 *
 * @returns null
 */
function TelemetryConsent(_props: TelemetryConsentProps): null {
  return null;
}

export default TelemetryConsent;
