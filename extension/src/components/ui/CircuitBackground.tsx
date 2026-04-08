/**
 * Animated circuit board background with 4 surface variants.
 * Renders static PCB traces with animated scan pulses using CSS-only animations.
 * Must be positioned absolutely inside a relative container.
 * UI content should be a sibling (relative z-10), not a child.
 * Architecture layer: UI (decorative background)
 */

/** Supported surface variants for the circuit background. */
type CircuitVariant = "popup" | "sidepanel" | "overlay" | "onboarding"

/** Props for the CircuitBackground component. */
interface CircuitBackgroundProps {
  /** Which surface variant to render. Determines SVG layout dimensions. */
  variant: CircuitVariant
}

/**
 * Renders ambient glow spots behind the circuit traces.
 * @returns Multiple absolutely-positioned glow divs.
 */
function GlowSpots() {
  return (
    <>
      <div
        className="absolute rounded-full animate-glow-drift"
        style={{
          width: 180,
          height: 180,
          top: -40,
          left: -40,
          background: "radial-gradient(circle, rgba(0,229,160,0.04) 0%, transparent 70%)",
          filter: "blur(30px)",
        }}
      />
      <div
        className="absolute rounded-full"
        style={{
          width: 140,
          height: 140,
          bottom: 20,
          right: -20,
          background: "radial-gradient(circle, rgba(0,229,160,0.03) 0%, transparent 70%)",
          filter: "blur(25px)",
        }}
      />
    </>
  )
}

/**
 * SVG circuit traces for the popup variant (280×460 viewBox).
 * Static horizontal/vertical traces with animated scan pulses and junction nodes.
 * @returns SVG element with popup circuit layout.
 */
function PopupSvg() {
  return (
    <svg
      className="absolute inset-0 w-full h-full"
      viewBox="0 0 280 460"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      {/* Static circuit traces */}
      <g stroke="rgba(0,229,160,0.06)" strokeWidth="1" fill="none">
        <path d="M0 80 H120 V40 H200 V80 H280" />
        <path d="M0 160 H60 V200 H180 V160 H280" />
        <path d="M0 280 H100 V320 H220 V280 H280" />
        <path d="M0 380 H80 V360 H200 V400 H280" />
        <path d="M60 0 V100 M120 0 V60 M200 0 V100 M240 0 V60" />
        <path d="M40 460 V360 M160 460 V400 M240 460 V380" />
      </g>

      {/* Animated scan pulse — primary */}
      <path
        d="M0 80 H120 V40 H200 V80 H280 V160 H180 V200 H60 V160 H0 V280 H100 V320 H220 V280 H280"
        stroke="rgba(0,229,160,0.18)"
        strokeWidth="1.5"
        fill="none"
        strokeDasharray="60 840"
        strokeDashoffset="0"
        className="animate-scan-slow"
        style={{ willChange: "stroke-dashoffset" }}
      />

      {/* Animated scan pulse — secondary */}
      <path
        d="M280 380 H200 V360 H80 V400 H0 V280 H100 V320 H220 V280 H280"
        stroke="rgba(0,229,160,0.12)"
        strokeWidth="1"
        fill="none"
        strokeDasharray="40 600"
        strokeDashoffset="-300"
        className="animate-scan-med-rev"
        style={{ willChange: "stroke-dashoffset" }}
      />

      {/* Junction nodes */}
      <g fill="rgba(0,229,160,0.2)" className="animate-node-breathe">
        <circle cx="120" cy="80" r="2.5" />
        <circle cx="200" cy="80" r="2.5" />
        <circle cx="60" cy="160" r="2" />
        <circle cx="180" cy="160" r="2" />
        <circle cx="100" cy="280" r="2.5" />
        <circle cx="220" cy="280" r="2" />
        <circle cx="80" cy="380" r="2" />
        <circle cx="200" cy="380" r="2" />
      </g>
    </svg>
  )
}

/**
 * SVG circuit traces for the sidepanel variant (800×600 viewBox).
 * Wider layout with more complex trace routing.
 * @returns SVG element with sidepanel circuit layout.
 */
function SidepanelSvg() {
  return (
    <svg
      className="absolute inset-0 w-full h-full"
      viewBox="0 0 800 600"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      {/* Static traces */}
      <g stroke="rgba(0,229,160,0.05)" strokeWidth="1" fill="none">
        <path d="M0 100 H200 V60 H400 V100 H600 V140 H800" />
        <path d="M0 240 H150 V280 H350 V240 H550 V200 H800" />
        <path d="M0 380 H250 V340 H500 V380 H700 V420 H800" />
        <path d="M0 500 H180 V460 H420 V500 H650 V540 H800" />
        <path d="M100 0 V120 M300 0 V80 M500 0 V120 M700 0 V80" />
        <path d="M150 600 V480 M400 600 V520 M650 600 V460" />
      </g>

      {/* Scan pulse */}
      <path
        d="M0 100 H200 V60 H400 V100 H600 V140 H800 V240 H550 V200 H350 V280 H150 V240 H0 V380 H250 V340 H500 V380 H700 V420 H800"
        stroke="rgba(0,229,160,0.15)"
        strokeWidth="1.5"
        fill="none"
        strokeDasharray="80 1400"
        className="animate-loop-slow"
        style={{ willChange: "stroke-dashoffset" }}
      />

      {/* Junction nodes */}
      <g fill="rgba(0,229,160,0.18)" className="animate-node-breathe">
        <circle cx="200" cy="100" r="3" />
        <circle cx="400" cy="100" r="3" />
        <circle cx="600" cy="140" r="2.5" />
        <circle cx="150" cy="280" r="2.5" />
        <circle cx="350" cy="240" r="2.5" />
        <circle cx="250" cy="380" r="3" />
        <circle cx="500" cy="340" r="2.5" />
        <circle cx="700" cy="420" r="2" />
      </g>
    </svg>
  )
}

