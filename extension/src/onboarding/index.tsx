/**
 * First-run onboarding overlay.
 * 3-step flow that introduces the extension and lets users configure preferences.
 * Triggers when onboarding_complete flag is false in chrome.storage.local.
 * Architecture layer: UI (onboarding)
 */

import type { PlasmoCSConfig, PlasmoGetStyle } from "plasmo"

import cssText from "data-text:../content-style.css"
import { useCallback, useEffect, useState } from "react"

import CategoryToggles from "~src/components/CategoryToggles"
import OnboardingStep from "~src/components/OnboardingStep"
import PIIDemo from "~src/components/PIIDemo"
import { fillProviderDraft } from "~src/utils/provider-input"
import { useSettings, type Settings } from "~src/hooks/useSettings"
import { CONFIG_KEYS, PROVIDER_NAMES } from "~src/shared/constants"
import { CircuitBackground } from "~src/components/ui/CircuitBackground"
import { ShieldActivation } from "~src/components/ui/ShieldActivation"
import { ShieldIcon } from "~src/components/ui/ShieldIcon"
import { GlassCard } from "~src/components/ui/GlassCard"
import { PRO_BUILD } from "~src/shared/build-flags"
import TelemetryConsent from "~src/onboarding/TelemetryConsent-port"
import { trackSessionStart } from "~src/services/analytics-port"

export const config: PlasmoCSConfig = {
  matches: [
    "https://chatgpt.com/*",
    "https://chat.openai.com/*",
    "https://claude.ai/*",
    "https://gemini.google.com/*"
  ]
}

/**
 * Injects compiled CSS into Plasmo's shadow DOM so it never leaks into
 * the host page. This prevents the extension from breaking the chat UI.
 */
export const getStyle: PlasmoGetStyle = () => {
  const style = document.createElement("style")
  style.textContent = cssText
  return style
}

const DEMO_TRY_IT_NOW_TEXT =
  "Hi, my email is jane@example.com and my SSN is 123-45-6789. Please summarize what I should remove before sending this."

function getCurrentProvider(): { id: string | null; label: string } {
  const hostname = window.location.hostname

  if (hostname === "chatgpt.com" || hostname === "chat.openai.com") {
    return { id: PROVIDER_NAMES.CHATGPT, label: "ChatGPT" }
  }

  if (hostname === "claude.ai") {
    return { id: PROVIDER_NAMES.CLAUDE, label: "Claude" }
  }

  if (hostname === "gemini.google.com") {
    return { id: PROVIDER_NAMES.GEMINI, label: "Gemini" }
  }

  return { id: null, label: "this site" }
}

/**
 * Main onboarding component. Shows a 4-step intro on first install.
 */
