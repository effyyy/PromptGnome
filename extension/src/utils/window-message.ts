/**
 * Helpers for same-window cross-world messaging between MAIN and isolated
 * content scripts.
 */

/**
 * Returns true only for messages delivered from the current page origin.
 *
 * Browser-delivered same-window postMessage events set `source` to `window`.
 * Some test environments leave it null for manually constructed events, so the
 * source check is enforced when the value is available.
 */
export function isTrustedWindowMessage(event: MessageEvent): boolean {
  if (event.origin !== window.location.origin) return false
  if (event.source !== null && event.source !== window) return false
  return true
}

/** Posts a message to this page origin without using a wildcard target. */
export function postTrustedWindowMessage(message: unknown): void {
  window.postMessage(message, window.location.origin)
}
