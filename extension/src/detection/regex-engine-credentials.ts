/**
 * Cloud provider and SaaS credential detectors for the regex PII detection engine.
 * Handles AWS, GitHub, Stripe, OpenAI, Anthropic, Google AI, Slack, Azure, GCP,
 * Twilio, SendGrid, Mailgun, Discord, Heroku, Vercel, Netlify, private keys, JWTs,
 * database connection strings, and basic auth URLs.
 * Architecture layer: Detection (credentials sub-module)
 */

import { type DetectorMatch, scanWithRegex, hasContextTrigger } from "./regex-helpers"

/**
 * Detects AWS access key IDs (AKIA prefix, 20 chars).
 * @param text - Input text to scan
 * @returns Array of AWS access key matches
 */
export function detectAWSAccessKeys(text: string): DetectorMatch[] {
  const pattern = /\b(AKIA[0-9A-Z]{16})\b/g
  return scanWithRegex(text, pattern, "AWS_ACCESS_KEY", 0.98)
}

/**
 * Detects AWS secret access keys (40 char base64-like strings near AWS context).
 * @param text - Input text to scan
 * @returns Array of AWS secret key matches
 */
export function detectAWSSecretKeys(text: string): DetectorMatch[] {
  const pattern = /(?:aws_secret_access_key|secret[-_\s]?key|aws[-_\s]?secret)\s*[=:]\s*([A-Za-z0-9/+=]{40})/gi
  const matches: DetectorMatch[] = []
  let match: RegExpExecArray | null
  const regex = new RegExp(pattern.source, pattern.flags)
  while ((match = regex.exec(text)) !== null) {
    const secretValue = match[1]
    matches.push({
      type: "AWS_SECRET_KEY",
      value: secretValue,
      start: match.index + match[0].indexOf(secretValue),
      end: match.index + match[0].indexOf(secretValue) + secretValue.length,
      confidence: 0.95
    })
  }
  return matches
}

/**
 * Detects GitHub personal access tokens (ghp_, gho_, ghu_, ghs_, ghr_ prefixes),
 * fine-grained PATs, GitLab personal access tokens, and Bitbucket access tokens.
 * @param text - Input text to scan
 * @returns Array of GitHub/GitLab/Bitbucket token matches
 */
export function detectGitHubTokens(text: string): DetectorMatch[] {
  const matches: DetectorMatch[] = []
  // Classic GitHub tokens: ghp_, gho_, ghu_, ghs_, ghr_
  const classicPattern = /\b(gh[pousr]_[A-Za-z0-9]{36,})\b/g
  matches.push(...scanWithRegex(text, classicPattern, "GITHUB_TOKEN", 0.98))
  // Fine-grained PATs
  const fineGrainedPattern = /\b(github_pat_[A-Za-z0-9_]{82})\b/g
  matches.push(...scanWithRegex(text, fineGrainedPattern, "GITHUB_TOKEN", 0.98))
  // GitLab personal access tokens
  const gitlabPattern = /\b(glpat-[A-Za-z0-9\-_]{20,})\b/g
  matches.push(...scanWithRegex(text, gitlabPattern, "GITHUB_TOKEN", 0.97))
  // Bitbucket access tokens
  const bitbucketPattern = /\b(ATBB[A-Za-z0-9]{32})\b/g
  matches.push(...scanWithRegex(text, bitbucketPattern, "GITHUB_TOKEN", 0.97))
  return matches
}

/**
 * Detects Stripe API keys (standard publishable/secret, restricted, and webhook secrets).
 * @param text - Input text to scan
 * @returns Array of Stripe key matches
 */
