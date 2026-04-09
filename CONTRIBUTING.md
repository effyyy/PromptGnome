# Contributing to PromptGnome

Thanks for your interest in contributing. Please read this entire document
before opening a pull request.

## Code of Conduct

This project follows the Contributor Covenant. See [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md).

## Contributor License Agreement (CLA)

All non-trivial contributions require a signed Contributor License Agreement
before they can be merged. To sign, read [`CLA.md`](./CLA.md) and then post
the following comment, **exactly**, on your pull request:

> I have read the CLA Document and I hereby sign the CLA

A GitHub Actions check (`CLA`) will pick up the comment and turn green. The
comment itself — authored by your verified GitHub account, timestamped, and
permanently attached to the PR — is the signature record. There is no
third-party bot, no extra OAuth grant, and no data leaves GitHub.

The CLA assigns the project owner the right to relicense your contribution,
which is what enables the dual-license model (PolyForm Noncommercial for
public use, commercial licenses available on request). Without a CLA, we
cannot accept contributions.

## Building locally

Prerequisites:
- Node.js (version pinned in `extension/.nvmrc`)
- pnpm (corepack-managed; run `corepack enable` if needed)

```bash
cd extension
pnpm install --frozen-lockfile
pnpm dev          # development build with hot reload
pnpm build        # production build
pnpm test         # full test suite
pnpm typecheck    # TypeScript strict-mode check
```

Loading the unpacked extension:
1. Run `pnpm build` in `extension/`.
2. In Chrome, open `chrome://extensions` and enable Developer mode.
3. Click **Load unpacked** and select `extension/build/chrome-mv3-prod`.

## Reproducible builds

Every release artifact published to a browser store is built by GitHub
Actions from a tagged commit in this repository. To verify a release:

1. Check out the tag: `git checkout v<version>`
2. Build: `cd extension && pnpm install --frozen-lockfile && pnpm build`
3. Compare hashes: `sha256sum extension/build/chrome-mv3-prod/manifest.json`
   against the same file from the GitHub Release artifact.

The `release.yml` workflow attaches a `SHA256SUMS` file to every Release.

## Code standards

- TypeScript strict mode, zero `any`, zero non-null assertions.
- Every exported function gets a JSDoc block with `@param`, `@returns`,
  `@throws`.
- Tests live under `extension/tests/` mirroring the `extension/src/` layout.
- Synthetic PII only — never use real names, real SSNs, or real emails in
  fixtures or tests. Use obvious placeholders like `Jane Testperson`,
  `123-45-6789`, `test@example.com`.
- Coverage targets: 85% for `detection/`, `anonymization/`, `rehydration/`;
  70% overall.

## Pull request process

1. Branch from `develop`, not `master`.
2. Write tests first (TDD). New code without tests will be asked to add them.
3. Run `pnpm typecheck && pnpm test && pnpm build` before pushing.
4. Open the PR against `develop`. CI will run automatically.
5. Address review feedback.
6. A maintainer will merge when checks pass and the CLA is signed.

## What belongs here vs the Pro tier

This repository is the **free tier** of PromptGnome. The free tier:
- Runs entirely on-device
- Makes zero network calls to PromptGnome-controlled servers
- Includes regex detection, local NER (offscreen document), warning UI,
  auto-anonymization, and re-hydration

The Pro tier (closed-source, in development) adds backend-assisted NER,
file and image scanning, and team features. Pro source code is not part of
this repository, and pull requests adding Pro-style features (anything that
POSTs to a PromptGnome backend) will be closed. If you have an idea for a
Pro feature, open a discussion instead.

## Contact

For commercial licensing or general questions: **contact@promptgnome.com**.
