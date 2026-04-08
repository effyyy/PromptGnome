# Permissions

PromptGnome asks for the smallest set of browser permissions it can. This page lists every permission we request, what it lets us do, and — just as importantly — the permissions we deliberately do **not** ask for, and why that matters.

## Permissions we request

| Permission | Why we need it |
|---|---|
| `storage` | To save your settings, statistics, and (for Pro users) the encrypted PII mapping store on your own device. |
| `sidePanel` | To display the settings, audit log, and statistics interface in your browser's side panel. |
| `offscreen` | To run the on-device entity detection model in an isolated document. The model needs a DOM-like environment, and the offscreen API gives us one without exposing the model to the chatbot page. (Pro feature) |
| `alarms` | To schedule periodic cleanup of expired encryption keys and to run lightweight maintenance tasks while the browser is open. |

## Host permissions

We request access only to the specific AI chatbot domains that PromptGnome supports. We do not request access to all websites.

| Domain | Why we need it |
|---|---|
| `chatgpt.com`, `chat.openai.com` | To scan messages on ChatGPT |
| `claude.ai` | To scan messages on Claude |
| `gemini.google.com` | To scan messages on Gemini |
| `chat.deepseek.com` | To scan messages on DeepSeek |
| `www.perplexity.ai` | To scan messages on Perplexity |
| `grok.com`, `x.com/i/grok*` | To scan messages on Grok |
| `copilot.microsoft.com` | To scan messages on Microsoft Copilot |
| `www.meta.ai` | To scan messages on Meta AI |

If we add support for a new chatbot in the future, that will appear in our changelog and require a permission update that you must approve.

## Permissions we deliberately do not request

We think the things an extension chooses **not** to request are at least as important as the things it does. Here is what PromptGnome avoids, and why.

| Permission | Why we avoid it |
|---|---|
| `<all_urls>` | We only need access to the specific AI chatbot domains listed above. Requesting access to all URLs would be enormously broader than necessary and is a common red flag in privacy-sensitive extensions. |
| `tabs` | We do not enumerate, query, or manage your other browser tabs. We have no reason to know what else you have open. |
| `webRequest`, `webRequestBlocking` | We use content-script injection to intercept messages, not network-level interception. Network-level interception would give the extension visibility into traffic from sites we have no business looking at. |
| `activeTab` | We do not need ad-hoc access to whichever tab you happen to be looking at. Our supported domains are listed explicitly. |
| `cookies` | We never read or write cookies on any site. |
| `history` | We do not look at your browsing history. |
| `bookmarks` | We do not touch your bookmarks. |
| `downloads` | We do not initiate or manage downloads. |
| `clipboardRead`, `clipboardWrite` | We do not read or write your clipboard. |
| `geolocation` | We do not request your location. |
| `notifications` | We use in-page UI for warnings rather than browser notifications, so we do not need this permission. |

## Verifying our permissions

You can review the exact permissions PromptGnome has at any time:

- **Chrome / Edge**: visit `chrome://extensions`, click "Details" on PromptGnome, and look at the "Permissions" section.
- **Firefox**: visit `about:addons`, click PromptGnome, and look at the "Permissions" tab.

If the live permissions ever differ from what is listed here, please [report it](https://github.com/effyyy/PromptGnome/issues/new/choose).

## Related documents

- [Data flow](data-flow.md) — what the extension does over the network
- [Threat model](threat-model.md) — what we protect against and what we do not
- [Privacy policy](privacy-policy.md)
