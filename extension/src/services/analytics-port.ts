/**
 * Null-object port for the analytics service.
 *
 * Provides noop implementations of the analytics functions consumed by
 * Free-tier UI files (popup, sidepanel, onboarding). The Pro build (privito)
 * wires in the real implementation from analytics.ts.
 *
 * Architecture layer: Services / Port interface (Free)
 */

/**
 * Tracks a session start event.
 * Noop in the Free build — no analytics without telemetry consent.
 *
 * @param _context - The context identifier (e.g. "popup", "sidepanel").
 * @returns A promise that resolves immediately.
 */
export async function trackSessionStart(_context: string): Promise<void> {
  // noop
}

/**
 * Tracks a daily active user event.
 * Noop in the Free build — no analytics without telemetry consent.
 *
 * @returns A promise that resolves immediately.
 */
export async function trackDailyActive(): Promise<void> {
  // noop
}

/**
 * Tracks a Pro checkout started event.
 * Noop in the Free build.
 *
 * @returns A promise that resolves immediately.
 */
export async function trackProCheckoutStarted(): Promise<void> {
  // noop
}

/**
 * Tracks a Pro subscribed event.
 * Noop in the Free build.
 *
 * @returns A promise that resolves immediately.
 */
export async function trackProSubscribed(): Promise<void> {
  // noop
}

/**
 * Tracks a Pro restored event.
 * Noop in the Free build.
 *
 * @returns A promise that resolves immediately.
 */
export async function trackProRestored(): Promise<void> {
  // noop
}

/**
 * Tracks a Pro status changed event.
 * Noop in the Free build.
 *
 * @param _status - The new Pro status.
 * @returns A promise that resolves immediately.
 */
export async function trackProStatusChanged(_status: string): Promise<void> {
  // noop
}
