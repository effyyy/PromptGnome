# Supported providers

This page tracks the current state of every AI chatbot that PromptGnome supports. Provider APIs change without warning, sometimes more than once a month. If you see a status here that does not match what you are experiencing, please file a [provider breakage issue](https://github.com/effyyy/PromptGnome/issues/new/choose) and we will investigate quickly.

## Status table

| Provider | Domain | Status | Last verified | Notes |
|---|---|---|---|---|
| ChatGPT | chatgpt.com, chat.openai.com | stable | 2026-04-07 | |
| Claude | claude.ai | stable | 2026-04-07 | |
| Gemini | gemini.google.com | stable | 2026-04-07 | The most fragile adapter. Please report any issues quickly. |
| DeepSeek | chat.deepseek.com | stable | 2026-04-07 | |
| Perplexity | www.perplexity.ai | stable | 2026-04-07 | Search-augmented queries and direct chat are both supported. |
| Grok | grok.com, x.com/i/grok | stable | 2026-04-07 | Both standalone and embedded modes. |
| Microsoft Copilot | copilot.microsoft.com | stable | 2026-04-07 | |
| Meta AI | www.meta.ai | stable | 2026-04-07 | Standalone meta.ai domain only. Embedded Meta AI inside Facebook, Instagram, or WhatsApp web is not supported in this release. |

## What the status values mean

- **stable** — detection, warnings, and (where applicable) auto-anonymize and re-hydration are all working as expected.
- **degraded** — partial functionality. Detection may still work, but one or more features (overlay, anonymization, re-hydration) is not behaving correctly. Details will appear in the Notes column with a link to the open issue.
- **broken** — the provider has changed something we depend on, and the adapter needs an update before it works again. We aim to ship fixes within a few days of confirmation. Details and tracking issue in the Notes column.
- **not yet supported** — the provider is on our radar but has not been added to the extension yet.

## Reporting an issue with a provider

The provider breakage template is the fastest way to get something fixed. It asks for the provider, the symptom, the date you first noticed, and your extension and browser version. We watch this label closely.

## Why Gemini is called out

Gemini's internal API uses an undocumented format that changes more frequently than the other providers we support. The adapter does its best to handle these changes gracefully, and we have a fallback that watches the page directly if the network-level interception breaks. Even so, Gemini is the provider most likely to break first when something changes upstream, and reports from users are how we find out fastest. Thank you in advance for the heads-up.
