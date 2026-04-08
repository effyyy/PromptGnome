# Security Policy

## Supported versions

The latest published release on the Chrome Web Store, Firefox Add-ons, and
Edge Add-ons is the only supported version.

## Reporting a vulnerability

**Please do not open public GitHub issues for security vulnerabilities.**

Use GitHub's private vulnerability reporting feature for this repository:
1. Navigate to the **Security** tab of this repository.
2. Click **Report a vulnerability**.
3. Provide as much detail as you can: affected version, reproduction steps,
   impact assessment.

Alternatively, email **contact@promptgnome.com** with the subject line
`SECURITY: <short description>`.

## Disclosure timeline

- **Within 48 hours**: acknowledgement of receipt.
- **Within 7 days**: initial triage and severity assessment.
- **Within 90 days**: fix released, or a coordinated disclosure date agreed
  with the reporter. PromptGnome follows a 90-day coordinated-disclosure
  policy as the default upper bound; severe issues are addressed faster.

## Scope

In scope:
- The browser extension source code under `extension/`.
- The detection engine under `extension/src/detection/`.
- Build artifacts published to the Chrome Web Store / Firefox Add-ons /
  Edge Add-ons under the PromptGnome name.

Out of scope:
- The Pro tier (closed-source).
- Third-party dependencies — please report those upstream.
- Issues that require an attacker to already have full control of the
  victim's device.
