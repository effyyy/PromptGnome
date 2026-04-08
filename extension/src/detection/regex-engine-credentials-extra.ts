/**
 * Additional cloud/SaaS credential detectors for popular services.
 * Covers: Shopify, Docker Hub, HuggingFace, Supabase, Hashicorp Vault,
 * Cloudflare, Sentry, Grafana, Linear, Databricks, Postman, Notion,
 * Airtable, Figma, PlanetScale, Fly.io, Render, Doppler, Square,
 * LaunchDarkly, Algolia, CircleCI, Confluent, New Relic, Datadog.
 * Architecture layer: Detection (credentials-extra sub-module)
 */

import { type DetectorMatch, scanWithRegex, hasContextTrigger } from "./regex-helpers"

/**
 * Detects Shopify access tokens (shpat_, shpca_, shppa_ prefixes).
 * @param text - Input text to scan
 * @returns Array of Shopify token matches
 */
export function detectShopifyTokens(text: string): DetectorMatch[] {
  const pattern = /\b(shp(?:at|ca|pa)_[a-fA-F0-9]{32,})\b/g
  return scanWithRegex(text, pattern, "SHOPIFY_TOKEN", 0.97)
}

/**
 * Detects Docker Hub personal access tokens (dckr_pat_ prefix).
 * @param text - Input text to scan
 * @returns Array of Docker token matches
 */
export function detectDockerTokens(text: string): DetectorMatch[] {
  const pattern = /\b(dckr_pat_[A-Za-z0-9_\-]{20,})\b/g
  return scanWithRegex(text, pattern, "DOCKER_TOKEN", 0.97)
}

/**
 * Detects HuggingFace API tokens (hf_ prefix).
 * @param text - Input text to scan
 * @returns Array of HuggingFace token matches
 */
export function detectHuggingFaceTokens(text: string): DetectorMatch[] {
  const pattern = /\b(hf_[A-Za-z0-9]{30,})\b/g
  return scanWithRegex(text, pattern, "HUGGINGFACE_TOKEN", 0.97)
}

/**
 * Detects Supabase API keys (sbp_ prefix for service keys, eyJ for anon/service JWT).
 * @param text - Input text to scan
 * @returns Array of Supabase key matches
 */
export function detectSupabaseKeys(text: string): DetectorMatch[] {
  const pattern = /\b(sbp_[a-f0-9]{40,})\b/g
  return scanWithRegex(text, pattern, "SUPABASE_KEY", 0.97)
}

/**
 * Detects HashiCorp Vault tokens (hvs. and hvb. prefixes).
 * @param text - Input text to scan
 * @returns Array of Vault token matches
 */
export function detectVaultTokens(text: string): DetectorMatch[] {
  const pattern = /\b(hv[sb]\.[A-Za-z0-9_\-]{20,})\b/g
  return scanWithRegex(text, pattern, "VAULT_TOKEN", 0.97)
}

/**
 * Detects Cloudflare API tokens and Global API keys.
 * @param text - Input text to scan
 * @returns Array of Cloudflare token matches
 */
export function detectCloudflareTokens(text: string): DetectorMatch[] {
  const matches: DetectorMatch[] = []
  // Only context-gated pattern: Cloudflare API token assignment
  const contextPattern = /(?:CF_API_TOKEN|CF_API_KEY|CLOUDFLARE_API_TOKEN|cloudflare[_\s]?(?:api[_\s]?)?(?:token|key)|X-Auth-Key)\s*[=:]\s*["']?([A-Za-z0-9_\-]{30,})/gi
  const regex = new RegExp(contextPattern.source, contextPattern.flags)
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    const keyValue = match[1]
    matches.push({
      type: "CLOUDFLARE_TOKEN",
      value: keyValue,
      start: match.index + match[0].indexOf(keyValue),
      end: match.index + match[0].indexOf(keyValue) + keyValue.length,
      confidence: 0.94,
    })
  }
  return matches
}

/**
 * Detects Sentry auth tokens (sntrys_ prefix).
 * @param text - Input text to scan
 * @returns Array of Sentry token matches
 */
