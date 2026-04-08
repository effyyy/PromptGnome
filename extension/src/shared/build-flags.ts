/**
 * Build-time flags. The single seam between the public free-tier
 * extension and the private Pro extension. The public PromptGnome
 * repo ships this file with PRO_BUILD = false; privito ships it
 * with PRO_BUILD = true.
 *
 * Do not branch on PRO_BUILD anywhere in src/detection, src/providers,
 * src/anonymization, src/rehydration, or src/highlighting (excluding
 * feedback-queue.ts which is Pro). Branching is only permitted in
 * UI entry points (popup, sidepanel, onboarding) and in the
 * background message router.
 */
export const PRO_BUILD = false as const;
