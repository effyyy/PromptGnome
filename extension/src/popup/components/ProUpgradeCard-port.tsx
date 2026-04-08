/**
 * Inline "Coming Soon" card shown when free users select Maximum detection
 * mode. PromptGnome Pro is not yet available — this card surfaces the
 * upcoming Pro feature set and links users to the embedded Google Form on
 * the marketing site (opened in a new tab) where they can join the launch
 * waitlist.
 *
 * Architecture layer: UI (popup component, waitlist CTA — Free-safe)
 */

import { WAITLIST_URL } from "~src/shared/constants"

/** Props for the ProUpgradeCard component. */
interface ProUpgradeCardProps {
  /** Whether the card is visible (controls mount/animation). */
  visible: boolean
  /** Reserved for compatibility with the previous checkout-based API. */
  onUpgradeComplete?: () => void
  /** Reserved for compatibility with the previous checkout-based API. */
  nerEndpoint?: string
}

/**
 * Beautiful inline PRO "Coming Soon" card.
 * Shows 6 PRO features in a 2-column grid and a waitlist CTA that opens
 * the embedded Google Form on promptgnome.com in a new tab.
 *
 * @param props - Component props.
 * @returns React element, or null when `visible` is false.
 */
function ProUpgradeCard({ visible }: ProUpgradeCardProps) {
  if (!visible) return null

  return (
    <div className="mt-3 rounded-xl border border-amber/20 bg-gradient-to-br from-amber-soft to-cyber-soft p-3.5 relative overflow-hidden animate-modal-enter">
      {/* Ambient glow spots */}
      <div className="absolute -top-10 -right-10 w-28 h-28 bg-[radial-gradient(circle,rgba(255,179,71,0.08)_0%,transparent_70%)] pointer-events-none" />
      <div className="absolute -bottom-8 -left-8 w-24 h-24 bg-[radial-gradient(circle,rgba(0,229,160,0.05)_0%,transparent_70%)] pointer-events-none" />

      {/* Header */}
      <div className="flex items-center gap-2 mb-2.5 relative z-10">
        <span className="text-[9px] font-mono font-bold tracking-[1.5px] uppercase text-amber bg-amber-glow px-2 py-0.5 rounded-md border border-amber/15 shadow-[0_0_8px_rgba(255,179,71,0.08)]">
          PRO
        </span>
        <span className="text-[9px] font-mono font-bold tracking-[1.5px] uppercase text-amber bg-amber-glow px-2 py-0.5 rounded-md border border-amber/15">
          Coming Soon
        </span>
        <span className="text-[13px] font-sans font-bold text-[#e8edf5]">
          Maximum Accuracy
        </span>
      </div>

      {/* Feature grid — 2 columns, 6 features */}
      <div className="grid grid-cols-2 gap-x-2.5 gap-y-1.5 mb-3 relative z-10">
        <div className="flex items-start gap-1.5">
          <svg className="w-3.5 h-3.5 shrink-0 mt-0.5 text-cyber" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M8 1L2 4v4c0 3.3 2.6 6.4 6 7 3.4-.6 6-3.7 6-7V4L8 1z" />
            <path d="M5.5 8l2 2 3.5-4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-[10px] font-sans text-[#8a94a8] leading-tight">
            <strong className="text-[#c8d0e0] font-medium">3-engine ensemble</strong> with consensus voting
          </span>
        </div>
        <div className="flex items-start gap-1.5">
          <svg className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="8" cy="5" r="3" />
            <path d="M2 14c0-3.3 2.7-5 6-5s6 1.7 6 5" />
          </svg>
          <span className="text-[10px] font-sans text-[#8a94a8] leading-tight">
            <strong className="text-[#c8d0e0] font-medium">Name detection</strong> via neural NER
          </span>
        </div>
        <div className="flex items-start gap-1.5">
          <svg className="w-3.5 h-3.5 shrink-0 mt-0.5 text-cyber" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="2" y="3" width="12" height="10" rx="1.5" />
            <path d="M5 7h6M5 10h4" />
          </svg>
          <span className="text-[10px] font-sans text-[#8a94a8] leading-tight">
            <strong className="text-[#c8d0e0] font-medium">Document & OCR</strong> scanning
          </span>
        </div>
        <div className="flex items-start gap-1.5">
          <svg className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.5 3.5l1.4 1.4M11.1 11.1l1.4 1.4M3.5 12.5l1.4-1.4M11.1 4.9l1.4-1.4" />
            <circle cx="8" cy="8" r="3" />
          </svg>
          <span className="text-[10px] font-sans text-[#8a94a8] leading-tight">
            <strong className="text-[#c8d0e0] font-medium">Auto-anonymize</strong> with synthetic values
          </span>
        </div>
        <div className="flex items-start gap-1.5">
          <svg className="w-3.5 h-3.5 shrink-0 mt-0.5 text-cyber" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M4 8h8M8 4v8" />
            <circle cx="8" cy="8" r="6" />
          </svg>
          <span className="text-[10px] font-sans text-[#8a94a8] leading-tight">
            <strong className="text-[#c8d0e0] font-medium">Medical & org</strong> entity detection
          </span>
        </div>
        <div className="flex items-start gap-1.5">
          <svg className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M2 4l6-2 6 2v4c0 3.5-3 6.5-6 7-3-.5-6-3.5-6-7V4z" />
            <path d="M8 6v3M8 11h0" strokeLinecap="round" />
          </svg>
          <span className="text-[10px] font-sans text-[#8a94a8] leading-tight">
            <strong className="text-[#c8d0e0] font-medium">Re-hydration</strong> of anonymized responses
          </span>
        </div>
      </div>

      {/* CTA — opens the embedded Google Form on the marketing site in a new tab */}
      <a
        href={WAITLIST_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="w-full py-2 rounded-lg border border-amber/25 bg-gradient-to-r from-amber-glow to-amber-soft text-amber font-sans text-xs font-semibold flex items-center justify-center gap-1.5 transition-all hover:shadow-[0_0_20px_rgba(255,179,71,0.12)] hover:border-amber/35 hover:from-amber/20 hover:to-amber/10 relative z-10"
      >
        Join the Pro Waitlist
      </a>
      <p className="w-full mt-1.5 text-center text-[10px] font-sans text-[#5a6478] relative z-10">
        Pro is in active development — we'll email you the moment it's available.
      </p>
    </div>
  )
}

export default ProUpgradeCard