export function detectStripeKeys(text: string): DetectorMatch[] {
  const matches: DetectorMatch[] = []
  // Standard publishable/secret keys — confidence 1.0 so the specific
  // STRIPE_KEY type wins over the generic SECRET detector during dedup.
  const standardPattern = /\b([sr]k_(?:live|test)_[A-Za-z0-9]{20,})\b/g
  matches.push(...scanWithRegex(text, standardPattern, "STRIPE_KEY", 1.0))
  // Restricted keys
  const restrictedPattern = /\b(rk_(?:live|test)_[A-Za-z0-9]{20,})\b/g
  matches.push(...scanWithRegex(text, restrictedPattern, "STRIPE_KEY", 1.0))
  // Webhook secrets
  const webhookPattern = /\b(whsec_[A-Za-z0-9]{32,})\b/g
  matches.push(...scanWithRegex(text, webhookPattern, "STRIPE_KEY", 1.0))
  return matches
}

/** Reusable list of placeholder/example patterns that are not real secrets */
const PLACEHOLDER_PATTERNS = [
  /^your[-_]?/i, /^example/i, /^test[-_]?/i, /^sample/i, /^placeholder/i,
  /^xxx+$/i, /^0{10,}$/, /^changeme/i, /^insert[-_]?/i, /^replace[-_]?/i,
  /^todo/i, /^fixme/i, /^dummy/i, /^fake/i, /^mock/i, /^null$/i,
  /^undefined$/i, /^none$/i, /^n\/a$/i, /^empty$/i, /^\*+$/,
  /^<.*>$/, /^\[.*\]$/, /^\{.*\}$/, /^CHANGE[-_]?ME/i,
]

/**
 * Returns true if a candidate value looks like a placeholder, not a real secret.
 * @param value - The candidate secret value
 * @returns true if the value is a known placeholder pattern
 */
function isPlaceholder(value: string): boolean {
  if (PLACEHOLDER_PATTERNS.some((p) => p.test(value))) return true
  // All-same character
  if (/^(.)\1+$/.test(value)) return true
  // All zeros or all dashes
  if (/^[0\-]+$/.test(value)) return true
  return false
}

/**
 * Computes Shannon entropy of a string (bits per character).
 * High entropy (> 3.5) suggests random/generated content like secrets.
 * Low entropy (< 2.5) suggests natural language or simple patterns.
 * @param s - Input string
 * @returns Entropy in bits per character
 */
function shannonEntropy(s: string): number {
  if (s.length === 0) return 0
  const freq = new Map<string, number>()
  for (const c of s) freq.set(c, (freq.get(c) ?? 0) + 1)
  let entropy = 0
  for (const count of freq.values()) {
    const p = count / s.length
    entropy -= p * Math.log2(p)
  }
  return entropy
}

/**
 * Detects generic API keys near contextual keywords.
 * Requires minimum 24-char value (shorter values are typically not secrets).
 * Rejects common placeholder/example values.
 * @param text - Input text to scan
 * @returns Array of generic API key matches
 */
