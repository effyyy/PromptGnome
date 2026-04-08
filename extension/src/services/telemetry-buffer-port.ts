/**
 * Null-object port for the telemetry-buffer service.
 *
 * Provides noop implementations of appendEvent used by message-router.ts
 * in the Free build. The Pro build (privito) wires in the real implementation.
 *
 * Architecture layer: Services / Port interface (Free)
 */

/**
 * Appends a telemetry event to the buffer.
 * Noop in the Free build — no telemetry is collected.
 *
 * @param _event - The telemetry event to buffer.
 * @returns A promise that resolves immediately.
 */
export async function appendEvent(_event: unknown): Promise<void> {
  // noop — no telemetry in Free build
}
