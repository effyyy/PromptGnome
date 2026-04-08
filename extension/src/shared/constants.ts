/**
 * Shared constants for the PromptGnome extension.
 *
 * Centralises every PII entity type the extension can detect, the AI provider
 * list, storage-key names, and category groupings.  All values are defined as
 * `as const` objects so they can be used both at the value level and as
 * type-level literals without TypeScript enums.
 */

// ---------------------------------------------------------------------------
// Pro availability flag
// ---------------------------------------------------------------------------

/**
 * Pro availability flag.
 *
 * PromptGnome Pro is currently in development and is NOT yet available.
 * This flag MUST remain `false` until Pro launches publicly. While `false`:
 *   - {@link license-manager.isPro} always resolves to `false`.
 *   - All Pro feature gates (auto-anonymize, backend NER, OCR, name detection)
 *     stay disabled regardless of any locally cached state.
 *   - The upgrade UI displays a "Coming Soon" waitlist call-to-action.
 *
 * Historical note: this constant was previously named for a launch promotion
 * that granted free Pro access. The promo has been retired — Pro is gated
 * behind a real release. Do not flip this flag without coordinating a
 * full Pro launch (billing, backend, support, docs).
 */
export const PROMO_ACTIVE = false;

// ---------------------------------------------------------------------------
// Pro waitlist destination
// ---------------------------------------------------------------------------

/**
 * Public URL of the Pro launch waitlist on the marketing site.
 *
 * Clicking any "Join the Pro Waitlist" CTA in the extension opens this URL
 * in a new tab. The page hosts an embedded Google Form; submissions are
 * delivered to the owner via Google Forms' native email notifications
 * (configured once in the Google Form UI — no backend involvement).
 *
 * Keep this in sync with the `#waitlist` anchor on `promptgnome/website/index.html`.
 */
export const WAITLIST_URL = "https://promptgnome.com/#waitlist";

// ---------------------------------------------------------------------------
// PII tier type
// ---------------------------------------------------------------------------

/** Tier determines whether a detection rule ships in the free or pro SKU. */
export type PIITier = "free" | "pro";

// ---------------------------------------------------------------------------
// PII entity type definition
// ---------------------------------------------------------------------------

/** Shape of a single PII type descriptor. */
export interface PIITypeDescriptor {
  /** Machine-readable identifier (matches the key in {@link PII_TYPES}). */
  readonly id: string;
  /** Human-readable label shown in the UI. */
  readonly label: string;
  /** Whether this type is available in the free or pro tier. */
  readonly tier: PIITier;
  /** Placeholder string injected when anonymising detected PII. */
  readonly placeholder: string;
}

// ---------------------------------------------------------------------------
// PII_TYPES – the canonical registry of every detectable entity type
// ---------------------------------------------------------------------------

/**
 * Canonical registry of every PII entity type the extension can detect.
 *
 * - **Tier 1 (free, high confidence):** regex-only detections that are
 *   extremely unlikely to false-positive.
 * - **Tier 2 (free, medium confidence):** regex-only but with a higher
 *   false-positive rate; may benefit from contextual scoring.
 * - **Tier 3 (pro, NER-dependent):** require a named-entity-recognition model
 *   and are only available in the pro tier.
 */
