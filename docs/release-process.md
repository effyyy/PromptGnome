# Release Process

PromptGnome uses [release-please](https://github.com/googleapis/release-please)
to automate semantic versioning and changelog generation from
[Conventional Commits](https://www.conventionalcommits.org/). Store publishing
is handled by [PlasmoHQ/bpp](https://github.com/PlasmoHQ/bpp).

## Overview

```
Conventional commit on main
        │
        ▼
release-please opens "chore(main): release X.Y.Z" PR
        │
        ▼
Maintainer merges Release PR
        │
        ▼
release-please tags vX.Y.Z and creates GitHub Release
        │
        ▼
build-and-publish job:
  • builds Chrome / Firefox / Edge zips
  • computes SHA256SUMS
  • uploads artifacts to the GitHub Release
  • pushes to Chrome Web Store, Firefox Add-ons, Edge Add-ons via BPP
```

## Triggering a release

1. Land commits on `main` using Conventional Commit prefixes:
   - `feat:` → minor bump (pre-1.0: patch bump, see config)
   - `fix:` / `perf:` / `hotfix:` → patch bump
   - `feat!:` or commit body containing `BREAKING CHANGE:` → major bump
   - `chore:` / `test:` / `ci:` / `build:` → no release (hidden in changelog)
2. release-please will automatically open or update a "Release PR" with the
   proposed version bump, updated `CHANGELOG.md`, and updated
   `extension/package.json`.
3. Review the Release PR and merge when ready. The publish job runs
   automatically on merge.

## `BPP_KEYS` secret schema

The `BPP_KEYS` repository secret is a single JSON blob containing credentials
for all three stores. Do **not** commit this file. Set it via
`gh secret set BPP_KEYS --body "$(cat bpp-keys.json)"`.

```json
{
  "chrome": {
    "clientId": "<oauth2 client id>",
    "clientSecret": "<oauth2 client secret>",
    "refreshToken": "<oauth2 refresh token>",
    "extensionId": "<chrome web store extension id>"
  },
  "firefox": {
    "apiKey": "<amo jwt issuer>",
    "apiSecret": "<amo jwt secret>",
    "extensionId": "<addon guid>"
  },
  "edge": {
    "clientId": "<azure ad app client id>",
    "clientSecret": "<azure ad app client secret>",
    "productId": "<edge add-ons product id>",
    "accessTokenUrl": "<oauth2 token endpoint>"
  }
}
```

How to obtain each credential:

- **Chrome:** follow the [Chrome Web Store API
  guide](https://developer.chrome.com/docs/webstore/using-api) to create OAuth2
  credentials and a refresh token for the Developer Dashboard account that owns
  the extension.
- **Firefox:** generate a JWT issuer / secret pair at
  https://addons.mozilla.org/developers/addon/api/key/.
- **Edge:** create an Azure AD app registration with permissions for the Edge
  Add-ons API. See the [Edge Add-ons API
  docs](https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/publish/api/using-addons-api).

## Manual release (recovery only)

If release-please is unavailable, a release can be cut manually:

```bash
# 1. Bump the version in extension/package.json and update CHANGELOG.md.
# 2. Tag and push.
git tag -a v1.2.3 -m "v1.2.3"
git push origin v1.2.3
# 3. Create the GitHub Release manually.
gh release create v1.2.3 --generate-notes
# 4. Re-run the release workflow against the tag.
gh workflow run release.yml --ref v1.2.3
```

This path should be reserved for break-glass situations only.

## Verifying a release

Every release workflow run produces:

- Three signed store-uploaded zips: `chrome-mv3-prod.zip`,
  `firefox-mv3-prod.zip`, `edge-mv3-prod.zip`.
- A `SHA256SUMS` file containing sha256 hashes of all three.

To verify a release reproducibly:

```bash
git checkout vX.Y.Z
cd extension
pnpm install --frozen-lockfile
pnpm build && pnpm build:firefox && pnpm build:edge
pnpm package && pnpm package:firefox && pnpm package:edge
cd build && sha256sum *.zip
```

Compare the output against the `SHA256SUMS` attached to the GitHub Release.