export function detectSentryTokens(text: string): DetectorMatch[] {
  const pattern = /\b(sntrys_[A-Za-z0-9_\-]{20,})\b/g
  return scanWithRegex(text, pattern, "SENTRY_TOKEN", 0.97)
}

/**
 * Detects Grafana API tokens and service account tokens (glc_, glsa_ prefixes).
 * @param text - Input text to scan
 * @returns Array of Grafana token matches
 */
export function detectGrafanaTokens(text: string): DetectorMatch[] {
  const pattern = /\b(gl(?:c|sa)_[A-Za-z0-9_\-=]{20,})\b/g
  return scanWithRegex(text, pattern, "GRAFANA_TOKEN", 0.97)
}

/**
 * Detects Linear API keys (lin_api_ prefix).
 * @param text - Input text to scan
 * @returns Array of Linear API key matches
 */
export function detectLinearKeys(text: string): DetectorMatch[] {
  const pattern = /\b(lin_api_[A-Za-z0-9]{30,})\b/g
  return scanWithRegex(text, pattern, "LINEAR_KEY", 0.97)
}

/**
 * Detects Databricks personal access tokens (dapi prefix + 32 hex chars).
 * @param text - Input text to scan
 * @returns Array of Databricks token matches
 */
export function detectDatabricksTokens(text: string): DetectorMatch[] {
  const pattern = /\b(dapi[a-f0-9]{32})\b/g
  return scanWithRegex(text, pattern, "DATABRICKS_TOKEN", 0.96)
}

/**
 * Detects Postman API keys (PMAK- prefix).
 * @param text - Input text to scan
 * @returns Array of Postman key matches
 */
export function detectPostmanKeys(text: string): DetectorMatch[] {
  const pattern = /\b(PMAK-[A-Za-z0-9_\-]{40,})\b/g
  return scanWithRegex(text, pattern, "POSTMAN_KEY", 0.97)
}

/**
 * Detects Notion integration tokens (secret_ and ntn_ prefixes).
 * @param text - Input text to scan
 * @returns Array of Notion token matches
 */
export function detectNotionTokens(text: string): DetectorMatch[] {
  const matches: DetectorMatch[] = []
  // Notion internal integration token
  const secretPattern = /\b(secret_[A-Za-z0-9]{43})\b/g
  const raw = scanWithRegex(text, secretPattern, "NOTION_TOKEN", 0.90)
  for (const m of raw) {
    if (hasContextTrigger(text, m.start, ["notion", "NOTION_TOKEN", "notion_api"])) {
      matches.push({ ...m, confidence: 0.96 })
    }
  }
  // New ntn_ prefix
  const ntnPattern = /\b(ntn_[A-Za-z0-9]{40,})\b/g
  matches.push(...scanWithRegex(text, ntnPattern, "NOTION_TOKEN", 0.97))
  return matches
}

/**
 * Detects Airtable personal access tokens (pat prefix format).
 * @param text - Input text to scan
 * @returns Array of Airtable token matches
 */
export function detectAirtableTokens(text: string): DetectorMatch[] {
  const pattern = /\b(pat[A-Za-z0-9]{14}\.[a-f0-9]{64})\b/g
  return scanWithRegex(text, pattern, "AIRTABLE_TOKEN", 0.97)
}

/**
 * Detects Figma personal access tokens (figd_ prefix).
 * @param text - Input text to scan
 * @returns Array of Figma token matches
 */
export function detectFigmaTokens(text: string): DetectorMatch[] {
  const pattern = /\b(figd_[A-Za-z0-9_\-]{20,})\b/g
  return scanWithRegex(text, pattern, "FIGMA_TOKEN", 0.97)
}

/**
 * Detects PlanetScale database passwords and service tokens (pscale_ prefix).
 * @param text - Input text to scan
 * @returns Array of PlanetScale token matches
 */
export function detectPlanetScaleTokens(text: string): DetectorMatch[] {
  const pattern = /\b(pscale_(?:tkn|pw|oauth)_[A-Za-z0-9_\-]{20,})\b/g
  return scanWithRegex(text, pattern, "PLANETSCALE_TOKEN", 0.97)
}