export function detectGenericAPIKeys(text: string): DetectorMatch[] {
  const pattern = /(?:api[_\s]?key|apikey|api[_\s]?secret|api[_\s]?token|auth[_\s]?token|access[_\s]?token|secret[_\s]?key|client[_\s]?secret|database[_\s]?password|db[_\s]?password)\s*[=:]\s*["']?([A-Za-z0-9\-._~+/]{24,})/gi
  const matches: DetectorMatch[] = []
  let match: RegExpExecArray | null
  const regex = new RegExp(pattern.source, pattern.flags)
  while ((match = regex.exec(text)) !== null) {
    const keyValue = match[1]
    const cleaned = keyValue.replace(/["']$/, "")
    if (cleaned.length < 36) continue
    if (isPlaceholder(cleaned)) continue
    // Require minimum entropy to avoid matching config values
    const entropy = shannonEntropy(cleaned)
    if (entropy < 3.5) continue
    // Confidence scales with length + entropy — floor at 0.85 to avoid gray zone
    let confidence = 0.85
    if (cleaned.length >= 48 && entropy >= 4.0) confidence = 0.93
    else if (cleaned.length >= 40 && entropy >= 3.8) confidence = 0.90
    matches.push({
      type: "GENERIC_API_KEY",
      value: cleaned,
      start: match.index + match[0].indexOf(keyValue),
      end: match.index + match[0].indexOf(keyValue) + cleaned.length,
      confidence,
    })
  }
  return matches
}

/**
 * Catch-all detector for ANY variable assignment where the variable name
 * contains a secret-indicating suffix (_KEY, _TOKEN, _SECRET, _PASSWORD,
 * _CREDENTIAL, _AUTH, _SIGNING, _ENCRYPTION, etc.) and the value looks
 * like a real secret (24+ chars, high entropy, not a placeholder).
 *
 * This catches secrets that no specific detector covers, e.g.:
 *   CUSTOM_SERVICE_KEY=a1b2c3d4...
 *   MY_APP_SECRET="long-random-string"
 *   webhook_signing_key: "sk_whsec_..."
 *
 * Uses Shannon entropy to distinguish real secrets (high randomness)
 * from config values (low randomness like file paths or URLs).
 * @param text - Input text to scan
 * @returns Array of secret assignment matches
 */
export function detectSecretAssignments(text: string): DetectorMatch[] {
  // Variable name must end with one of these secret-indicating suffixes
  const pattern = /\b([A-Za-z][A-Za-z0-9_]*[-_](?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|CREDENTIALS|AUTH|APIKEY|API_KEY|SIGNING|ENCRYPTION|HASH|SALT|CERT|CERTIFICATE|LICENSE_KEY|PRIVATE|MASTER_KEY|WEBHOOK_SECRET|SIGNING_KEY|ENCRYPTION_KEY|ACCESS_KEY|REFRESH_TOKEN|SESSION_SECRET|APP_SECRET|CLIENT_ID_SECRET))\s*[=:]\s*["']?([A-Za-z0-9\-._~+/=]{16,})/gi
  const matches: DetectorMatch[] = []
  const regex = new RegExp(pattern.source, pattern.flags)
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    const rawValue = match[2].replace(/["'\s]+$/, "")
    if (rawValue.length < 28) continue
    if (isPlaceholder(rawValue)) continue
    // Require high entropy to distinguish from config values / file paths
    const entropy = shannonEntropy(rawValue)
    if (entropy < 3.5) continue
    // Confidence scales with evidence — floor at 0.85 to avoid false positive gray zone
    let confidence = 0.85
    if (rawValue.length >= 40 && entropy >= 4.0) confidence = 0.93
    else if (rawValue.length >= 32 && entropy >= 3.8) confidence = 0.90
    matches.push({
      type: "GENERIC_API_KEY",
      value: rawValue,
      start: match.index + match[0].indexOf(rawValue),
      end: match.index + match[0].indexOf(rawValue) + rawValue.length,
      confidence,
    })
  }
  return matches
}

/**
 * Detects secrets in .env-style format: UPPER_SNAKE_CASE=value on its own line.
 * Only matches when the variable name contains a secret-suggesting word AND
 * the value has high entropy (looks random, not a path or URL).
 *
 * Catches patterns like:
 *   STRIPE_SECRET_KEY=sk_live_abc123...
 *   DB_PASSWORD=xK9m!pQ2...
 *   REDIS_AUTH_TOKEN=rdb_tok_...
 * @param text - Input text to scan
 * @returns Array of env-file secret matches
 */
export function detectEnvFileSecrets(text: string): DetectorMatch[] {
  // SECRET_WORDS that indicate the variable holds a secret
  const SECRET_WORDS = /(?:SECRET|KEY|TOKEN|PASSWORD|PASSWD|CREDENTIAL|AUTH|PRIVATE|SIGNING|ENCRYPTION|CERT|SALT|HASH|MASTER|WEBHOOK)/i
  // Match UPPER_SNAKE=value or UPPER_SNAKE="value" at line boundaries
  const pattern = /^([A-Z][A-Z0-9_]{2,})\s*=\s*["']?([^\s"'#][^\s"']*)/gm
  const matches: DetectorMatch[] = []
  let match: RegExpExecArray | null
  const regex = new RegExp(pattern.source, pattern.flags)
  while ((match = regex.exec(text)) !== null) {
    const varName = match[1]
    const rawValue = match[2].replace(/["']+$/, "")
    // Variable name must contain a secret-indicating word
    if (!SECRET_WORDS.test(varName)) continue
    if (rawValue.length < 24) continue
    if (isPlaceholder(rawValue)) continue
    // Skip URLs (these are endpoints, not secrets)
    if (/^https?:\/\//i.test(rawValue)) continue
    // Skip file paths
    if (/^[/~.]/.test(rawValue) && rawValue.includes("/")) continue
    // Skip boolean/numeric config values
    if (/^(true|false|yes|no|\d+)$/i.test(rawValue)) continue
    // Require high entropy to distinguish secrets from config strings
    const entropy = shannonEntropy(rawValue)
    if (entropy < 3.8) continue
    // Floor at 0.85 to avoid false positive gray zone
    let confidence = 0.85
    if (rawValue.length >= 40 && entropy >= 4.2) confidence = 0.93
    else if (rawValue.length >= 32 && entropy >= 4.0) confidence = 0.90
    matches.push({
      type: "GENERIC_API_KEY",
      value: rawValue,
      start: match.index + match[0].indexOf(rawValue),
      end: match.index + match[0].indexOf(rawValue) + rawValue.length,
      confidence,
    })
  }
  return matches
}

/**
 * Detects high-entropy quoted strings near secret-related keywords.
 * Catches secrets in JSON configs, YAML files, and code where the secret
 * appears as a string literal near a key name containing secret-like words.
 *
 * Catches patterns like:
 *   "signing_key": "a8f3b2c1d4e5..."
 *   password: 'xK9mPq2rSt...'
 *   encryption_key => "base64encoded..."
 * @param text - Input text to scan
 * @returns Array of high-entropy secret matches
 */
export function detectHighEntropySecrets(text: string): DetectorMatch[] {
  // Key name containing secret word, followed by quoted value
  const pattern = /["']?([a-zA-Z_][-a-zA-Z0-9_]*(?:secret|key|token|password|passwd|credential|auth|signing|encryption|private|salt|hash|cert|master|webhook)[-a-zA-Z0-9_]*)["']?\s*[:=]\s*["']([A-Za-z0-9\-._~+/=!@#$%^&*]{20,})["']/gi
  const matches: DetectorMatch[] = []
  const regex = new RegExp(pattern.source, pattern.flags)
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    const rawValue = match[2]
    if (rawValue.length < 32) continue
    if (isPlaceholder(rawValue)) continue
    const entropy = shannonEntropy(rawValue)
    if (entropy < 4.0) continue
    // Floor at 0.85 to avoid false positive gray zone
    let confidence = 0.85
    if (rawValue.length >= 48 && entropy >= 4.5) confidence = 0.93
    else if (rawValue.length >= 40 && entropy >= 4.2) confidence = 0.90
    matches.push({
      type: "GENERIC_API_KEY",
      value: rawValue,
      start: match.index + match[0].indexOf(rawValue),
      end: match.index + match[0].indexOf(rawValue) + rawValue.length,
      confidence,
    })
  }
  return matches
}

/**
 * Detects OpenAI API keys (sk-proj- prefix or sk- with 48+ chars).
 * @param text - Input text to scan
 * @returns Array of OpenAI key matches
 */
export function detectOpenAIKeys(text: string): DetectorMatch[] {
  const matches: DetectorMatch[] = []
  // New project-scoped keys
  const projPattern = /\b(sk-proj-[A-Za-z0-9_\-]{20,})\b/g
  matches.push(...scanWithRegex(text, projPattern, "OPENAI_KEY", 0.98))
  // Legacy format (sk- + 48+ chars, but not sk-ant- which is Anthropic)
  const legacyPattern = /\b(sk-(?!ant-)[A-Za-z0-9]{48,})\b/g
  matches.push(...scanWithRegex(text, legacyPattern, "OPENAI_KEY", 0.97))
  return matches
}

/**
 * Detects Anthropic API keys (sk-ant-api03- prefix).
 * @param text - Input text to scan
 * @returns Array of Anthropic key matches
 */
export function detectAnthropicKeys(text: string): DetectorMatch[] {
  const pattern = /\b(sk-ant-api03-[A-Za-z0-9_\-]{93})\b/g
  return scanWithRegex(text, pattern, "ANTHROPIC_KEY", 0.98)
}

/**
 * Detects Google AI API keys (AIzaSy prefix, 39 chars total).
 * @param text - Input text to scan
 * @returns Array of Google AI key matches
 */
export function detectGoogleAIKeys(text: string): DetectorMatch[] {
  const pattern = /\b(AIzaSy[A-Za-z0-9_\-]{33})\b/g
  return scanWithRegex(text, pattern, "GOOGLE_AI_KEY", 0.98)
}

/**
 * Detects Slack API tokens (xoxb-, xoxp-, xoxa-, xoxe- prefixes).
 * @param text - Input text to scan
 * @returns Array of Slack token matches
 */
export function detectSlackTokens(text: string): DetectorMatch[] {
  const pattern = /\b(xox[bpae]-[A-Za-z0-9\-]{10,})\b/g
  return scanWithRegex(text, pattern, "SLACK_TOKEN", 0.98)
}

/**
 * Detects PEM private keys (full block from BEGIN to END marker).
 * Matches RSA, EC, OpenSSH, and PKCS#8 private key blocks.
 * @param text - Input text to scan
 * @returns Array of private key matches
 */
export function detectPrivateKeys(text: string): DetectorMatch[] {
  const matches: DetectorMatch[] = []
  // Match entire PEM block including newlines
  const pattern = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g
  let match: RegExpExecArray | null
  const regex = new RegExp(pattern.source, pattern.flags)
  while ((match = regex.exec(text)) !== null) {
    matches.push({
      type: "PRIVATE_KEY",
      value: match[0],
      start: match.index,
      end: match.index + match[0].length,
      confidence: 0.99,
    })
    if (match[0].length === 0) regex.lastIndex++
  }
  return matches
}

/**
 * Detects JWT tokens (three base64url segments separated by dots).
 * Rejects known example/documentation JWTs that appear in tutorials.
 * Requires minimum total length of 60 chars (real JWTs are longer).
 * @param text - Input text to scan
 * @returns Array of JWT token matches
 */
export function detectJWTTokens(text: string): DetectorMatch[] {
  const pattern = /\b(eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+)\b/g
  // Known example JWTs from jwt.io and tutorials
  const EXAMPLE_PREFIXES = [
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkw",
    "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkw",
  ]
  return scanWithRegex(text, pattern, "JWT_TOKEN", 0.82)
    .filter((m) => {
      // Real JWTs are typically 100+ chars
      if (m.value.length < 100) return false
      // Each segment must be at least 10 chars
      const segments = m.value.split(".")
      if (segments.some((s) => s.length < 10)) return false
      // Reject known examples
      if (EXAMPLE_PREFIXES.some((p) => m.value.startsWith(p))) return false
      // Validate base64url header contains "alg" to confirm it's a real JWT
      try {
        const headerPadded = segments[0].replace(/-/g, "+").replace(/_/g, "/")
        const padded = headerPadded + "=".repeat((4 - (headerPadded.length % 4)) % 4)
        const decoded = atob(padded)
        if (!decoded.includes('"alg"')) return false
      } catch {
        return false
      }
      return true
    })
}

/**
 * Detects Azure keys, connection strings, SAS tokens, and subscription keys.
 * @param text - Input text to scan
 * @returns Array of Azure key matches
 */
export function detectAzureKeys(text: string): DetectorMatch[] {
  const matches: DetectorMatch[] = []

  // Azure Storage connection string
  const connStringPattern = /DefaultEndpointsProtocol=https?;AccountName=[^;]+;AccountKey=[^;]+(?:;[^\s]*)?/gi
  matches.push(...scanWithRegex(text, connStringPattern, "AZURE_KEY", 0.96))

  // Azure Storage Account Key with context keyword
  const accountKeyPattern = /(?:AccountKey|account[_\s]?key|storage[_\s]?key)\s*[=:]\s*([A-Za-z0-9+/]{60,}={0,2})/gi
  const regex1 = new RegExp(accountKeyPattern.source, accountKeyPattern.flags)
  let match1: RegExpExecArray | null
  while ((match1 = regex1.exec(text)) !== null) {
    const keyValue = match1[1]
    matches.push({
      type: "AZURE_KEY",
      value: keyValue,
      start: match1.index + match1[0].indexOf(keyValue),
      end: match1.index + match1[0].indexOf(keyValue) + keyValue.length,
      confidence: 0.95,
    })
  }

  // Ocp-Apim-Subscription-Key header
  const subscriptionPattern = /Ocp-Apim-Subscription-Key[:\s]+([0-9a-f]{32})/gi
  const regex2 = new RegExp(subscriptionPattern.source, subscriptionPattern.flags)
  let match2: RegExpExecArray | null
  while ((match2 = regex2.exec(text)) !== null) {
    const keyValue = match2[1]
    matches.push({
      type: "AZURE_KEY",
      value: keyValue,
      start: match2.index + match2[0].indexOf(keyValue),
      end: match2.index + match2[0].indexOf(keyValue) + keyValue.length,
      confidence: 0.95,
    })
  }

  // Azure SAS token (contains sig= parameter)
  const sasPattern = /(\?(?:[^?\s]*&)?sig=[A-Za-z0-9%+/=]+(?:&[^?\s]*)*)/gi
  for (const m of scanWithRegex(text, sasPattern, "AZURE_KEY", 0.90)) {
    if (m.value.includes("sig=") && (m.value.includes("sv=") || m.value.includes("se="))) {
      matches.push(m)
    }
  }

  return matches
}

/**
 * Detects GCP credentials: OAuth tokens (ya29.), client secrets (GOCSPX-),
 * and service account indicators. Does NOT detect AIzaSy keys (handled by
 * detectGoogleAIKeys).
 * @param text - Input text to scan
 * @returns Array of GCP credential matches
 */
export function detectGCPKeys(text: string): DetectorMatch[] {
  const matches: DetectorMatch[] = []

  // GCP OAuth 2.0 access token
  const accessTokenPattern = /\b(ya29\.[A-Za-z0-9_\-]{20,})\b/g
  matches.push(...scanWithRegex(text, accessTokenPattern, "GCP_KEY", 0.95))

  // GCP OAuth client secret
  const clientSecretPattern = /\b(GOCSPX-[A-Za-z0-9_\-]{18,})\b/g
  matches.push(...scanWithRegex(text, clientSecretPattern, "GCP_KEY", 0.97))

  // GCP service account JSON indicator
  const serviceAccountPattern = /"type"\s*:\s*"service_account"[^}]*"private_key_id"\s*:\s*"([^"]+)"/g
  const regex = new RegExp(serviceAccountPattern.source, serviceAccountPattern.flags)
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    matches.push({
      type: "GCP_KEY",
      value: match[0],
      start: match.index,
      end: match.index + match[0].length,
      confidence: 0.98,
    })
  }

  return matches
}

/**
 * Detects Twilio Account SIDs (AC prefix + 32 hex chars).
 * @param text - Input text to scan
 * @returns Array of Twilio credential matches
 */
export function detectTwilioKeys(text: string): DetectorMatch[] {
  const pattern = /\b(AC[a-fA-F0-9]{32})\b/g
  return scanWithRegex(text, pattern, "TWILIO_KEY", 0.96)
}

/**
 * Detects SendGrid API keys (SG. prefix + segments).
 * @param text - Input text to scan
 * @returns Array of SendGrid key matches
 */
export function detectSendGridKeys(text: string): DetectorMatch[] {
  const pattern = /\b(SG\.[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{20,})\b/g
  return scanWithRegex(text, pattern, "SENDGRID_KEY", 0.97)
}

/**
 * Detects Mailgun API keys (key- prefix + 32 hex chars).
 * @param text - Input text to scan
 * @returns Array of Mailgun key matches
 */
export function detectMailgunKeys(text: string): DetectorMatch[] {
  const pattern = /\b(key-[a-fA-F0-9]{32})\b/g
  const raw = scanWithRegex(text, pattern, "MAILGUN_KEY", 0.60)
  // REQUIRE context — `key-` prefix is too generic (cache keys, lookup keys, etc.)
  return raw.map((m) => {
    if (hasContextTrigger(text, m.start, [
      "mailgun", "MAILGUN_API_KEY", "mailgun_api", "mailgun api"
    ])) {
      return { ...m, confidence: 0.95 }
    }
    return { ...m, confidence: 0.0 }
  }).filter((m) => m.confidence > 0)
}

/**
 * Detects Discord bot tokens (three base64url segments with specific lengths).
 * REQUIRES "Bot" prefix or discord context to reduce false positives on
 * other dot-separated token formats.
 * @param text - Input text to scan
 * @returns Array of Discord token matches
 */
export function detectDiscordTokens(text: string): DetectorMatch[] {
  // With "Bot " prefix — high confidence
  const botPattern = /Bot\s+([A-Za-z0-9_\-]{18,26}\.[A-Za-z0-9_\-]{6,7}\.[A-Za-z0-9_\-]{27,})/g
  const matches = scanWithRegex(text, botPattern, "DISCORD_TOKEN", 0.96)
  // Without Bot prefix — require discord context
  const barePattern = /\b([A-Za-z0-9_\-]{18,26}\.[A-Za-z0-9_\-]{6,7}\.[A-Za-z0-9_\-]{27,})\b/g
  for (const m of scanWithRegex(text, barePattern, "DISCORD_TOKEN", 0.60)) {
    if (hasContextTrigger(text, m.start, [
      "discord", "DISCORD_TOKEN", "discord_token", "discord bot", "discord_bot_token"
    ])) {
      matches.push({ ...m, confidence: 0.92 })
    }
  }
  return matches
}

/**
 * Detects Heroku API keys (UUID format with heroku context).
 * Context-gated because UUIDs are generic.
 * @param text - Input text to scan
 * @returns Array of Heroku key matches
 */
export function detectHerokuKeys(text: string): DetectorMatch[] {
  const pattern = /\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/gi
  const raw = scanWithRegex(text, pattern, "HEROKU_KEY", 0.60)
  return raw
    .filter((m) => hasContextTrigger(text, m.start, [
      "heroku", "heroku_api_key", "heroku api", "HEROKU_API_KEY"
    ]))
    .map((m) => ({ ...m, confidence: 0.92 }))
}

/**
 * Detects Vercel tokens with vercel context keywords.
 * @param text - Input text to scan
 * @returns Array of Vercel token matches
 */
export function detectVercelTokens(text: string): DetectorMatch[] {
  const pattern = /(?:VERCEL_TOKEN|vercel_token|vercel[_\s]?auth)\s*[=:]\s*["']?([A-Za-z0-9_\-]{20,})/gi
  const matches: DetectorMatch[] = []
  const regex = new RegExp(pattern.source, pattern.flags)
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    const tokenValue = match[1]
    matches.push({
      type: "VERCEL_TOKEN",
      value: tokenValue,
      start: match.index + match[0].indexOf(tokenValue),
      end: match.index + match[0].indexOf(tokenValue) + tokenValue.length,
      confidence: 0.93,
    })
  }
  return matches
}

/**
 * Detects Netlify tokens (nf_ prefix or context-gated).
 * @param text - Input text to scan
 * @returns Array of Netlify token matches
 */
export function detectNetlifyTokens(text: string): DetectorMatch[] {
  const matches: DetectorMatch[] = []
  // nf_ prefixed tokens (high confidence)
  const prefixedPattern = /\b(nf_[A-Za-z0-9_\-]{30,})\b/g
  matches.push(...scanWithRegex(text, prefixedPattern, "NETLIFY_TOKEN", 0.96))
  // Context-gated generic tokens
  const contextPattern = /(?:NETLIFY_AUTH_TOKEN|netlify_token|netlify[_\s]?auth)\s*[=:]\s*["']?([A-Za-z0-9_\-]{20,})/gi
  const regex = new RegExp(contextPattern.source, contextPattern.flags)
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    const tokenValue = match[1]
    if (!tokenValue.startsWith("nf_")) { // Avoid duplicate with prefix pattern
      matches.push({
        type: "NETLIFY_TOKEN",
        value: tokenValue,
        start: match.index + match[0].indexOf(tokenValue),
        end: match.index + match[0].indexOf(tokenValue) + tokenValue.length,
        confidence: 0.93,
      })
    }
  }
  return matches
}

/**
 * Detects database connection strings for MongoDB, PostgreSQL, MySQL, Redis, and MSSQL.
 * Boosts confidence when credentials (user:pass@host) are present in the URI.
 * @param text - Input text to scan
 * @returns Array of database connection string matches
 */
export function detectDBConnectionStrings(text: string): DetectorMatch[] {
  const pattern = /\b((?:mongodb(?:\+srv)?|postgresql|postgres|mysql|redis(?:s)?|mssql)(?:\+\w+)?:\/\/[^\s,;'"]+)/gi
  const raw = scanWithRegex(text, pattern, "DB_CONNECTION_STRING", 0.80)
  return raw.map((m) => {
    const hasCredentials = /\/\/[^/\s]+:[^/\s]+@/.test(m.value)
    return { ...m, confidence: hasCredentials ? 0.95 : 0.0 }
  }).filter((m) => m.confidence > 0)
}

/**
 * Detects URLs containing embedded basic auth credentials (user:password@host).
 * Supports http, https, ftp, and ftps schemes.
 * @param text - Input text to scan
 * @returns Array of basic auth URL matches
 */
export function detectBasicAuthURLs(text: string): DetectorMatch[] {
  const pattern = /\b((?:https?|ftp|ftps):\/\/[^\s:@\/]+:[^\s:@\/]+@[^\s\/]+(?:\/[^\s]*)?)/gi
  return scanWithRegex(text, pattern, "BASIC_AUTH_URL", 0.92)
}

/**
 * Detects Telegram bot tokens (numeric bot ID + colon + 35-char secret).
 * @param text - Input text to scan
 * @returns Array of Telegram token matches
 */
export function detectTelegramTokens(text: string): DetectorMatch[] {
  const pattern = /\b(\d{8,10}:[A-Za-z0-9_\-]{35})\b/g
  return scanWithRegex(text, pattern, "TELEGRAM_TOKEN", 0.96)
}

/**
 * Detects DigitalOcean personal access tokens (dop_v1_ prefix).
 * @param text - Input text to scan
 * @returns Array of DigitalOcean token matches
 */
export function detectDigitalOceanTokens(text: string): DetectorMatch[] {
  const pattern = /\b(dop_v1_[a-f0-9]{64})\b/g
  return scanWithRegex(text, pattern, "DIGITALOCEAN_TOKEN", 0.97)
}

/**
 * Detects npm access tokens (npm_ prefix).
 * @param text - Input text to scan
 * @returns Array of npm token matches
 */
export function detectNpmTokens(text: string): DetectorMatch[] {
  const pattern = /\b(npm_[A-Za-z0-9]{36})\b/g
  return scanWithRegex(text, pattern, "NPM_TOKEN", 0.97)
}

/**
 * Detects PyPI API tokens (pypi- prefix).
 * @param text - Input text to scan
 * @returns Array of PyPI token matches
 */
export function detectPyPITokens(text: string): DetectorMatch[] {
  const pattern = /\b(pypi-[A-Za-z0-9_\-]{50,})\b/g
  return scanWithRegex(text, pattern, "PYPI_TOKEN", 0.97)
}
