# Security policy

Thank you for taking the time to look for security issues in PromptGnome. PromptGnome is a privacy tool, so security and correctness matter to us a great deal. We will work with you in good faith to investigate, fix, and disclose any vulnerabilities you find.

## Reporting a vulnerability

**Please do not file security issues as public GitHub issues.**

The preferred way to report a vulnerability is via GitHub's Private Vulnerability Reporting:

> https://github.com/effyyy/PromptGnome/security/advisories/new

If you cannot use GitHub PVR for any reason, you can email us at **contact@promptgnome.com** with the subject line "Security report".

When reporting, please include:

- A clear description of the issue
- Steps to reproduce it (or a proof of concept)
- The impact you believe it has
- The extension version, browser, and operating system you tested on
- Any suggestions for remediation, if you have them

## Our response commitment

- **Acknowledgement:** within 72 hours of receipt
- **Initial assessment:** within 7 days
- **Fix and coordinated disclosure:** we will keep you informed of progress and agree on a disclosure timeline together

## Scope

In scope for this program:

- Bugs in PII detection that could cause sensitive data to leak to AI provider servers
- Issues in the encryption, key derivation, or storage of the PII mapping store
- Content-script isolation problems that could expose internal extension state to the host page
- Errors in the network call inventory (any unannounced or undocumented network call)
- Permission escalation or Manifest V3 sandbox bypasses

Out of scope:

- Issues in third-party AI providers themselves (ChatGPT, Claude, Gemini, etc.)
- Vulnerabilities in browser engines or operating systems
- Social engineering, phishing, or physical access attacks
- Reports based purely on outdated dependencies without a working exploit
- Theoretical issues without a demonstrable impact

## Safe harbor

We consider security research conducted in good faith and in accordance with this policy to be authorized. We will not pursue legal action against researchers who:

- Make a good-faith effort to avoid privacy violations and disruption to others
- Only test against accounts they own or have explicit permission to test
- Report findings through the channels above and give us reasonable time to respond before any public disclosure

Thank you for helping keep PromptGnome and its users safe.