/**
 * Detects Fly.io API tokens (FlyV1 prefix).
 * @param text - Input text to scan
 * @returns Array of Fly.io token matches
 */
export function detectFlyioTokens(text: string): DetectorMatch[] {
  const pattern = /\b(FlyV1\s+fm[12]_[A-Za-z0-9_\-]{20,})\b/g
  const matches = scanWithRegex(text, pattern, "FLYIO_TOKEN", 0.96)
  // Also match fo1_ format
  const fo1Pattern = /\b(fo1_[A-Za-z0-9_\-]{30,})\b/g
  matches.push(...scanWithRegex(text, fo1Pattern, "FLYIO_TOKEN", 0.96))
  return matches
}

/**
 * Detects Render API keys (rnd_ prefix).
 * @param text - Input text to scan
 * @returns Array of Render token matches
 */
export function detectRenderTokens(text: string): DetectorMatch[] {
  const pattern = /\b(rnd_[A-Za-z0-9]{30,})\b/g
  return scanWithRegex(text, pattern, "RENDER_TOKEN", 0.96)
}

/**
 * Detects Doppler service tokens (dp.st. and dp.pt. prefixes).
 * @param text - Input text to scan
 * @returns Array of Doppler token matches
 */
export function detectDopplerTokens(text: string): DetectorMatch[] {
  const pattern = /\b(dp\.[sp]t\.[A-Za-z0-9_\-]{20,})\b/g
  return scanWithRegex(text, pattern, "DOPPLER_TOKEN", 0.97)
}

/**
 * Detects Square access tokens and OAuth tokens (sq0atp-, sq0csp-, EAAA prefixes).
 * @param text - Input text to scan
 * @returns Array of Square token matches
 */
export function detectSquareTokens(text: string): DetectorMatch[] {
  const matches: DetectorMatch[] = []
  // Sandbox/production access tokens
  const accessPattern = /\b(sq0atp-[A-Za-z0-9_\-]{22,})\b/g
  matches.push(...scanWithRegex(text, accessPattern, "SQUARE_TOKEN", 0.97))
  // Application secret
  const secretPattern = /\b(sq0csp-[A-Za-z0-9_\-]{40,})\b/g
  matches.push(...scanWithRegex(text, secretPattern, "SQUARE_TOKEN", 0.97))
  // OAuth token
  const oauthPattern = /\b(EAAA[A-Za-z0-9]{40,})\b/g
  const raw = scanWithRegex(text, oauthPattern, "SQUARE_TOKEN", 0.60)
  for (const m of raw) {
    if (hasContextTrigger(text, m.start, ["square", "squareup", "square_token"])) {
      matches.push({ ...m, confidence: 0.93 })
    }
  }
  return matches
}

/**
 * Detects LaunchDarkly SDK keys and API tokens.
 * @param text - Input text to scan
 * @returns Array of LaunchDarkly key matches
 */