/**
 * SVG hex grid and shield rings for the overlay variant (460×320 viewBox).
 * Different aesthetic from circuit traces — uses hexagonal pattern.
 * @returns SVG element with overlay hex layout.
 */
function OverlaySvg() {
  return (
    <svg
      className="absolute inset-0 w-full h-full opacity-30"
      viewBox="0 0 460 320"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <pattern id="hex-circuit" width="28" height="48.5" patternUnits="userSpaceOnUse" patternTransform="scale(1.8)">
          <polygon
            points="14,2 25.12,9.25 25.12,23.75 14,31 2.88,23.75 2.88,9.25"
            fill="none"
            stroke="rgba(0,229,160,0.04)"
            strokeWidth="0.5"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#hex-circuit)" />

      {/* Corner accent traces */}
      <g stroke="rgba(0,229,160,0.08)" strokeWidth="1" fill="none">
        <path d="M0 0 H60 V40" />
        <path d="M460 0 H400 V40" />
        <path d="M0 320 H60 V280" />
        <path d="M460 320 H400 V280" />
      </g>

      {/* Scan accent */}
      <path
        d="M0 80 H100 V120 H360 V80 H460"
        stroke="rgba(0,229,160,0.12)"
        strokeWidth="1"
        fill="none"
        strokeDasharray="30 500"
        className="animate-scan-fast"
        style={{ willChange: "stroke-dashoffset" }}
      />

      {/* Junction nodes */}
      <g fill="rgba(0,229,160,0.2)" className="animate-node-breathe">
        <circle cx="100" cy="80" r="2" />
        <circle cx="360" cy="80" r="2" />
        <circle cx="100" cy="120" r="2" />
        <circle cx="360" cy="120" r="2" />
      </g>
    </svg>
  )
}

/**
 * SVG circuit traces for the onboarding variant (448×500 viewBox).
 * Taller layout matching the onboarding card dimensions.
 * @returns SVG element with onboarding circuit layout.
 */
function OnboardingSvg() {
  return (
    <svg
      className="absolute inset-0 w-full h-full"
      viewBox="0 0 448 500"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      {/* Static traces */}
      <g stroke="rgba(0,229,160,0.06)" strokeWidth="1" fill="none">
        <path d="M0 80 H100 V40 H300 V80 H448" />
        <path d="M0 200 H80 V240 H220 V200 H380 V160 H448" />
        <path d="M0 340 H120 V300 H280 V340 H448" />
        <path d="M0 440 H100 V460 H300 V440 H448" />
        <path d="M80 0 V100 M200 0 V60 M360 0 V100" />
        <path d="M100 500 V420 M280 500 V460" />
      </g>

      {/* Scan pulse */}
      <path
        d="M0 80 H100 V40 H300 V80 H448 V200 H380 V160 H220 V240 H80 V200 H0 V340 H120 V300 H280 V340 H448"
        stroke="rgba(0,229,160,0.16)"
        strokeWidth="1.5"
        fill="none"
        strokeDasharray="60 900"
        className="animate-scan-med"
        style={{ willChange: "stroke-dashoffset" }}
      />

      {/* Junction nodes */}
      <g fill="rgba(0,229,160,0.2)" className="animate-node-breathe">
        <circle cx="100" cy="80" r="2.5" />
        <circle cx="300" cy="80" r="2.5" />
        <circle cx="80" cy="200" r="2" />
        <circle cx="220" cy="200" r="2" />
        <circle cx="380" cy="160" r="2" />
        <circle cx="120" cy="340" r="2.5" />
        <circle cx="280" cy="300" r="2" />
      </g>
    </svg>
  )
}

/**
 * Animated circuit board background for all 4 extension UI surfaces.
 * @param props - CircuitBackground props.
 * @returns Absolute-positioned decorative background.
 */
export function CircuitBackground({ variant }: CircuitBackgroundProps) {
  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
      {/* Dot grid */}
      <div
        className="absolute inset-0"
        style={{
          background: "radial-gradient(circle, rgba(0,229,160,0.03) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />

      {/* Ambient glow spots */}
      <GlowSpots />

      {/* Circuit SVG — variant-specific */}
      {variant === "popup" && <PopupSvg />}
      {variant === "sidepanel" && <SidepanelSvg />}
      {variant === "overlay" && <OverlaySvg />}
      {variant === "onboarding" && <OnboardingSvg />}

      {/* Radial fade mask — centers content visually */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(2,4,8,0.8) 20%, rgba(2,4,8,0.4) 55%, rgba(2,4,8,0.1) 100%)",
        }}
      />
    </div>
  )
}