export const PII_TYPES = {
  // -- Tier 1: free, high confidence ----------------------------------------
  EMAIL: {
    id: "EMAIL",
    label: "Email Address",
    tier: "free",
    placeholder: "EMAIL",
  },
  SSN: {
    id: "SSN",
    label: "Social Security Number",
    tier: "free",
    placeholder: "SSN",
  },
  CREDIT_CARD: {
    id: "CREDIT_CARD",
    label: "Credit Card Number",
    tier: "free",
    placeholder: "CREDIT_CARD",
  },
  PHONE_US: {
    id: "PHONE_US",
    label: "US Phone Number",
    tier: "free",
    placeholder: "PHONE",
  },
  PHONE_INTL: {
    id: "PHONE_INTL",
    label: "International Phone Number",
    tier: "free",
    placeholder: "PHONE",
  },
  IPV4: {
    id: "IPV4",
    label: "IPv4 Address",
    tier: "free",
    placeholder: "IP",
  },
  IPV6: {
    id: "IPV6",
    label: "IPv6 Address",
    tier: "free",
    placeholder: "IP",
  },
  AWS_ACCESS_KEY: {
    id: "AWS_ACCESS_KEY",
    label: "AWS Access Key",
    tier: "free",
    placeholder: "API_KEY",
  },
  AWS_SECRET_KEY: {
    id: "AWS_SECRET_KEY",
    label: "AWS Secret Key",
    tier: "free",
    placeholder: "API_KEY",
  },
  GITHUB_TOKEN: {
    id: "GITHUB_TOKEN",
    label: "GitHub Token",
    tier: "free",
    placeholder: "API_KEY",
  },
  STRIPE_KEY: {
    id: "STRIPE_KEY",
    label: "Stripe API Key",
    tier: "free",
    placeholder: "API_KEY",
  },
  GENERIC_API_KEY: {
    id: "GENERIC_API_KEY",
    label: "API Key / Secret",
    tier: "free",
    placeholder: "API_KEY",
  },
  IBAN: {
    id: "IBAN",
    label: "IBAN",
    tier: "free",
    placeholder: "IBAN",
  },
  PASSPORT_US: {
    id: "PASSPORT_US",
    label: "US Passport Number",
    tier: "free",
    placeholder: "PASSPORT",
  },
  DRIVERS_LICENSE: {
    id: "DRIVERS_LICENSE",
    label: "Driver's License Number",
    tier: "free",
    placeholder: "LICENSE",
  },

  // -- Tier 2: free, medium confidence --------------------------------------
  ZIP_CODE: {
    id: "ZIP_CODE",
    label: "ZIP Code",
    tier: "free",
    placeholder: "ZIP",
  },
  DATE_OF_BIRTH: {
    id: "DATE_OF_BIRTH",
    label: "Date of Birth",
    tier: "free",
    placeholder: "DOB",
  },
  STREET_ADDRESS: {
    id: "STREET_ADDRESS",
    label: "Street Address",
    tier: "free",
    placeholder: "ADDRESS",
  },

  // -- Tier 3: NER-dependent (pro only) -------------------------------------
  PERSON_NAME: {
    id: "PERSON_NAME",
    label: "Person Name",
    tier: "pro",
    placeholder: "NAME",
  },
  ORGANIZATION: {
    id: "ORGANIZATION",
    label: "Organization",
    tier: "pro",
    placeholder: "COMPANY",
  },
  LOCATION: {
    id: "LOCATION",
    label: "Location",
    tier: "pro",
    placeholder: "LOCATION",
  },
  MEDICAL_TERM: {
    id: "MEDICAL_TERM",
    label: "Medical Term",
    tier: "pro",
    placeholder: "MEDICAL",
  },

  // -- Additional free-tier keys and tokens ----------------------------------
  OPENAI_KEY: {
    id: "OPENAI_KEY",
    label: "OpenAI API Key",
    tier: "free",
    placeholder: "API_KEY",
  },
  ANTHROPIC_KEY: {
    id: "ANTHROPIC_KEY",
    label: "Anthropic API Key",
    tier: "free",
    placeholder: "API_KEY",
  },
  GOOGLE_AI_KEY: {
    id: "GOOGLE_AI_KEY",
    label: "Google AI Key",
    tier: "free",
    placeholder: "API_KEY",
  },
  SLACK_TOKEN: {
    id: "SLACK_TOKEN",
    label: "Slack Token",
    tier: "free",
    placeholder: "API_KEY",
  },
  PRIVATE_KEY: {
    id: "PRIVATE_KEY",
    label: "Private Key (PEM)",
    tier: "free",
    placeholder: "PRIVATE_KEY",
  },
  JWT_TOKEN: {
    id: "JWT_TOKEN",
    label: "JWT Token",
    tier: "free",
    placeholder: "TOKEN",
  },
  CRYPTO_WALLET: {
    id: "CRYPTO_WALLET",
    label: "Crypto Wallet Address",
    tier: "free",
    placeholder: "CRYPTO",
  },

  // -- Additional pro-tier types ---------------------------------------------
  NATIONAL_ID: {
    id: "NATIONAL_ID",
    label: "National ID (non-US)",
    tier: "pro",
    placeholder: "NATIONAL_ID",
  },
  BANK_ACCOUNT: {
    id: "BANK_ACCOUNT",
    label: "Bank Account Number",
    tier: "pro",
    placeholder: "BANK_ACCT",
  },
  VIN: {
    id: "VIN",
    label: "Vehicle Identification Number",
    tier: "pro",
    placeholder: "VIN",
  },
  MEDICAL_LICENSE: {
    id: "MEDICAL_LICENSE",
    label: "Medical License / DEA / NPI",
    tier: "pro",
    placeholder: "MED_LICENSE",
  },

  // -- Contextual-only types (free, trigger-phrase detection) -----------------
  PASSWORD: {
    id: "PASSWORD",
    label: "Password",
    tier: "free",
    placeholder: "PASSWORD",
  },
  PIN: {
    id: "PIN",
    label: "PIN Code",
    tier: "free",
    placeholder: "PIN",
  },
  PASSPHRASE: {
    id: "PASSPHRASE",
    label: "Passphrase",
    tier: "free",
    placeholder: "PASSPHRASE",
  },
  SECRET: {
    id: "SECRET",
    label: "Secret / Key",
    tier: "free",
    placeholder: "SECRET",
  },
  USERNAME: {
    id: "USERNAME",
    label: "Username / Login",
    tier: "free",
    placeholder: "USERNAME",
  },
  ROUTING_NUMBER: {
    id: "ROUTING_NUMBER",
    label: "Bank Routing Number",
    tier: "free",
    placeholder: "ROUTING",
  },
  AGE: {
    id: "AGE",
    label: "Age",
    tier: "free",
    placeholder: "AGE",
  },

  // -- EU / International identifiers (free, regex-based) -------------------
  UK_NIN: {
    id: "UK_NIN",
    label: "UK National Insurance Number",
    tier: "free",
    placeholder: "UK_NIN",
  },
  DE_TAX_ID: {
    id: "DE_TAX_ID",
    label: "German Tax ID (Steuer-IdNr)",
    tier: "free",
    placeholder: "DE_TAX_ID",
  },
  FR_SSN: {
    id: "FR_SSN",
    label: "French Social Security Number",
    tier: "free",
    placeholder: "FR_SSN",
  },
  ES_DNI: {
    id: "ES_DNI",
    label: "Spanish DNI / NIE",
    tier: "free",
    placeholder: "ES_DNI",
  },
  IT_FISCAL_CODE: {
    id: "IT_FISCAL_CODE",
    label: "Italian Fiscal Code",
    tier: "free",
    placeholder: "IT_FISCAL",
  },
  NL_BSN: {
    id: "NL_BSN",
    label: "Dutch BSN (Citizen Service Number)",
    tier: "free",
    placeholder: "NL_BSN",
  },

  // -- Cloud & SaaS credentials -----------------------------------------------
  MAC_ADDRESS: {
    id: "MAC_ADDRESS",
    label: "MAC Address",
    tier: "free",
    placeholder: "MAC",
  },
  DB_CONNECTION_STRING: {
    id: "DB_CONNECTION_STRING",
    label: "Database Connection String",
    tier: "free",
    placeholder: "DB_URI",
  },
  BASIC_AUTH_URL: {
    id: "BASIC_AUTH_URL",
    label: "Basic Auth in URL",
    tier: "free",
    placeholder: "AUTH_URL",
  },
  AZURE_KEY: {
    id: "AZURE_KEY",
    label: "Azure Key/Connection String",
    tier: "free",
    placeholder: "API_KEY",
  },
  GCP_KEY: {
    id: "GCP_KEY",
    label: "GCP Credential",
    tier: "free",
    placeholder: "API_KEY",
  },
  TWILIO_KEY: {
    id: "TWILIO_KEY",
    label: "Twilio Credential",
    tier: "free",
    placeholder: "API_KEY",
  },
  SENDGRID_KEY: {
    id: "SENDGRID_KEY",
    label: "SendGrid API Key",
    tier: "free",
    placeholder: "API_KEY",
  },
  MAILGUN_KEY: {
    id: "MAILGUN_KEY",
    label: "Mailgun API Key",
    tier: "free",
    placeholder: "API_KEY",
  },
  DISCORD_TOKEN: {
    id: "DISCORD_TOKEN",
    label: "Discord Bot Token",
    tier: "free",
    placeholder: "API_KEY",
  },
  HEROKU_KEY: {
    id: "HEROKU_KEY",
    label: "Heroku API Key",
    tier: "free",
    placeholder: "API_KEY",
  },
  VERCEL_TOKEN: {
    id: "VERCEL_TOKEN",
    label: "Vercel Token",
    tier: "free",
    placeholder: "API_KEY",
  },
  NETLIFY_TOKEN: {
    id: "NETLIFY_TOKEN",
    label: "Netlify Token",
    tier: "free",
    placeholder: "API_KEY",
  },
  TELEGRAM_TOKEN: {
    id: "TELEGRAM_TOKEN",
    label: "Telegram Bot Token",
    tier: "free",
    placeholder: "API_KEY",
  },
  DIGITALOCEAN_TOKEN: {
    id: "DIGITALOCEAN_TOKEN",
    label: "DigitalOcean Token",
    tier: "free",
    placeholder: "API_KEY",
  },
  NPM_TOKEN: {
    id: "NPM_TOKEN",
    label: "npm Access Token",
    tier: "free",
    placeholder: "API_KEY",
  },
  PYPI_TOKEN: {
    id: "PYPI_TOKEN",
    label: "PyPI API Token",
    tier: "free",
    placeholder: "API_KEY",
  },
  CA_SIN: {
    id: "CA_SIN",
    label: "Canadian Social Insurance Number",
    tier: "free",
    placeholder: "SIN",
  },
  IN_AADHAAR: {
    id: "IN_AADHAAR",
    label: "India Aadhaar Number",
    tier: "free",
    placeholder: "AADHAAR",
  },
  SWIFT_BIC: {
    id: "SWIFT_BIC",
    label: "SWIFT/BIC Code",
    tier: "free",
    placeholder: "SWIFT",
  },
  US_EIN: {
    id: "US_EIN",
    label: "US Employer Identification Number",
    tier: "free",
    placeholder: "EIN",
  },

  // -- Additional credential types (free, prefix-based) -----------------------
  SHOPIFY_TOKEN: {
    id: "SHOPIFY_TOKEN",
    label: "Shopify Access Token",
    tier: "free",
    placeholder: "API_KEY",
  },
  DOCKER_TOKEN: {
    id: "DOCKER_TOKEN",
    label: "Docker Hub Token",
    tier: "free",
    placeholder: "API_KEY",
  },
  HUGGINGFACE_TOKEN: {
    id: "HUGGINGFACE_TOKEN",
    label: "HuggingFace Token",
    tier: "free",
    placeholder: "API_KEY",
  },
  SUPABASE_KEY: {
    id: "SUPABASE_KEY",
    label: "Supabase API Key",
    tier: "free",
    placeholder: "API_KEY",
  },
  VAULT_TOKEN: {
    id: "VAULT_TOKEN",
    label: "HashiCorp Vault Token",
    tier: "free",
    placeholder: "API_KEY",
  },
  CLOUDFLARE_TOKEN: {
    id: "CLOUDFLARE_TOKEN",
    label: "Cloudflare API Token",
    tier: "free",
    placeholder: "API_KEY",
  },
  SENTRY_TOKEN: {
    id: "SENTRY_TOKEN",
    label: "Sentry Auth Token",
    tier: "free",
    placeholder: "API_KEY",
  },
  GRAFANA_TOKEN: {
    id: "GRAFANA_TOKEN",
    label: "Grafana API Token",
    tier: "free",
    placeholder: "API_KEY",
  },
  LINEAR_KEY: {
    id: "LINEAR_KEY",
    label: "Linear API Key",
    tier: "free",
    placeholder: "API_KEY",
  },
  DATABRICKS_TOKEN: {
    id: "DATABRICKS_TOKEN",
    label: "Databricks Token",
    tier: "free",
    placeholder: "API_KEY",
  },
  POSTMAN_KEY: {
    id: "POSTMAN_KEY",
    label: "Postman API Key",
    tier: "free",
    placeholder: "API_KEY",
  },
  NOTION_TOKEN: {
    id: "NOTION_TOKEN",
    label: "Notion Integration Token",
    tier: "free",
    placeholder: "API_KEY",
  },
  AIRTABLE_TOKEN: {
    id: "AIRTABLE_TOKEN",
    label: "Airtable Token",
    tier: "free",
    placeholder: "API_KEY",
  },
  FIGMA_TOKEN: {
    id: "FIGMA_TOKEN",
    label: "Figma Access Token",
    tier: "free",
    placeholder: "API_KEY",
  },
  PLANETSCALE_TOKEN: {
    id: "PLANETSCALE_TOKEN",
    label: "PlanetScale Token",
    tier: "free",
    placeholder: "API_KEY",
  },
  FLYIO_TOKEN: {
    id: "FLYIO_TOKEN",
    label: "Fly.io Token",
    tier: "free",
    placeholder: "API_KEY",
  },
  RENDER_TOKEN: {
    id: "RENDER_TOKEN",
    label: "Render API Key",
    tier: "free",
    placeholder: "API_KEY",
  },
  DOPPLER_TOKEN: {
    id: "DOPPLER_TOKEN",
    label: "Doppler Service Token",
    tier: "free",
    placeholder: "API_KEY",
  },
  SQUARE_TOKEN: {
    id: "SQUARE_TOKEN",
    label: "Square Access Token",
    tier: "free",
    placeholder: "API_KEY",
  },
  LAUNCHDARKLY_KEY: {
    id: "LAUNCHDARKLY_KEY",
    label: "LaunchDarkly SDK Key",
    tier: "free",
    placeholder: "API_KEY",
  },
  ALGOLIA_KEY: {
    id: "ALGOLIA_KEY",
    label: "Algolia API Key",
    tier: "free",
    placeholder: "API_KEY",
  },
  CIRCLECI_TOKEN: {
    id: "CIRCLECI_TOKEN",
    label: "CircleCI Token",
    tier: "free",
    placeholder: "API_KEY",
  },
  CONFLUENT_KEY: {
    id: "CONFLUENT_KEY",
    label: "Confluent/Kafka Key",
    tier: "free",
    placeholder: "API_KEY",
  },
  NEWRELIC_KEY: {
    id: "NEWRELIC_KEY",
    label: "New Relic API Key",
    tier: "free",
    placeholder: "API_KEY",
  },
  DATADOG_KEY: {
    id: "DATADOG_KEY",
    label: "Datadog API Key",
    tier: "free",
    placeholder: "API_KEY",
  },

  // -- Additional international PII (free, regex-based) -----------------------
  AU_TFN: {
    id: "AU_TFN",
    label: "Australian Tax File Number",
    tier: "free",
    placeholder: "AU_TFN",
  },
  BR_CPF: {
    id: "BR_CPF",
    label: "Brazilian CPF",
    tier: "free",
    placeholder: "BR_CPF",
  },
  BR_CNPJ: {
    id: "BR_CNPJ",
    label: "Brazilian CNPJ",
    tier: "free",
    placeholder: "BR_CNPJ",
  },
  KR_RRN: {
    id: "KR_RRN",
    label: "South Korean Resident Registration Number",
    tier: "free",
    placeholder: "KR_RRN",
  },
  JP_MY_NUMBER: {
    id: "JP_MY_NUMBER",
    label: "Japanese My Number",
    tier: "free",
    placeholder: "JP_MYNUM",
  },
  PASSPORT_UK: {
    id: "PASSPORT_UK",
    label: "UK Passport Number",
    tier: "free",
    placeholder: "PASSPORT",
  },
  US_ROUTING: {
    id: "US_ROUTING",
    label: "US Bank Routing Number",
    tier: "free",
    placeholder: "ROUTING",
  },
  MEDICARE_MBI: {
    id: "MEDICARE_MBI",
    label: "Medicare Beneficiary Identifier",
    tier: "free",
    placeholder: "MEDICARE",
  },
  PT_NIF: {
    id: "PT_NIF",
    label: "Portuguese Tax ID (NIF)",
    tier: "free",
    placeholder: "PT_NIF",
  },
  PL_PESEL: {
    id: "PL_PESEL",
    label: "Polish PESEL Number",
    tier: "free",
    placeholder: "PL_PESEL",
  },
  CH_AHV: {
    id: "CH_AHV",
    label: "Swiss AHV/AVS Number",
    tier: "free",
    placeholder: "CH_AHV",
  },
  MX_CURP: {
    id: "MX_CURP",
    label: "Mexican CURP",
    tier: "free",
    placeholder: "MX_CURP",
  },
  IN_PAN: {
    id: "IN_PAN",
    label: "Indian PAN",
    tier: "free",
    placeholder: "IN_PAN",
  },
  CN_NATIONAL_ID: {
    id: "CN_NATIONAL_ID",
    label: "Chinese National ID",
    tier: "free",
    placeholder: "CN_ID",
  },
} as const satisfies Record<string, PIITypeDescriptor>;

