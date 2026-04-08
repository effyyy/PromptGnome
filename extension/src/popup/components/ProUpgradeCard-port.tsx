/**
 * Null-object port for the ProUpgradeCard component.
 *
 * Provides a noop React component so Free-tier files can import the symbol
 * without requiring the Pro implementation. The component is never rendered
 * in the Free build because all call sites are gated behind PRO_BUILD.
 *
 * Architecture layer: UI / Port component (Free)
 */

/** Props for the ProUpgradeCard component. */
interface ProUpgradeCardProps {
  /** Whether the card is visible (controls mount/animation). */
  visible: boolean;
  /** Reserved for compatibility with the previous checkout-based API. */
  onUpgradeComplete?: () => void;
  /** Reserved for compatibility with the previous checkout-based API. */
  nerEndpoint?: string;
}

/**
 * Noop Pro upgrade card component.
 * Renders nothing in the Free build.
 *
 * @returns null
 */
function ProUpgradeCard(_props: ProUpgradeCardProps): null {
  return null;
}

export default ProUpgradeCard;
