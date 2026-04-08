/**
 * Null-object port for the telemetry-sync service.
 *
 * Provides noop implementations of the functions consumed by Free files
 * (alarm-handler, background/index, message-router). The Pro build
 * (privito) wires in the real telemetry-sync module.
 *
 * Architecture layer: Services / Port interface (Free)
 */

/**
 * Generates a random install ID string.
 * Noop in the Free build — always returns an empty string.
 *
 * @returns Empty string (noop).
 */
export function generateInstallId(): string {
  return "";
}

/**
 * Syncs buffered telemetry events to the backend.
 * Noop in the Free build — resolves immediately.
 *
 * @returns A promise that resolves immediately.
 */
export async function sync(): Promise<void> {
  // noop — no telemetry in Free build
}