// ---------------------------------------------------------------------------
// Detection modes
// ---------------------------------------------------------------------------

/**
 * User-selectable detection accuracy modes.
 * Controls which NER models are loaded alongside the regex engine.
 */
export const DETECTION_MODES = {
  SPEED: "speed",
  BALANCED: "balanced",
  MAXIMUM: "maximum",
} as const;

export type DetectionMode = (typeof DETECTION_MODES)[keyof typeof DETECTION_MODES];

// ---------------------------------------------------------------------------
// Provider names
// ---------------------------------------------------------------------------

/**
 * Machine-readable identifiers for each supported AI chat provider.
 *
 * The keys match the host-permission patterns declared in the extension
 * manifest.
 */
export const PROVIDER_NAMES = {
  CHATGPT: "CHATGPT",
  CLAUDE: "CLAUDE",
  GEMINI: "GEMINI",
  DEEPSEEK: "DEEPSEEK",
  PERPLEXITY: "PERPLEXITY",
  GROK: "GROK",
  COPILOT: "COPILOT",
  META_AI: "META_AI",
} as const;

// ---------------------------------------------------------------------------
// Storage / config key names
// ---------------------------------------------------------------------------

/**
 * Keys used when reading from or writing to `chrome.storage.local`.
 *
 * Keeping them in one place prevents typo-induced bugs.
 */
