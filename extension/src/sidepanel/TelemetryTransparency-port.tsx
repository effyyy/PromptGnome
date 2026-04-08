/**
 * Null-object port for the TelemetryTransparency component.
 *
 * Provides a noop React component so Free-tier files can import the symbol
 * without requiring the Pro implementation. The component is never rendered
 * in the Free build because all call sites are gated behind PRO_BUILD.
 *
 * Architecture layer: UI / Port component (Free)
 */

/**
 * Noop telemetry transparency tab component.
 * Renders nothing in the Free build.
 *
 * @returns null
 */
function TelemetryTransparency(): null {
  return null;
}

export default TelemetryTransparency;
