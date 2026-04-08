/**
 * Null-object port for the jwt-manager service.
 *
 * Provides noop implementations of the functions consumed by message-router.ts
 * in the Free build. The Pro build (privito) wires in the real implementation.
 *
 * Architecture layer: Services / Port interface (Free)
 */

/**
 * Gets a valid JWT for authenticating backend API requests.
 * Always returns null in the Free build (no backend JWT in Free build).
 *
 * @param _identifier     - Customer ID or install ID.
 * @param _tokenEndpoint  - Backend token exchange URL.
 * @param _useInstallId   - Whether to use install ID instead of customer ID.
 * @returns null — no JWT in the Free build.
 */
export async function getValidJWT(
  _identifier: string,
  _tokenEndpoint: string,
  _useInstallId: boolean,
): Promise<string | null> {
  return null;
}
