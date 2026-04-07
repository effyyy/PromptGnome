# Frequently asked questions

## Does PromptGnome send my messages anywhere?

No, not by default. The detection that powers our warnings runs locally inside your browser. The full list of network calls the extension makes is in the [data flow](data-flow.md) document. The two cases where any message-related data leaves your device — cloud-based detection and feedback sharing — are both off by default and require you to explicitly turn them on.

## What is the difference between the free and Pro versions?

The free version detects structured information like email addresses, credit card numbers, phone numbers, API keys, and other things that can be matched with patterns. It warns you before you send anything sensitive.

The Pro version adds:

- An on-device machine learning model that detects unstructured information like personal names, organizations, locations, and medical terms
- Automatic anonymization, which replaces sensitive parts with placeholders before sending and puts the originals back when the response renders
- An audit log of detection events stored locally on your device
- File scanning for documents you upload to chatbots that support uploads

## Which chatbots are supported?

ChatGPT, Claude, Gemini, DeepSeek, Perplexity, Grok, Microsoft Copilot, and Meta AI. The current status of each is tracked in [supported providers](supported-providers.md).

## How accurate is the detection?

We are working on this and will publish detailed accuracy benchmarks (precision, recall, and F1 per type and per provider) before our first public release. We have intentionally held off on publishing numbers until they are reproducible across releases. See our [public TODO](TODO.md) for the current status.

## What happens to my data if I uninstall the extension?

Uninstalling the extension removes all data it stored on your device, including settings, statistics, audit log entries, and the encrypted PII mapping store. There is nothing left on any server because nothing was ever sent to one.

## Does PromptGnome work in incognito or private browsing mode?

Only if you explicitly enable it for incognito mode in your browser's extension settings. Browsers default to disallowing extensions in private windows, and we do not override that.

## Does PromptGnome work on mobile browsers?

Not yet. PromptGnome is currently a desktop browser extension only. Mobile support depends on which mobile browsers add MV3 extension support, and we are watching that space.

## How do I report a bug or a missed detection?

Open an issue using one of our [issue templates](https://github.com/effyyy/PromptGnome/issues/new/choose). For false positives and false negatives, please use synthetic data only — never include real personal information.

## Is the source code open?

Not yet. PromptGnome's source is currently kept in a private repository. This is a practical choice rather than a permanent one — open-sourcing parts of the project is something we are seriously considering, and community feedback will play a real role in that decision. See the note in [CONTRIBUTING.md](../CONTRIBUTING.md) for more.

## How do I cancel my Pro subscription?

Subscriptions are managed through ExtensionPay, our payment provider. You can cancel from your ExtensionPay account dashboard at any time. Cancellation takes effect at the end of your current billing period. If you have any trouble, email **contact@promptgnome.com** and we will help.

## Can I use PromptGnome at work?

Yes, with two things to keep in mind. First, check whether your employer has a policy about browser extensions on work devices. Second, if your organization needs a self-hosted or enterprise version with central policy management, please get in touch — that is something we can discuss.

## I have a question that is not answered here.

Please open an issue with the question template, or email **contact@promptgnome.com**. Common questions get added to this page over time.
