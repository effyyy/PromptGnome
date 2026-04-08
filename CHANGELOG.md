# Changelog

All notable user-facing changes to PromptGnome will be documented here. This file mirrors the release notes published on the Chrome Web Store, Firefox Add-ons, and Microsoft Edge Add-ons listings.

The format is based on Keep a Changelog (https://keepachangelog.com/en/1.1.0/), and this project follows Semantic Versioning (https://semver.org/).

## [1.0.0] — 2026-04-07

Initial public release of PromptGnome.

### Added
- Local-first PII detection for messages sent to AI chatbots (ChatGPT, Claude, Gemini, DeepSeek, Perplexity, Grok, Copilot, Meta AI).
- Regex detection engine covering 20+ PII categories including emails, SSNs, credit cards (Luhn-validated), phone numbers, IP addresses, IBANs, AWS / GitHub / Stripe / generic API keys, passport and driver's license numbers, and more.
- Inline warning overlay before any message is sent to a provider — nothing leaves your browser without a confirmation.
- In-place highlighting of detected PII in the chat composer.
- Side panel with settings, statistics, and audit log.
- Onboarding flow on first install.
- Encrypted IndexedDB mapping store scaffold (AES-256-GCM, PBKDF2/SHA-256, 100,000 iterations) for upcoming Pro auto-anonymize feature.
- Bug-report button on supported provider pages.
- Manifest V3, with the minimum viable permission set: `storage`, `sidePanel`, `alarms`, `offscreen`, plus per-host permissions for the supported providers and `api.promptgnome.com` (used only for opt-in Pro features that are not yet active).

### Privacy & security
- Zero telemetry by default. The extension makes no network calls unless the user explicitly opts in.
- Detection runs entirely in-browser. Message text is never transmitted to PromptGnome or any third party.
- Console output is silent in production builds — the extension never logs to user DevTools.

### Pro tier
- Pro features (server-side NER, auto-anonymize, re-hydration, file scanning) are gated as **Coming Soon** in 1.0. All users are on the Free tier; the Pro upgrade flow is intentionally disabled until launch.

### Bug fixes
- Restored highlighting and send-time detection on `chat.deepseek.com` after a DeepSeek UI update broke the legacy `#chat-input` selector. The DeepSeek adapter now matches modern composer variants and any `/api/vN/chat/completion(s)` endpoint version.
- Eliminated several detection edge cases discovered during launch testing: invalid SSNs (bad area / group `00` / serial `0000` / 078-05-1120 / repeated-digit) following an "my SSN is" trigger now fail digit-rule validation; Luhn-invalid 16-digit strings following an "my card is" trigger now fail Luhn validation; Stripe `sk_live_` keys embedded in YAML config blocks are now reported as `STRIPE_KEY` rather than the generic `SECRET` type.

## [Unreleased]
