/**
 * Null-object port for Pro backend handlers (analytics, OTP, billing portal).
 *
 * The Free build uses these stubs so message-router has no backend fetch
 * calls compiled into it. In the Pro build, this file is swapped for a
 * real implementation at the entry point.
 *
 * Architecture layer: Background / Pro backend bridge (Free)
 */

/**
 * Stub: returns success without contacting any backend.
 *
 * @param _payload - Ignored in the Free build.
 */
export async function handleAnalyticsEvent(
  _payload: { name: string; params: Record<string, string> },
): Promise<{ success: boolean }> {
  return { success: true };
}

/**
 * Stub: always reports the email as not found.
 *
 * @param _payload - Ignored in the Free build.
 */
export async function handleVerifyEmail(
  _payload: { email: string },
): Promise<{ found: boolean }> {
  return { found: false };
}

/**
 * Stub: always reports the Pro feature as unavailable.
 *
 * @param _payload - Ignored in the Free build.
 */
export async function handleVerifyOtp(
  _payload: { email: string; code: string },
): Promise<{ status: string; customerId: string } | { error: string }> {
  return { error: "Pro feature not available." };
}

/**
 * Stub: always reports the Pro feature as unavailable.
 *
 * @param _payload - Ignored in the Free build.
 */
export async function handleBillingPortal(
  _payload: { customerId: string; subscriptionId?: string },
): Promise<{ url: string } | { error: string }> {
  return { error: "Pro feature not available." };
}