export const CONFIG_KEYS = {
  /** Per-type and per-provider enable/disable settings. */
  SETTINGS: "settings",
  /** Daily aggregated detection statistics. */
  STATS: "stats",
  /** Accuracy tallies for confirmed / rejected detections. */
  FEEDBACK: "feedback",
  /** Privacy-safe user reports describing missed PII patterns. */
  MISSED_PII_REPORTS: "missedPiiReports",
  /** Ordered list of audit-log entries. */
  AUDIT_LOG: "auditLog",
  /** Master protection on/off toggle. */
  PROTECTION_ENABLED: "protectionEnabled",
  /** User's chosen behaviour mode (warn, block, anonymise). */
  BEHAVIOR_MODE: "behaviorMode",
  /** Timestamp of initial install (ISO-8601). */
  INSTALL_DATE: "installDate",
  /** Whether the onboarding flow has been completed. */
  ONBOARDING_COMPLETE: "onboardingComplete",
  /** Buffered telemetry events awaiting aggregation. */
  TELEMETRY_BUFFER: "telemetryBuffer",
  /** Anonymous install UUID for sync deduplication. */
  TELEMETRY_INSTALL_ID: "telemetryInstallId",
  /** Last aggregated report sent (for transparency UI). */
  LAST_TELEMETRY_REPORT: "lastTelemetryReport",
  /** Signed detection config from server. */
  DETECTION_CONFIG: "detectionConfig",
  /** ISO timestamp of last successful sync. */
  LAST_SYNC_TIMESTAMP: "lastSyncTimestamp",
  /** Consecutive sync failure count. */
  SYNC_FAILURE_COUNT: "syncFailureCount",
  /** ISO timestamp of last sync attempt (success or fail). */
  LAST_SYNC_ATTEMPT: "lastSyncAttempt",
  /** Whether the user has consented to backend OCR file scanning. */
  OCR_BACKEND_CONSENT: "ocrBackendConsent",
  /** Running count of successful scans used to trigger the telemetry nudge. */
  TELEMETRY_NUDGE_SCAN_COUNT: "telemetry_nudge_scan_count",
  /** Set to true once the user has dismissed the telemetry opt-in nudge. */
  TELEMETRY_NUDGE_DISMISSED: "telemetry_nudge_dismissed",
  /** ISO date string of the last time a daily analytics event was sent. */
  ANALYTICS_LAST_DAILY: "analyticsLastDaily",
} as const;

