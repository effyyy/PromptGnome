# Threat Model

**Version:** 1.0
**Published:** 2026-04-07

## Purpose

This document explains what PromptGnome is designed to protect against, what it is not designed to protect against, and the assumptions we make about the environment it runs in. It is intended for users, security researchers, journalists, and reviewers who want to understand the trust properties of the extension before relying on it.

We publish this document in v1.0 form because we think users deserve a clear, committed answer rather than a vague draft. We will update it as the extension evolves, and the version history at the bottom of this page will record those changes.

## System overview

PromptGnome is a browser extension that runs locally inside your browser. When you type a message into a supported AI chatbot, the extension intercepts the request before it leaves the browser, scans the message text for sensitive information, and either warns you or (in Pro mode) replaces the sensitive parts with placeholders. The detection runs entirely on your device. The original sensitive values never need to leave your browser.

For a step-by-step description of the data flow, see [data-flow.md](data-flow.md).

## Assets we protect

The things PromptGnome treats as valuable and tries to keep safe:

- **The text of your messages**, especially any personally identifying or otherwise sensitive content within them
- **The mapping between original values and placeholders** when auto-anonymize is in use
- **Your settings and configuration**
- **Your subscription entitlements**

## Trust boundaries

What we trust:

- Your browser and its extension sandbox
- Your operating system
- The Web Crypto API provided by your browser
- You, the user, to make sensible choices when warned

What we do not trust:

- AI provider servers (ChatGPT, Claude, Gemini, and the others on our supported list)
- The network path between your browser and those servers
- Other browser extensions running in the same browser
- Any web page outside our supported provider list
- Pages that imitate supported providers on look-alike domains

## Threats we protect against

**Sensitive content leaking to AI provider servers in user messages.** This is the primary thing PromptGnome is built for. Detection runs before the request leaves the browser, so a user who heeds the warning (or has auto-anonymize enabled) will never send the original sensitive value to the provider in the first place.

**Theft of the on-disk PII mapping store on a compromised device.** When auto-anonymize is in use, PromptGnome stores the mapping between original values and placeholders in the browser's local IndexedDB. This mapping is encrypted at rest using AES-256-GCM with a key derived via PBKDF2-SHA256 (100,000 iterations). The session secret used to derive the key lives only in volatile session storage and is wiped when the browser closes. Mappings expire automatically after 24 hours by default.

**Network eavesdropping of original message content.** Because detection is local, an attacker on the network path between you and the AI provider only sees what the AI provider sees — and if you have anonymized your message, that means placeholders rather than original values.

**Accidental copy-paste of credentials into chat.** API keys, access tokens, and other credentials are detected by the regex layer, which catches them even before any cloud features run.

## Threats we do not protect against

We want to be honest about our limits. PromptGnome is not designed to defend against the following.

**A separate malicious browser extension running in the same browser.** Extensions in modern browsers are sandboxed from each other, but the host page DOM and many APIs are shared. A malicious extension with sufficient permissions could observe user input directly. If you do not trust an extension, do not install it.

**OS-level keyloggers or memory inspection by privileged processes.** If your device is compromised at the operating system level, PromptGnome cannot help you. The encryption of the mapping store protects against later theft of the disk, not against an attacker who is already running on your machine.

**The AI provider itself storing or training on data you explicitly chose to send.** PromptGnome warns you and gives you tools to anonymize, but if you click "send anyway", the provider will receive what you sent. PromptGnome cannot reach into the provider's servers and delete it.

**Phishing pages that imitate supported providers on look-alike domains.** PromptGnome only injects on the exact domains listed in our supported providers document. A phishing site at a similar-looking domain will not be protected.

**Side-channel attacks against your hardware.** Speculative execution attacks, electromagnetic analysis, and similar low-level side channels are outside our threat model.

**Supply chain attacks against the published extension binary.** We rely on the major extension stores (Chrome Web Store, Firefox Add-ons, Microsoft Edge Add-ons) to deliver the binary you install. If those stores are compromised, the published binary could be too. We mitigate this by keeping our build reproducible and our publishing process small and well-documented.

## Trust assumptions

For PromptGnome to provide the protections above, the following must hold:

- The Web Crypto API in your browser is implemented correctly.
- Your browser's extension isolation works as documented.
- The extension binary you installed from the store is the same one we built and published.
- You read warnings before clicking through them.
- You do not install untrusted extensions alongside PromptGnome.

## Cryptographic design summary

- **Algorithm for the mapping store:** AES-256-GCM
- **Key derivation:** PBKDF2 with SHA-256 and 100,000 iterations
- **Salt:** 16 bytes from `crypto.getRandomValues()`, generated per session
- **IV:** 12 bytes from `crypto.getRandomValues()`, generated per encryption operation
- **Storage:** encrypted blobs in IndexedDB
- **Session secret:** stored only in `chrome.storage.session`, which the browser clears when closed
- **No third-party crypto libraries:** all cryptographic operations use the Web Crypto API directly

## Network call inventory

PromptGnome makes a small, fixed set of network calls. The full list is in [data-flow.md](data-flow.md). In summary: a license check, an optional one-time NER model download, an optional cloud NER endpoint that runs only with explicit consent, and an optional feedback endpoint that runs only with explicit consent. There is no analytics, telemetry, crash reporting, or A/B testing.

## Reporting an issue with this threat model

If you think we have got something wrong or left something out, please open an issue or contact us at **contact@promptgnome.com**. Threat models improve through scrutiny.

## Version history

- **v1.0 — 2026-04-07** — Initial publication.
