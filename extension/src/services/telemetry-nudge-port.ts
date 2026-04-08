/**
 * Null-object port for the telemetry-nudge service.
 *
 * Provides noop implementations of the functions consumed by message-router.ts
 * in the Free build. The Pro build (privito) wires in the real implementation.
 *
 * Architecture layer: Services / Port interface (Free)
 */

/**
 * Increments the scan count used to gate the telemetry opt-in nudge.
 * Noop in the Free build — no nudge tracking without telemetry.
 *
 * @returns A promise that resolves immediately.
 */
export async function incrementScanCount(): Promise<void> {
  // noop — no telemetry nudge in Free build
}