// ---------------------------------------------------------------------------
// PII category groupings
// ---------------------------------------------------------------------------

/**
 * Logical groupings of PII types used to organise the settings UI.
 *
 * Each key is a human-readable category name and the value is an ordered
 * tuple of {@link PII_TYPES} keys that belong to that category.
 */
export const PII_CATEGORIES = {
  Financial: [
    "CREDIT_CARD",
    "IBAN",
    "STRIPE_KEY",
    "CRYPTO_WALLET",
    "BANK_ACCOUNT",
    "SQUARE_TOKEN",
    "US_ROUTING",
    "SHOPIFY_TOKEN",
    "ROUTING_NUMBER",
  ],
  Identity: [
    "SSN",
    "PASSPORT_US",
    "PASSPORT_UK",
    "DRIVERS_LICENSE",
    "DATE_OF_BIRTH",
    "PERSON_NAME",
    "NATIONAL_ID",
    "VIN",
    "UK_NIN",
    "DE_TAX_ID",
    "FR_SSN",
    "ES_DNI",
    "IT_FISCAL_CODE",
    "NL_BSN",
    "CA_SIN",
    "IN_AADHAAR",
    "US_EIN",
    "AU_TFN",
    "BR_CPF",
    "BR_CNPJ",
    "KR_RRN",
    "JP_MY_NUMBER",
    "PT_NIF",
    "PL_PESEL",
    "CH_AHV",
    "MX_CURP",
    "IN_PAN",
    "CN_NATIONAL_ID",
    "AGE",
  ],
  Contact: [
    "EMAIL",
    "PHONE_US",
    "PHONE_INTL",
  ],
  Developer: [
    "AWS_ACCESS_KEY",
    "AWS_SECRET_KEY",
    "GITHUB_TOKEN",
    "GENERIC_API_KEY",
    "IPV4",
    "IPV6",
    "OPENAI_KEY",
    "ANTHROPIC_KEY",
    "GOOGLE_AI_KEY",
    "SLACK_TOKEN",
    "PRIVATE_KEY",
    "JWT_TOKEN",
    "DOCKER_TOKEN",
    "HUGGINGFACE_TOKEN",
    "SUPABASE_KEY",
    "VAULT_TOKEN",
    "SENTRY_TOKEN",
    "GRAFANA_TOKEN",
    "LINEAR_KEY",
    "DATABRICKS_TOKEN",
    "POSTMAN_KEY",
    "FIGMA_TOKEN",
    "PLANETSCALE_TOKEN",
    "FLYIO_TOKEN",
    "RENDER_TOKEN",
    "DOPPLER_TOKEN",
    "LAUNCHDARKLY_KEY",
    "CIRCLECI_TOKEN",
    "NEWRELIC_KEY",
    "DATADOG_KEY",
    "NPM_TOKEN",
    "PYPI_TOKEN",
  ],
  Address: [
    "STREET_ADDRESS",
    "ZIP_CODE",
    "LOCATION",
  ],
  Health: [
    "MEDICAL_TERM",
    "MEDICAL_LICENSE",
    "MEDICARE_MBI",
  ],
  "Cloud & Infrastructure": [
    "AZURE_KEY",
    "GCP_KEY",
    "CLOUDFLARE_TOKEN",
    "DIGITALOCEAN_TOKEN",
    "HEROKU_KEY",
    "VERCEL_TOKEN",
    "NETLIFY_TOKEN",
    "DB_CONNECTION_STRING",
    "BASIC_AUTH_URL",
    "CONFLUENT_KEY",
    "ALGOLIA_KEY",
  ],
  Communication: [
    "TELEGRAM_TOKEN",
    "DISCORD_TOKEN",
    "TWILIO_KEY",
    "SENDGRID_KEY",
    "MAILGUN_KEY",
    "NOTION_TOKEN",
    "AIRTABLE_TOKEN",
  ],
  Professional: [
    "ORGANIZATION",
    "SWIFT_BIC",
    "MAC_ADDRESS",
  ],
  Credentials: [
    "PASSWORD",
    "PIN",
    "PASSPHRASE",
    "SECRET",
    "USERNAME",
  ],
} as const satisfies Record<string, readonly (keyof typeof PII_TYPES)[]>;

