/**
 * Bug-report URL builder.
 * Constructs a prefilled GitHub "new issue" URL so users can submit bugs
 * without the extension ever transmitting data to a third-party server.
 * Architecture layer: utils
 */

const REPO_OWNER = "effyyy"
const REPO_NAME = "PromptGnome"
const BUG_TEMPLATE = "bug-report.yml"

/**
 * Kind of report being filed.
 * - `bug`: routed to the public bug-report issue template.
 * - `security`: routed to GitHub Private Vulnerability Reporting. Security
 *   issues must never be filed as public issues.
 */
export type BugReportKind = "bug" | "security"

/** URL of the GitHub Private Vulnerability Reporting form for this repo. */
export const SECURITY_ADVISORY_URL = `https://github.com/${REPO_OWNER}/${REPO_NAME}/security/advisories/new`

/** Inputs collected from the quick bug-report dialog. */
export interface BugReportInput {
  /** Which channel the report should go to. */
  kind: BugReportKind
  /** Short user-supplied title. */
  title: string
  /** Free-text description of what went wrong. */
  description: string
  /** Hostname of the AI provider page (no path/query). Optional. */
  providerHost?: string
}

/** Context auto-collected from the runtime. Never includes PII or full URLs. */
export interface BugReportContext {
  extensionVersion: string
  browser: string
  platform: string
}

/**
 * Collect non-sensitive runtime context for the bug report.
 * @returns Extension version + browser/platform identifiers.
 */
export function collectBugReportContext(): BugReportContext {
  let version = "unknown"
  try {
    version = chrome.runtime.getManifest().version ?? "unknown"
  } catch {
    // Not running inside an extension context (e.g. unit tests).
  }

  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "unknown"
  const platform = typeof navigator !== "undefined" ? navigator.platform : "unknown"

  let browser = "Unknown"
  if (/Edg\//.test(ua)) browser = "Edge"
  else if (/OPR\//.test(ua)) browser = "Opera"
  else if (/Firefox\//.test(ua)) browser = "Firefox"
  else if (/Chrome\//.test(ua)) browser = "Chrome"
  else if (/Safari\//.test(ua)) browser = "Safari"

  return { extensionVersion: version, browser, platform }
}

/**
 * Build a GitHub "new issue" URL with title, body, and labels prefilled.
 * The user submits the issue from GitHub itself — the extension never sends
 * any data over the network.
 * @param input - User-supplied title/description and optional provider host.
 * @param ctx - Auto-collected runtime context. Pass {@link collectBugReportContext}.
 * @returns Fully-qualified github.com issue URL.
 */
export function buildBugReportUrl(input: BugReportInput, ctx: BugReportContext): string {
  // Security issues must never be filed publicly. Route to GitHub's Private
  // Vulnerability Reporting form, which only the maintainers can read.
  if (input.kind === "security") {
    return SECURITY_ADVISORY_URL
  }

  const title = input.title.trim() || "Bug report"
  const description = input.description.trim() || "_(no description provided)_"

  const body = [
    "### Description",
    description,
    "",
    "### Environment",
    `- **Extension version:** ${ctx.extensionVersion}`,
    `- **Browser:** ${ctx.browser}`,
    `- **Platform:** ${ctx.platform}`,
    `- **AI provider:** ${input.providerHost ?? "n/a"}`,
    "",
    "---",
    "_Submitted via the in-extension bug reporter. No logs or message contents are attached._",
  ].join("\n")

  const params = new URLSearchParams({
    template: BUG_TEMPLATE,
    title,
    body,
  })

  return `https://github.com/${REPO_OWNER}/${REPO_NAME}/issues/new?${params.toString()}`
}