export function detectLaunchDarklyKeys(text: string): DetectorMatch[] {
  // SDK key format: sdk-{hex}-{hex}
  const pattern = /\b(sdk-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\b/g
  const matches = scanWithRegex(text, pattern, "LAUNCHDARKLY_KEY", 0.96)
  // API access token
  const apiPattern = /\b(api-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\b/g
  matches.push(...scanWithRegex(text, apiPattern, "LAUNCHDARKLY_KEY", 0.96))
  return matches
}

/**
 * Detects Algolia API keys (admin or search keys with context).
 * @param text - Input text to scan
 * @returns Array of Algolia key matches
 */
export function detectAlgoliaKeys(text: string): DetectorMatch[] {
  const pattern = /(?:ALGOLIA_(?:API_KEY|ADMIN_KEY|SEARCH_KEY)|algolia[_\s]?(?:api[_\s]?)?key)\s*[=:]\s*["']?([a-f0-9]{32})/gi
  const matches: DetectorMatch[] = []
  const regex = new RegExp(pattern.source, pattern.flags)
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    const keyValue = match[1]
    matches.push({
      type: "ALGOLIA_KEY",
      value: keyValue,
      start: match.index + match[0].indexOf(keyValue),
      end: match.index + match[0].indexOf(keyValue) + keyValue.length,
      confidence: 0.94,
    })
  }
  return matches
}

/**
 * Detects CircleCI personal API tokens.
 * @param text - Input text to scan
 * @returns Array of CircleCI token matches
 */
export function detectCircleCITokens(text: string): DetectorMatch[] {
  // v2 API tokens have a specific CCIPAT_ prefix — high confidence
  const pattern = /\b(CCIPAT_[A-Za-z0-9_]{40,})\b/g
  const matches = scanWithRegex(text, pattern, "CIRCLECI_TOKEN", 0.97)
  // Legacy v1 format: ONLY match via CIRCLE_TOKEN= assignment (40-hex alone is too broad — matches git SHAs)
  const legacyPattern = /(?:CIRCLE_TOKEN|circleci[_\s]?token|circle[_\s]?ci[_\s]?token)\s*[=:]\s*["']?([a-f0-9]{40})/gi
  const regex = new RegExp(legacyPattern.source, legacyPattern.flags)
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    const tokenValue = match[1]
    matches.push({
      type: "CIRCLECI_TOKEN",
      value: tokenValue,
      start: match.index + match[0].indexOf(tokenValue),
      end: match.index + match[0].indexOf(tokenValue) + tokenValue.length,
      confidence: 0.93,
    })
  }
  return matches
}

/**
 * Detects Confluent/Kafka API keys and secrets.
 * @param text - Input text to scan
 * @returns Array of Confluent key matches
 */
export function detectConfluentKeys(text: string): DetectorMatch[] {
  const pattern = /(?:CONFLUENT_(?:API_KEY|API_SECRET|CLOUD_API_KEY)|kafka[_\s]?(?:api[_\s]?)?(?:key|secret))\s*[=:]\s*["']?([A-Za-z0-9+/]{16,})/gi
  const matches: DetectorMatch[] = []
  const regex = new RegExp(pattern.source, pattern.flags)
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    const keyValue = match[1]
    matches.push({
      type: "CONFLUENT_KEY",
      value: keyValue,
      start: match.index + match[0].indexOf(keyValue),
      end: match.index + match[0].indexOf(keyValue) + keyValue.length,
      confidence: 0.93,
    })
  }
  return matches
}

/**
 * Detects New Relic API keys (NRAK- prefix) and license keys.
 * @param text - Input text to scan
 * @returns Array of New Relic key matches
 */
export function detectNewRelicKeys(text: string): DetectorMatch[] {
  const matches: DetectorMatch[] = []
  // User/REST API key
  const apiKeyPattern = /\b(NRAK-[A-Z0-9]{27})\b/g
  matches.push(...scanWithRegex(text, apiKeyPattern, "NEWRELIC_KEY", 0.98))
  // Ingest/license key (NRII or NR-prefixed, or 40-hex with context)
  const ingestPattern = /\b(NR(?:I[ILBR])-[A-Za-z0-9_\-]{32,})\b/g
  matches.push(...scanWithRegex(text, ingestPattern, "NEWRELIC_KEY", 0.96))
  return matches
}

/**
 * Detects Datadog API keys and application keys.
 * @param text - Input text to scan
 * @returns Array of Datadog key matches
 */
export function detectDatadogKeys(text: string): DetectorMatch[] {
  const pattern = /(?:DD_API_KEY|DD_APP_KEY|DATADOG_API_KEY|DATADOG_APP_KEY|datadog[_\s]?(?:api|app)[_\s]?key)\s*[=:]\s*["']?([a-f0-9]{32,40})/gi
  const matches: DetectorMatch[] = []
  const regex = new RegExp(pattern.source, pattern.flags)
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    const keyValue = match[1]
    matches.push({
      type: "DATADOG_KEY",
      value: keyValue,
      start: match.index + match[0].indexOf(keyValue),
      end: match.index + match[0].indexOf(keyValue) + keyValue.length,
      confidence: 0.94,
    })
  }
  return matches
}