/**
 * Union of all PII category names.
 */
export type PIICategoryName = keyof typeof PII_CATEGORIES;

/**
 * Union of all provider name values.
 */
export type ProviderName = (typeof PROVIDER_NAMES)[keyof typeof PROVIDER_NAMES];

// ---------------------------------------------------------------------------
// Hostname → provider mapping
// ---------------------------------------------------------------------------

/**
 * Canonical hostname-to-provider map used by content scripts that need to
 * identify the current provider from `window.location.hostname`.
 *
 * This is the single source of truth — all content scripts (highlighter,
 * file-interceptor, etc.) should import this rather than maintaining their
 * own duplicate maps.
 *
 * The interceptor uses the adapter registry's `hostPatterns` regex instead,
 * which is fine — but scripts that only need a simple string lookup should
 * use this map.
 */
export const HOSTNAME_TO_PROVIDER: ReadonlyMap<string, ProviderName> = new Map([
  ["chatgpt.com", PROVIDER_NAMES.CHATGPT],
  ["chat.openai.com", PROVIDER_NAMES.CHATGPT],
  ["claude.ai", PROVIDER_NAMES.CLAUDE],
  ["gemini.google.com", PROVIDER_NAMES.GEMINI],
  ["chat.deepseek.com", PROVIDER_NAMES.DEEPSEEK],
  ["www.perplexity.ai", PROVIDER_NAMES.PERPLEXITY],
  ["perplexity.ai", PROVIDER_NAMES.PERPLEXITY],
  ["grok.com", PROVIDER_NAMES.GROK],
  ["x.com", PROVIDER_NAMES.GROK],
  ["copilot.microsoft.com", PROVIDER_NAMES.COPILOT],
  ["www.meta.ai", PROVIDER_NAMES.META_AI],
  ["meta.ai", PROVIDER_NAMES.META_AI],
]);
