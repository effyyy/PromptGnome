# PromptGnome

**Local-first PII detection for AI chatbots.** Detects sensitive information in messages you send to ChatGPT, Claude, Gemini, DeepSeek, Perplexity, Grok, Copilot, and Meta AI — before they leave your browser.

PromptGnome is a browser extension (Manifest V3) for Chrome, Firefox, and Edge. Every detection happens on your device. The free tier in this repository makes **zero network calls** to PromptGnome-controlled servers — you can verify by reading [`extension/src/`](./extension/src/) or running `gitleaks detect` against this repository.

## Privacy promise

The free tier:
- Runs entirely on-device. No telemetry, no analytics, no cloud lookups.
- Never transmits the text of your messages anywhere except the AI provider you were already going to send them to.
- Includes regex detection plus optional local NER (using a Hugging-Face-hosted ONNX model loaded into an offscreen document).
- Supports auto-anonymization with re-hydration of placeholders in AI responses.

## Supported providers

- ChatGPT (chatgpt.com, chat.openai.com)
- Claude (claude.ai)
- Gemini (gemini.google.com)
- DeepSeek (chat.deepseek.com)
- Perplexity (perplexity.ai)
- Grok (grok.com, x.com/i/grok)
- Microsoft Copilot (copilot.microsoft.com)
- Meta AI (meta.ai)

## Install

> **Status:** v0.1.0 is the first public release. Store listings will be linked here once approved.

- Chrome Web Store: _coming soon_
- Firefox Add-ons: _coming soon_
- Edge Add-ons: _coming soon_

## Build it yourself

```bash
cd extension
pnpm install --frozen-lockfile
pnpm build
```

Then in Chrome: `chrome://extensions` → Developer mode → **Load unpacked** → select `extension/build/chrome-mv3-prod`.

For Firefox or Edge:
```bash
pnpm build:firefox
pnpm build:edge
```

## Verify the published extension matches this source

Every store-published release is built by GitHub Actions from a tagged commit in this repository. To verify a release:
1. Check out the tag: `git checkout v<version>`
2. Build: `cd extension && pnpm install --frozen-lockfile && pnpm build`
3. Compare the SHA256 of `extension/build/chrome-mv3-prod/manifest.json` against the same file from the GitHub Release artifact.

The release workflow attaches a `SHA256SUMS` file to every Release.

## License

- **Repository root:** [PolyForm Noncommercial 1.0.0](./LICENSE) — free for personal, research, educational, and noncommercial use.
- **Detection engine** (`extension/src/detection/`): [MIT License](./extension/src/detection/LICENSE) — broader permission so the regex engine can be reused freely.

For commercial licensing, contact **contact@promptgnome.com**.

## Pro tier

A Pro tier with backend-assisted NER, file and image scanning, and team features is in development. The Pro source code is **not** in this repository — it lives in a private repository because it depends on backend services that are not part of the open-source promise.

Join the waitlist at <https://promptgnome.com/waitlist>.

## Reporting security issues

Please report security vulnerabilities privately. See [`SECURITY.md`](./SECURITY.md).

## Contributing

Pull requests welcome. See [`CONTRIBUTING.md`](./CONTRIBUTING.md). All contributors must sign the CLA on their first PR.
