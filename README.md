<div align="center">

<img src="assets/brand/banner.svg" alt="PromptGnome — catches sensitive info before it reaches the AI" width="100%" />

<br/>

**A browser extension that detects sensitive information in your messages to AI chatbots and warns you before you send.**

[Privacy policy](docs/privacy-policy.md) ·
[How it works](docs/how-it-works.md) ·
[Threat model](docs/threat-model.md) ·
[Report a bug](https://github.com/effyyy/PromptGnome/issues/new/choose)

<sub>

![Local-first](https://img.shields.io/badge/detection-100%25%20local-00e5a0?style=flat-square&labelColor=060a14)
![PII categories](https://img.shields.io/badge/PII%20categories-18-ffb347?style=flat-square&labelColor=060a14)
![Providers](https://img.shields.io/badge/providers-ChatGPT%20·%20Claude%20·%20Gemini-e8edf5?style=flat-square&labelColor=060a14)
![License](https://img.shields.io/badge/docs-CC%20BY%204.0-8a94a8?style=flat-square&labelColor=060a14)

</sub>

</div>

---

## What this repository is

This is the public home for PromptGnome's documentation, trust artifacts, and issue tracker. It does **not** contain the extension's source code.

PromptGnome's source code is currently kept in a private repository. This is a practical choice rather than a permanent one — open-sourcing parts of the project is something we are seriously considering, and community feedback will help shape that decision.

What you can do here:

- Read our [privacy policy](docs/privacy-policy.md), [threat model](docs/threat-model.md), and [data flow](docs/data-flow.md)
- Check the [status of supported AI providers](docs/supported-providers.md)
- File a bug report, feature request, or detection issue
- Report a security vulnerability privately

## How it works

<div align="center">

<img src="assets/brand/how-it-works.svg" alt="Five-step flow: you type, we intercept, we detect, we warn, you decide" width="100%" />

</div>

PromptGnome runs entirely inside your browser. When you submit a prompt to a supported AI chatbot, the extension catches the outbound request, runs a local regex pipeline against the prompt text, and — if anything sensitive is found — shows you a warning overlay so you can edit, cancel, or send anyway. **No prompt content ever leaves your machine for a PromptGnome server.**

For the long-form walkthrough, see [`docs/how-it-works.md`](docs/how-it-works.md).

## Brand

PromptGnome's visual identity is built around a calm, trust-forward dark palette with an emerald accent for safety and an amber accent for warnings.

<table>
  <tr>
    <td align="center" width="140">
      <img src="assets/brand/icon.svg" alt="PromptGnome icon" width="112" height="112" />
      <br/><sub><b>The Gnome</b></sub>
    </td>
    <td>
      <table>
        <tr>
          <td align="center" bgcolor="#00e5a0"><sub><b><code>#00e5a0</code></b><br/>Emerald · primary</sub></td>
          <td align="center" bgcolor="#00b37d"><sub><b><code>#00b37d</code></b><br/>Emerald dim</sub></td>
          <td align="center" bgcolor="#ffb347"><sub><b><code>#ffb347</code></b><br/>Amber · warning</sub></td>
          <td align="center" bgcolor="#ff6b6b"><sub><b><code>#ff6b6b</code></b><br/>Danger</sub></td>
        </tr>
        <tr>
          <td align="center" bgcolor="#060a14"><sub><b><code>#060a14</code></b><br/>Background</sub></td>
          <td align="center" bgcolor="#0c1220"><sub><b><code>#0c1220</code></b><br/>Surface</sub></td>
          <td align="center" bgcolor="#e8edf5"><sub><b><code>#e8edf5</code></b><br/>Text</sub></td>
          <td align="center" bgcolor="#8a94a8"><sub><b><code>#8a94a8</code></b><br/>Text muted</sub></td>
        </tr>
      </table>
    </td>
  </tr>
</table>

**Type:** Bricolage Grotesque (display) · DM Sans (body) · JetBrains Mono (code).

The mark layers a gnome's hat over a shield-and-lock — protection, but friendly. Brand assets live in [`assets/brand/`](assets/brand).

## Install

| Browser | Status |
|---|---|
| Chrome / Chromium | coming soon |
| Firefox | coming soon |
| Microsoft Edge | coming soon |

## Documentation

- [How it works](docs/how-it-works.md) — a plain-language walkthrough
- [Data flow](docs/data-flow.md) — every network call the extension makes
- [Threat model](docs/threat-model.md) — what we protect against and what we do not
- [Permissions](docs/permissions.md) — every browser permission and why we need it
- [Supported providers](docs/supported-providers.md) — current status per AI chatbot
- [PII types](docs/pii-types.md) — what the detection engine recognizes
- [Privacy policy](docs/privacy-policy.md)
- [Terms of service](docs/terms-of-service.md)
- [FAQ](docs/faq.md)
- [Troubleshooting](docs/troubleshooting.md)

## Reporting a bug or requesting a feature

Please use the [issue templates](https://github.com/effyyy/PromptGnome/issues/new/choose). Each template guides you through the information we need.

If you are reporting a detection issue (a false positive or a false negative), please use **synthetic data only**. Never paste real personal information into an issue.

## Reporting a security vulnerability

Please do not file security issues as public issues. Use [GitHub's private vulnerability reporting](https://github.com/effyyy/PromptGnome/security/advisories/new) or see [SECURITY.md](SECURITY.md) for the full process.

## Changelog

Release notes are maintained in [CHANGELOG.md](CHANGELOG.md) and mirror what is published on the browser extension stores.

## License

The contents of this repository are licensed under [CC BY 4.0](LICENSE). PromptGnome's source code is not distributed via this repository and is not covered by this license.
