# Privacy Policy

**Effective date:** 2026-04-07

## Summary in plain English

PromptGnome is designed so that your messages stay on your computer. The detection that powers our warnings runs locally inside your browser. We do not collect, transmit, or sell your messages, your browsing history, or any identifying information about you. The only times anything related to your use of the extension leaves your device are explicitly listed below, and the cases that involve message content require you to opt in first.

## What the extension processes

When you type a message into a supported AI chatbot, PromptGnome scans the text locally for sensitive information such as email addresses, credit card numbers, phone numbers, and (for Pro users) personal names and other entities detected by an on-device machine learning model.

This scanning happens entirely inside your browser. The text of your message is not sent anywhere as part of the detection process unless you have explicitly enabled an optional cloud feature in settings (see "Network calls" below).

## What the extension stores on your device

- **Settings:** your preferences (which detections to enable, threshold levels, theme) are stored using your browser's standard extension storage. If you have browser sync enabled, these settings may sync across your devices via your browser vendor.
- **Encrypted PII mappings (Pro):** when you use the auto-anonymize feature, the mapping between original values and placeholders is stored in your browser's local IndexedDB, encrypted with AES-256-GCM. The encryption key is derived from a session secret that lives only in volatile session storage and is cleared when the browser closes. These mappings automatically expire after 24 hours by default (configurable in settings).
- **Statistics counters:** aggregate counts of how many detections you have triggered, broken down by type. These are numbers only — never the matched text itself.
- **Audit log (Pro):** a privacy-safe record of detection events, stored locally. Entries contain the type of detection, timestamp, and provider, but never the matched text.

## What the extension never collects

- The contents of your messages
- Your browsing history
- Identifying information about you (name, email, IP address)
- Cookies, session tokens, or authentication data from any website
- Any data from websites that are not explicitly listed in our supported providers list

## Network calls

PromptGnome makes a small, fixed set of network calls. Each one is listed below.

| Endpoint | When | What is sent | Contains your messages? | Opt-in? |
|---|---|---|---|---|
| ExtensionPay license check | On extension start and periodically | License token | No | No (required for paid features) |
| Hugging Face CDN | First time you enable Pro NER | Standard download request for the model file | No | Yes (Pro feature) |
| api.promptgnome.com (NER analysis) | Only if you have enabled cloud NER in settings | Your message text | Yes | Yes, explicit opt-in |
| api.promptgnome.com/v1/detection-feedback | Only if you have enabled feedback sharing | The detection feedback you submit | Possibly | Yes, explicit opt-in |

Outside of these four endpoints, the extension makes no network calls. There is no analytics, no telemetry, no crash reporting, and no A/B testing.

## Cookies and tracking

PromptGnome does not set any cookies. It does not track you across websites or sessions. It does not include any third-party trackers or advertising libraries.

## Data retention

- Settings persist until you change them or uninstall the extension.
- Encrypted PII mappings expire after 24 hours by default and are deleted from local storage.
- Statistics counters persist until you reset them in the side panel or uninstall the extension.
- If you uninstall the extension, all locally stored data is removed by your browser.

## Your rights

You can:

- Inspect and modify all your settings at any time from the side panel.
- Reset your statistics from the side panel.
- Clear all locally stored data by uninstalling the extension.
- Withdraw consent for any optional cloud feature at any time by toggling it off in settings. After withdrawal, no further data of that type will be sent.
- Contact us at **contact@promptgnome.com** with any questions about your data.

## Children

PromptGnome is not directed at children under 13. We do not knowingly collect any information from children under 13.

## Changes to this policy

If we make material changes to this policy, we will update the effective date at the top of this page and announce the change in our changelog. Continued use of the extension after a change indicates acceptance of the updated policy.

## Contact

Questions, concerns, or requests related to this policy can be sent to **contact@promptgnome.com**.