function Onboarding() {
  const [visible, setVisible] = useState(false)
  const [step, setStep] = useState(1)
  const { settings, updateSettings } = useSettings()
  const currentProvider = getCurrentProvider()

  useEffect(() => {
    try {
      chrome.storage.local.get(CONFIG_KEYS.ONBOARDING_COMPLETE, (result) => {
        if (chrome.runtime.lastError) return
        if (!result[CONFIG_KEYS.ONBOARDING_COMPLETE]) {
          setVisible(true)
        }
      })
    } catch {
      // Not in extension context
    }
  }, [])

  useEffect(() => {
    if (PRO_BUILD) {
      void trackSessionStart("onboarding");
    }
  }, [])

  const completeOnboarding = useCallback(() => {
    setVisible(false)
    try {
      chrome.storage.local.set({ [CONFIG_KEYS.ONBOARDING_COMPLETE]: true })
    } catch {
      // non-critical
    }
  }, [])

  const handleTryItNow = useCallback(() => {
    if (currentProvider.id) {
      fillProviderDraft(currentProvider.id, DEMO_TRY_IT_NOW_TEXT)
    }
    // In Pro build, advance to step 4 (telemetry consent). In Free build,
    // complete onboarding immediately — there is no telemetry consent step.
    if (PRO_BUILD) {
      setStep(4)
    } else {
      void completeOnboarding()
    }
  }, [currentProvider.id, completeOnboarding])

  const handleToggleCategory = useCallback(
    (types: readonly string[], enabled: boolean) => {
      const updated: Record<string, boolean> = { ...settings.enabledTypes }
      for (const type of types) {
        updated[type] = enabled
      }
      updateSettings({ enabledTypes: updated as Settings["enabledTypes"] })
    },
    [settings.enabledTypes, updateSettings]
  )

  if (!visible) return null

  return (
    <div className="pii-shield-root fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/60">
      <div className="relative max-w-md w-full mx-4">
        <CircuitBackground variant="onboarding" />
        <div className="relative z-10 bg-void rounded-2xl border border-cyber-soft shadow-cyber-xl p-6">
          {step === 1 && (
            <OnboardingStep
              step={1}
              totalSteps={4}
              title="PromptGnome is active"
              description={`Protection is active on ${currentProvider.label}. We detect sensitive information in your messages before they are sent.`}
              onNext={() => setStep(2)}
            >
              <ShieldActivation>
                <div className="py-4 flex justify-center">
                  <ShieldIcon size={56} animate />
                </div>
              </ShieldActivation>
              <div className="mt-4">
                <PIIDemo />
              </div>
            </OnboardingStep>
          )}

          {step === 2 && (
            <OnboardingStep
              step={2}
              totalSteps={4}
              title="What we detect"
              description="Choose which categories of sensitive information to monitor. You can change these anytime in settings."
              onNext={() => setStep(3)}
              onBack={() => setStep(1)}
            >
              <CategoryToggles
                enabledTypes={settings.enabledTypes}
                onToggleCategory={handleToggleCategory}
              />
            </OnboardingStep>
          )}

          {step === 3 && (
            <OnboardingStep
              step={3}
              totalSteps={4}
              title="You're protected"
              description={`We'll prefill a synthetic example in ${currentProvider.label} so you can see the warning flow immediately. Everything runs locally.`}
              onNext={handleTryItNow}
              onBack={() => setStep(2)}
              nextLabel="Try It Now"
            >
              <div className="space-y-3">
                <GlassCard className="flex items-center gap-3 py-3">
                  <div className="w-8 h-8 bg-[var(--success-soft)] border border-[var(--success)]/20 rounded-lg flex items-center justify-center font-bold font-mono text-[var(--success)] text-sm shrink-0">
                    L
                  </div>
                  <div>
                    <div className="text-sm font-sans font-medium text-[var(--text-primary)]">100% Local</div>
                    <div className="text-xs font-sans text-[var(--text-muted)]">No data ever leaves your browser</div>
                  </div>
                </GlassCard>
                <GlassCard className="flex items-center gap-3 py-3">
                  <div className="w-8 h-8 bg-cyber/[0.08] border border-cyber/20 rounded-lg flex items-center justify-center font-bold font-mono text-cyber text-sm shrink-0">
                    Z
                  </div>
                  <div>
                    <div className="text-sm font-sans font-medium text-[var(--text-primary)]">Zero Latency</div>
                    <div className="text-xs font-sans text-[var(--text-muted)]">Clean messages send instantly</div>
                  </div>
                </GlassCard>
                <GlassCard className="flex items-center gap-3 py-3">
                  <div className="w-8 h-8 bg-[var(--pro-accent)]/[0.08] border border-[var(--pro-accent)]/20 rounded-lg flex items-center justify-center font-bold font-mono text-[var(--pro-accent)] text-sm shrink-0">
                    O
                  </div>
                  <div>
                    <div className="text-sm font-sans font-medium text-[var(--text-primary)]">Free to Use</div>
                    <div className="text-xs font-sans text-[var(--text-muted)]">All features, no cost</div>
                  </div>
                </GlassCard>
                <div className="rounded-lg border border-cyber-soft bg-cyber/[0.02] px-3 py-2 text-xs font-sans text-[var(--text-secondary)]">
                  We use synthetic sample data only. Nothing is sent until you choose to test it.
                </div>
              </div>
            </OnboardingStep>
          )}

          {PRO_BUILD && step === 4 && (
            <OnboardingStep
              step={4}
              totalSteps={4}
              title="One more thing"
              description=""
              onNext={completeOnboarding}
              onBack={() => setStep(3)}
            >
              <TelemetryConsent onDecision={() => completeOnboarding()} />
            </OnboardingStep>
          )}
        </div>
      </div>
    </div>
  )
}

export default Onboarding
