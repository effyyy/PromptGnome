/**
 * Comprehensive tests for the additional cloud/SaaS credential detectors.
 * Covers all 25 detector functions in regex-engine-credentials-extra.ts.
 * Uses synthetic/fake data only — never real credentials.
 */
import { describe, it, expect } from "vitest"

import {
  detectShopifyTokens,
  detectDockerTokens,
  detectHuggingFaceTokens,
  detectSupabaseKeys,
  detectVaultTokens,
  detectCloudflareTokens,
  detectSentryTokens,
  detectGrafanaTokens,
  detectLinearKeys,
  detectDatabricksTokens,
  detectPostmanKeys,
  detectNotionTokens,
  detectAirtableTokens,
  detectFigmaTokens,
  detectPlanetScaleTokens,
  detectFlyioTokens,
  detectRenderTokens,
  detectDopplerTokens,
  detectSquareTokens,
  detectLaunchDarklyKeys,
  detectAlgoliaKeys,
  detectCircleCITokens,
  detectConfluentKeys,
  detectNewRelicKeys,
  detectDatadogKeys,
} from "../../src/detection/regex-engine-credentials-extra"

// ─── SHOPIFY ──────────────────────────────────────────────────────────

// Shopify token fixtures � constructed at runtime to avoid literal pattern scanning
const SHOPIFY_ACCESS  = "shpa" + "t_" + "aabbccdd11223344aabbccdd11223344"
const SHOPIFY_CUSTOM  = "shpc" + "a_" + "00112233445566778899aabbccddeeff"
const SHOPIFY_PRIVATE = "shpp" + "a_" + "ffeeddccbbaa99887766554433221100"

describe("detectShopifyTokens", () => {
  it("should detect shpat_ access token", () => {
    const matches = detectShopifyTokens(`token=${SHOPIFY_ACCESS}`)
    expect(matches).toHaveLength(1)
    expect(matches[0].value).toBe(SHOPIFY_ACCESS)
    expect(matches[0].type).toBe("SHOPIFY_TOKEN")
  })

  it("should detect shpca_ custom app token", () => {
    const matches = detectShopifyTokens(SHOPIFY_CUSTOM)
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("SHOPIFY_TOKEN")
    expect(matches[0].confidence).toBe(0.97)
  })

  it("should detect shppa_ private app token", () => {
    const matches = detectShopifyTokens(SHOPIFY_PRIVATE)
    expect(matches).toHaveLength(1)
    expect(matches[0].value).toBe(SHOPIFY_PRIVATE)
  })

  it("should return empty array for non-matching text", () => {
    expect(detectShopifyTokens("no token here")).toHaveLength(0)
  })

  it("should return empty for token with too short hex portion", () => {
    // Less than 32 hex chars after prefix
    expect(detectShopifyTokens("shpat_abc123")).toHaveLength(0)
  })

  it("should detect multiple tokens in one text", () => {
    const text = `a=${SHOPIFY_ACCESS} b=${SHOPIFY_CUSTOM}`
    expect(detectShopifyTokens(text)).toHaveLength(2)
  })
})

// ─── DOCKER ───────────────────────────────────────────────────────────

describe("detectDockerTokens", () => {
  it("should detect dckr_pat_ token", () => {
    const matches = detectDockerTokens("DOCKER_TOKEN=dckr_pat_abcDEF123456789_xYz-0987654321")
    expect(matches).toHaveLength(1)
    expect(matches[0].value).toBe("dckr_pat_abcDEF123456789_xYz-0987654321")
    expect(matches[0].type).toBe("DOCKER_TOKEN")
  })

  it("should set confidence to 0.97", () => {
    const matches = detectDockerTokens("dckr_pat_TestToken1234567890ABCD")
    expect(matches[0].confidence).toBe(0.97)
  })

  it("should return empty array for unrelated text", () => {
    expect(detectDockerTokens("docker pull ubuntu:latest")).toHaveLength(0)
  })

  it("should return empty when suffix is too short", () => {
    expect(detectDockerTokens("dckr_pat_short")).toHaveLength(0)
  })
})

// ─── HUGGINGFACE ──────────────────────────────────────────────────────

describe("detectHuggingFaceTokens", () => {
  it("should detect hf_ token of at least 30 alphanumeric chars", () => {
    const matches = detectHuggingFaceTokens("HF_TOKEN=hf_abcdefghijklmnopqrstuvwxyz1234")
    expect(matches).toHaveLength(1)
    expect(matches[0].value).toBe("hf_abcdefghijklmnopqrstuvwxyz1234")
    expect(matches[0].type).toBe("HUGGINGFACE_TOKEN")
  })

  it("should set confidence to 0.97", () => {
    const matches = detectHuggingFaceTokens("hf_ABCDEFGHIJKLMNOPQRSTUVWXYZ1234")
    expect(matches[0].confidence).toBe(0.97)
  })

  it("should return empty when suffix is too short", () => {
    expect(detectHuggingFaceTokens("hf_tooshort")).toHaveLength(0)
  })

  it("should return empty for unrelated text", () => {
    expect(detectHuggingFaceTokens("no credentials here")).toHaveLength(0)
  })
})

// ─── SUPABASE ─────────────────────────────────────────────────────────

describe("detectSupabaseKeys", () => {
  it("should detect sbp_ service key", () => {
    const hex40 = "a".repeat(40)
    const matches = detectSupabaseKeys(`SUPABASE_KEY=sbp_${hex40}`)
    expect(matches).toHaveLength(1)
    expect(matches[0].value).toBe(`sbp_${hex40}`)
    expect(matches[0].type).toBe("SUPABASE_KEY")
  })

  it("should set confidence to 0.97", () => {
    const hex40 = "b1c2d3e4f5".repeat(4)
    const matches = detectSupabaseKeys(`sbp_${hex40}`)
    expect(matches[0].confidence).toBe(0.97)
  })

  it("should return empty for non-hex chars after sbp_", () => {
    expect(detectSupabaseKeys("sbp_ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ")).toHaveLength(0)
  })

  it("should return empty when key is too short", () => {
    expect(detectSupabaseKeys("sbp_abc123")).toHaveLength(0)
  })

  it("should return empty for unrelated text", () => {
    expect(detectSupabaseKeys("supabase project url here")).toHaveLength(0)
  })
})

// ─── VAULT ────────────────────────────────────────────────────────────

describe("detectVaultTokens", () => {
  it("should detect hvs. service token", () => {
    const matches = detectVaultTokens("VAULT_TOKEN=hvs.AaBbCcDdEeFf0011223344556677")
    expect(matches).toHaveLength(1)
    expect(matches[0].value).toBe("hvs.AaBbCcDdEeFf0011223344556677")
    expect(matches[0].type).toBe("VAULT_TOKEN")
  })

  it("should detect hvb. batch token", () => {
    const matches = detectVaultTokens("hvb.TestBatchTokenXYZ_abcdef-0123456789")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("VAULT_TOKEN")
  })

  it("should set confidence to 0.97", () => {
    const matches = detectVaultTokens("hvs.AABBCCDD11223344AABBCCDD112233")
    expect(matches[0].confidence).toBe(0.97)
  })

  it("should return empty for tokens that are too short", () => {
    expect(detectVaultTokens("hvs.tooshort")).toHaveLength(0)
  })

  it("should return empty for unrelated text", () => {
    expect(detectVaultTokens("vault docs: https://vault.io/docs")).toHaveLength(0)
  })
})

// ─── CLOUDFLARE ───────────────────────────────────────────────────────

describe("detectCloudflareTokens", () => {
  it("should detect token via CF_API_TOKEN= assignment", () => {
    const token = "A".repeat(20) + "b".repeat(20)
    const text = `CF_API_TOKEN=${token}`
    const matches = detectCloudflareTokens(text)
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("CLOUDFLARE_TOKEN")
    expect(matches[0].confidence).toBe(0.94)
  })

  it("should not return token without cloudflare assignment keyword", () => {
    const token = "A".repeat(20) + "b".repeat(20)
    const matches = detectCloudflareTokens(`api_key=${token}`)
    expect(matches).toHaveLength(0)
  })

  it("should detect global API key via CF_API_KEY= prefix", () => {
    const hexKey = "a1b2c3d4e5f6".repeat(3) + "a"  // 37 hex chars
    const matches = detectCloudflareTokens(`CF_API_KEY=${hexKey}`)
    expect(matches).toHaveLength(1)
    expect(matches[0].value).toBe(hexKey)
    expect(matches[0].confidence).toBe(0.94)
  })

  it("should detect via cloudflare_api_token= format", () => {
    const token = "A".repeat(30)
    const matches = detectCloudflareTokens(`cloudflare_api_token=${token}`)
    expect(matches).toHaveLength(1)
  })

  it("should detect global API key via X-Auth-Key header", () => {
    const hexKey = "0".repeat(37)
    const matches = detectCloudflareTokens(`X-Auth-Key: ${hexKey}`)
    expect(matches).toHaveLength(1)
    expect(matches[0].value).toBe(hexKey)
  })

  it("should return empty for unrelated text", () => {
    expect(detectCloudflareTokens("hello world")).toHaveLength(0)
  })
})

// ─── SENTRY ───────────────────────────────────────────────────────────

describe("detectSentryTokens", () => {
  it("should detect sntrys_ auth token", () => {
    const matches = detectSentryTokens("SENTRY_AUTH_TOKEN=sntrys_AbCd1234EfGh5678IjKl90MnOp")
    expect(matches).toHaveLength(1)
    expect(matches[0].value).toBe("sntrys_AbCd1234EfGh5678IjKl90MnOp")
    expect(matches[0].type).toBe("SENTRY_TOKEN")
  })

  it("should set confidence to 0.97", () => {
    const matches = detectSentryTokens("sntrys_AABBCCDDEEFF00112233445566778899")
    expect(matches[0].confidence).toBe(0.97)
  })

  it("should return empty when suffix is too short", () => {
    expect(detectSentryTokens("sntrys_tooshort")).toHaveLength(0)
  })

  it("should return empty for unrelated text", () => {
    expect(detectSentryTokens("sentry.io docs page")).toHaveLength(0)
  })
})

// ─── GRAFANA ──────────────────────────────────────────────────────────

describe("detectGrafanaTokens", () => {
  it("should detect glc_ API token", () => {
    // Note: \b stops at '=' since '=' is not a word char; the trailing '==' is excluded
    const matches = detectGrafanaTokens("GRAFANA_TOKEN=glc_AABBCCDDEEFF001122334455")
    expect(matches).toHaveLength(1)
    expect(matches[0].value).toBe("glc_AABBCCDDEEFF001122334455")
    expect(matches[0].type).toBe("GRAFANA_TOKEN")
  })

  it("should detect glsa_ service account token", () => {
    const matches = detectGrafanaTokens("token: glsa_TestServiceAccount_abcdef123456")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("GRAFANA_TOKEN")
  })

  it("should set confidence to 0.97", () => {
    const matches = detectGrafanaTokens("glc_ABCDEFGHIJKLMNOPQRSTUabcdef")
    expect(matches[0].confidence).toBe(0.97)
  })

  it("should return empty when token is too short", () => {
    expect(detectGrafanaTokens("glc_short")).toHaveLength(0)
  })

  it("should return empty for unrelated text", () => {
    expect(detectGrafanaTokens("grafana dashboard url")).toHaveLength(0)
  })
})

// ─── LINEAR ───────────────────────────────────────────────────────────

describe("detectLinearKeys", () => {
  it("should detect lin_api_ key", () => {
    // Suffix requires 30+ alphanumeric chars; use 30 chars exactly
    const matches = detectLinearKeys("LINEAR_API_KEY=lin_api_AbCdEfGhIjKlMnOpQrStUvWxYz1234")
    expect(matches).toHaveLength(1)
    expect(matches[0].value).toBe("lin_api_AbCdEfGhIjKlMnOpQrStUvWxYz1234")
    expect(matches[0].type).toBe("LINEAR_KEY")
  })

  it("should set confidence to 0.97", () => {
    const matches = detectLinearKeys("lin_api_AABBCCDDEEFF001122334455667788")
    expect(matches[0].confidence).toBe(0.97)
  })

  it("should return empty when suffix is too short", () => {
    expect(detectLinearKeys("lin_api_tooshort")).toHaveLength(0)
  })

  it("should return empty for unrelated text", () => {
    expect(detectLinearKeys("linear project management")).toHaveLength(0)
  })
})

// ─── DATABRICKS ───────────────────────────────────────────────────────

describe("detectDatabricksTokens", () => {
  it("should detect dapi token with 32 hex chars", () => {
    const hexToken = "dapi" + "a1b2c3d4".repeat(4)  // dapi + 32 hex chars
    const matches = detectDatabricksTokens(`DATABRICKS_TOKEN=${hexToken}`)
    expect(matches).toHaveLength(1)
    expect(matches[0].value).toBe(hexToken)
    expect(matches[0].type).toBe("DATABRICKS_TOKEN")
  })

  it("should set confidence to 0.96", () => {
    const hexToken = "dapi" + "0".repeat(32)
    const matches = detectDatabricksTokens(hexToken)
    expect(matches[0].confidence).toBe(0.96)
  })

  it("should not match dapi with fewer than 32 hex chars", () => {
    expect(detectDatabricksTokens("dapi" + "abc123")).toHaveLength(0)
  })

  it("should not match dapi with non-hex chars", () => {
    expect(detectDatabricksTokens("dapiZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ")).toHaveLength(0)
  })

  it("should return empty for unrelated text", () => {
    expect(detectDatabricksTokens("databricks cluster docs")).toHaveLength(0)
  })
})

// ─── POSTMAN ──────────────────────────────────────────────────────────

describe("detectPostmanKeys", () => {
  it("should detect PMAK- key", () => {
    const key = "PMAK-" + "A".repeat(20) + "-" + "b".repeat(20)
    const matches = detectPostmanKeys(`POSTMAN_API_KEY=${key}`)
    expect(matches).toHaveLength(1)
    expect(matches[0].value).toBe(key)
    expect(matches[0].type).toBe("POSTMAN_KEY")
  })

  it("should set confidence to 0.97", () => {
    const key = "PMAK-" + "X".repeat(40)
    const matches = detectPostmanKeys(key)
    expect(matches[0].confidence).toBe(0.97)
  })

  it("should return empty when key is too short", () => {
    expect(detectPostmanKeys("PMAK-tooshort")).toHaveLength(0)
  })

  it("should return empty for unrelated text", () => {
    expect(detectPostmanKeys("postman collection v2")).toHaveLength(0)
  })
})

// ─── NOTION ───────────────────────────────────────────────────────────

describe("detectNotionTokens", () => {
  it("should detect secret_ token when notion context is present", () => {
    // secret_ followed by exactly 43 alphanumeric chars
    const tokenVal = "A".repeat(43)
    const text = `notion api token: secret_${tokenVal}`
    const matches = detectNotionTokens(text)
    expect(matches.length).toBeGreaterThanOrEqual(1)
    expect(matches[0].type).toBe("NOTION_TOKEN")
    expect(matches[0].confidence).toBe(0.96)
  })

  it("should not return secret_ token without notion context", () => {
    const tokenVal = "B".repeat(43)
    const matches = detectNotionTokens(`key=secret_${tokenVal}`)
    // No notion context → should not be included
    expect(matches).toHaveLength(0)
  })

  it("should detect ntn_ token without context requirement", () => {
    const tokenVal = "C".repeat(40)
    const matches = detectNotionTokens(`ntn_${tokenVal}`)
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("NOTION_TOKEN")
    expect(matches[0].confidence).toBe(0.97)
  })

  it("should return empty for unrelated text", () => {
    expect(detectNotionTokens("notion page title")).toHaveLength(0)
  })
})

// ─── AIRTABLE ─────────────────────────────────────────────────────────

describe("detectAirtableTokens", () => {
  it("should detect pat token in correct format", () => {
    // pat + 14 alphanumeric + dot + 64 hex chars
    const suffix14 = "AbCdEfGhIjKlMn"
    const hex64 = "a1b2".repeat(16)
    const token = `pat${suffix14}.${hex64}`
    const matches = detectAirtableTokens(`AIRTABLE_TOKEN=${token}`)
    expect(matches).toHaveLength(1)
    expect(matches[0].value).toBe(token)
    expect(matches[0].type).toBe("AIRTABLE_TOKEN")
  })

  it("should set confidence to 0.97", () => {
    const suffix14 = "Z".repeat(14)
    const hex64 = "f".repeat(64)
    const token = `pat${suffix14}.${hex64}`
    const matches = detectAirtableTokens(token)
    expect(matches[0].confidence).toBe(0.97)
  })

  it("should return empty when suffix14 is wrong length", () => {
    const hex64 = "a".repeat(64)
    expect(detectAirtableTokens(`patTooShort.${hex64}`)).toHaveLength(0)
  })

  it("should return empty for unrelated text", () => {
    expect(detectAirtableTokens("airtable base id example")).toHaveLength(0)
  })
})

// ─── FIGMA ────────────────────────────────────────────────────────────

describe("detectFigmaTokens", () => {
  it("should detect figd_ token", () => {
    const matches = detectFigmaTokens("FIGMA_TOKEN=figd_AbCd1234EfGh5678IjKl_90Mn")
    expect(matches).toHaveLength(1)
    expect(matches[0].value).toBe("figd_AbCd1234EfGh5678IjKl_90Mn")
    expect(matches[0].type).toBe("FIGMA_TOKEN")
  })

  it("should set confidence to 0.97", () => {
    const matches = detectFigmaTokens("figd_AABBCCDDEEFF001122334455667788")
    expect(matches[0].confidence).toBe(0.97)
  })

  it("should return empty when suffix is too short", () => {
    expect(detectFigmaTokens("figd_short")).toHaveLength(0)
  })

  it("should return empty for unrelated text", () => {
    expect(detectFigmaTokens("figma design file url")).toHaveLength(0)
  })
})

// ─── PLANETSCALE ──────────────────────────────────────────────────────

describe("detectPlanetScaleTokens", () => {
  it("should detect pscale_tkn_ token", () => {
    const matches = detectPlanetScaleTokens("pscale_tkn_AbCd1234EfGh5678IjKl_90MnOp")
    expect(matches).toHaveLength(1)
    expect(matches[0].value).toBe("pscale_tkn_AbCd1234EfGh5678IjKl_90MnOp")
    expect(matches[0].type).toBe("PLANETSCALE_TOKEN")
  })

  it("should detect pscale_pw_ token", () => {
    const matches = detectPlanetScaleTokens("DB_PASS=pscale_pw_TestPassword1234567890ABCDEF")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("PLANETSCALE_TOKEN")
  })

  it("should detect pscale_oauth_ token", () => {
    const matches = detectPlanetScaleTokens("pscale_oauth_OAuthTokenValue1234567890ABCDE")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("PLANETSCALE_TOKEN")
  })

  it("should set confidence to 0.97", () => {
    const matches = detectPlanetScaleTokens("pscale_tkn_AABBCCDDEEFF001122334455")
    expect(matches[0].confidence).toBe(0.97)
  })

  it("should return empty for unrecognized pscale_ subtype", () => {
    expect(detectPlanetScaleTokens("pscale_bad_SomeTokenValue1234567890ABCDEF")).toHaveLength(0)
  })

  it("should return empty for unrelated text", () => {
    expect(detectPlanetScaleTokens("planetscale dashboard")).toHaveLength(0)
  })
})

// ─── FLY.IO ───────────────────────────────────────────────────────────

describe("detectFlyioTokens", () => {
  it("should detect FlyV1 fm1_ token", () => {
    const matches = detectFlyioTokens("FLY_API_TOKEN=FlyV1 fm1_AbCdEfGhIjKlMnOpQrStUvWxYz")
    expect(matches).toHaveLength(1)
    expect(matches[0].value).toBe("FlyV1 fm1_AbCdEfGhIjKlMnOpQrStUvWxYz")
    expect(matches[0].type).toBe("FLYIO_TOKEN")
  })

  it("should detect FlyV1 fm2_ token", () => {
    const matches = detectFlyioTokens("FlyV1 fm2_TestTokenValue1234567890ABCDE")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("FLYIO_TOKEN")
  })

  it("should detect fo1_ format token", () => {
    const matches = detectFlyioTokens("fo1_AbCdEfGhIjKlMnOpQrStUvWxYz1234567890")
    expect(matches).toHaveLength(1)
    expect(matches[0].value).toBe("fo1_AbCdEfGhIjKlMnOpQrStUvWxYz1234567890")
    expect(matches[0].type).toBe("FLYIO_TOKEN")
  })

  it("should set confidence to 0.96 for FlyV1 format", () => {
    const matches = detectFlyioTokens("FlyV1 fm1_AABBCCDDEEFF001122334455667788")
    expect(matches[0].confidence).toBe(0.96)
  })

  it("should set confidence to 0.96 for fo1_ format", () => {
    const matches = detectFlyioTokens("fo1_AABBCCDDEEFF001122334455667788XX")
    expect(matches[0].confidence).toBe(0.96)
  })

  it("should return empty for unrelated text", () => {
    expect(detectFlyioTokens("fly deploy --app myapp")).toHaveLength(0)
  })
})

// ─── RENDER ───────────────────────────────────────────────────────────

describe("detectRenderTokens", () => {
  it("should detect rnd_ token", () => {
    // Suffix requires 30+ alphanumeric chars; use 32 chars exactly
    const matches = detectRenderTokens("RENDER_API_KEY=rnd_AbCdEfGhIjKlMnOpQrStUvWxYz0123")
    expect(matches).toHaveLength(1)
    expect(matches[0].value).toBe("rnd_AbCdEfGhIjKlMnOpQrStUvWxYz0123")
    expect(matches[0].type).toBe("RENDER_TOKEN")
  })

  it("should set confidence to 0.96", () => {
    // 32 alphanumeric chars after rnd_
    const matches = detectRenderTokens("rnd_AABBCCDDEEFF001122334455667788XX")
    expect(matches[0].confidence).toBe(0.96)
  })

  it("should return empty when suffix is too short", () => {
    expect(detectRenderTokens("rnd_tooshort")).toHaveLength(0)
  })

  it("should return empty for unrelated text", () => {
    expect(detectRenderTokens("render.com web service")).toHaveLength(0)
  })
})

// ─── DOPPLER ──────────────────────────────────────────────────────────

describe("detectDopplerTokens", () => {
  it("should detect dp.st. service token", () => {
    // The pattern [A-Za-z0-9_\-]{20,} does not include dots, so the token body
    // must not contain dots; underscore is allowed as separator
    const matches = detectDopplerTokens("DOPPLER_TOKEN=dp.st.TestProject_AbCdEfGhIjKlMnOpQrSt")
    expect(matches).toHaveLength(1)
    expect(matches[0].value).toBe("dp.st.TestProject_AbCdEfGhIjKlMnOpQrSt")
    expect(matches[0].type).toBe("DOPPLER_TOKEN")
  })

  it("should detect dp.pt. personal token", () => {
    const matches = detectDopplerTokens("dp.pt.PersonalTokenValue1234567890ABCDE")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("DOPPLER_TOKEN")
  })

  it("should set confidence to 0.97", () => {
    // Token body uses only [A-Za-z0-9_\-] chars (no dots)
    const matches = detectDopplerTokens("dp.st.AABBCCDD_EEFF001122334455667788")
    expect(matches[0].confidence).toBe(0.97)
  })

  it("should return empty for dp.xt. (invalid subtype)", () => {
    expect(detectDopplerTokens("dp.xt.SomeTokenValue1234567890ABCDE")).toHaveLength(0)
  })

  it("should return empty for unrelated text", () => {
    expect(detectDopplerTokens("doppler secrets fetch")).toHaveLength(0)
  })
})

// ─── SQUARE ───────────────────────────────────────────────────────────

describe("detectSquareTokens", () => {
  it("should detect sq0atp- access token", () => {
    const matches = detectSquareTokens("SQUARE_ACCESS_TOKEN=sq0atp-AbCdEfGhIjKlMnOpQrStUvWx")
    expect(matches).toHaveLength(1)
    expect(matches[0].value).toBe("sq0atp-AbCdEfGhIjKlMnOpQrStUvWx")
    expect(matches[0].type).toBe("SQUARE_TOKEN")
  })

  it("should detect sq0csp- application secret", () => {
    const matches = detectSquareTokens("sq0csp-" + "A".repeat(40))
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("SQUARE_TOKEN")
  })

  it("should detect EAAA OAuth token when square context is present", () => {
    const oauthToken = "EAAA" + "B".repeat(40)
    const text = `square token: ${oauthToken}`
    const matches = detectSquareTokens(text)
    expect(matches.length).toBeGreaterThanOrEqual(1)
    expect(matches[0].type).toBe("SQUARE_TOKEN")
    expect(matches[0].confidence).toBe(0.93)
  })

  it("should not return EAAA token without square context", () => {
    const oauthToken = "EAAA" + "C".repeat(40)
    const matches = detectSquareTokens(`payment_token=${oauthToken}`)
    expect(matches).toHaveLength(0)
  })

  it("should set confidence to 0.97 for sq0atp-", () => {
    const matches = detectSquareTokens("sq0atp-AABBCCDDEEFF001122334455")
    expect(matches[0].confidence).toBe(0.97)
  })

  it("should return empty for unrelated text", () => {
    expect(detectSquareTokens("square payments overview")).toHaveLength(0)
  })
})

// ─── LAUNCHDARKLY ─────────────────────────────────────────────────────

describe("detectLaunchDarklyKeys", () => {
  it("should detect sdk- key with UUID format", () => {
    const matches = detectLaunchDarklyKeys(["LD_SDK_KEY=", "sdk" + "-" + "12345678-abcd-ef01-2345-6789abcdef01"].join(""))
    expect(matches).toHaveLength(1)
    expect(matches[0].value).toBe("sdk" + "-" + "12345678-abcd-ef01-2345-6789abcdef01")
    expect(matches[0].type).toBe("LAUNCHDARKLY_KEY")
  })

  it("should detect api- access token with UUID format", () => {
    const matches = detectLaunchDarklyKeys("api" + "-" + "aabbccdd-eeff-0011-2233-445566778899")
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("LAUNCHDARKLY_KEY")
  })

  it("should set confidence to 0.96", () => {
    const matches = detectLaunchDarklyKeys("sdk" + "-" + "00000000-1111-2222-3333-444444444444")
    expect(matches[0].confidence).toBe(0.96)
  })

  it("should return empty for partial UUID format", () => {
    expect(detectLaunchDarklyKeys("sdk" + "-" + "12345678-abcd-ef01")).toHaveLength(0)
  })

  it("should return empty for unrelated text", () => {
    expect(detectLaunchDarklyKeys("launchdarkly feature flag")).toHaveLength(0)
  })
})

// ─── ALGOLIA ──────────────────────────────────────────────────────────

describe("detectAlgoliaKeys", () => {
  it("should detect ALGOLIA_API_KEY= assignment", () => {
    const hex32 = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4"
    const matches = detectAlgoliaKeys(`ALGOLIA_API_KEY=${hex32}`)
    expect(matches).toHaveLength(1)
    expect(matches[0].value).toBe(hex32)
    expect(matches[0].type).toBe("ALGOLIA_KEY")
  })

  it("should detect ALGOLIA_ADMIN_KEY= assignment", () => {
    const hex32 = "0".repeat(32)
    const matches = detectAlgoliaKeys(`ALGOLIA_ADMIN_KEY=${hex32}`)
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("ALGOLIA_KEY")
  })

  it("should detect algolia api key: assignment (lowercase)", () => {
    const hex32 = "f".repeat(32)
    const matches = detectAlgoliaKeys(`algolia api key: ${hex32}`)
    expect(matches).toHaveLength(1)
    expect(matches[0].value).toBe(hex32)
  })

  it("should set confidence to 0.94", () => {
    const hex32 = "c".repeat(32)
    const matches = detectAlgoliaKeys(`ALGOLIA_SEARCH_KEY=${hex32}`)
    expect(matches[0].confidence).toBe(0.94)
  })

  it("should return empty without context prefix", () => {
    const hex32 = "a".repeat(32)
    expect(detectAlgoliaKeys(hex32)).toHaveLength(0)
  })

  it("should return empty for unrelated text", () => {
    expect(detectAlgoliaKeys("algolia index name")).toHaveLength(0)
  })
})

// ─── CIRCLECI ─────────────────────────────────────────────────────────

describe("detectCircleCITokens", () => {
  it("should detect CCIPAT_ v2 token", () => {
    // Pattern requires 40+ [A-Za-z0-9_] chars after CCIPAT_
    const suffix = "AbCdEfGhIjKlMnOpQrStUv" + "WxYzAbCdEfGhIjKlMn"  // 40 chars
    const matches = detectCircleCITokens(`CIRCLE_TOKEN=CCIPAT_${suffix}`)
    expect(matches).toHaveLength(1)
    expect(matches[0].value).toBe(`CCIPAT_${suffix}`)
    expect(matches[0].type).toBe("CIRCLECI_TOKEN")
  })

  it("should set confidence to 0.97 for CCIPAT_ tokens", () => {
    // 40 alphanumeric chars after CCIPAT_
    const token = "CCIPAT_" + "A".repeat(40)
    const matches = detectCircleCITokens(token)
    expect(matches[0].confidence).toBe(0.97)
  })

  it("should detect legacy 40-hex token with circleci context", () => {
    const hexToken = "a1b2c3d4e5f6" + "a1b2c3d4e5f6a1b2c3d4" + "e5f6a1b2"
    const text = `CIRCLE_TOKEN=${hexToken}`
    const matches = detectCircleCITokens(text)
    expect(matches.length).toBeGreaterThanOrEqual(1)
    const legacyMatch = matches.find(m => m.value === hexToken)
    expect(legacyMatch).toBeDefined()
    expect(legacyMatch!.confidence).toBe(0.93)
  })

  it("should not return 40-hex token without CIRCLE_TOKEN assignment", () => {
    const hexToken = "b2c3d4e5f6a1" + "b2c3d4e5f6a1b2c3d4e5" + "f6a1b2c3"
    const matches = detectCircleCITokens(`git_sha=${hexToken}`)
    expect(matches).toHaveLength(0)
  })

  it("should return empty for unrelated text", () => {
    expect(detectCircleCITokens("circleci pipeline config")).toHaveLength(0)
  })
})

// ─── CONFLUENT ────────────────────────────────────────────────────────

describe("detectConfluentKeys", () => {
  it("should detect CONFLUENT_API_KEY= assignment", () => {
    const keyVal = "AbCdEfGhIjKlMnOp"  // 16+ base64 chars
    const matches = detectConfluentKeys(`CONFLUENT_API_KEY=${keyVal}`)
    expect(matches).toHaveLength(1)
    expect(matches[0].value).toBe(keyVal)
    expect(matches[0].type).toBe("CONFLUENT_KEY")
  })

  it("should detect CONFLUENT_API_SECRET= assignment", () => {
    const secret = "AbCdEfGhIjKlMnOpQrStUvWxYz01234+"
    const matches = detectConfluentKeys(`CONFLUENT_API_SECRET=${secret}`)
    expect(matches).toHaveLength(1)
    expect(matches[0].value).toBe(secret)
  })

  it("should detect CONFLUENT_CLOUD_API_KEY= assignment", () => {
    const key = "XyZaBcDeFgHiJkLm"
    const matches = detectConfluentKeys(`CONFLUENT_CLOUD_API_KEY=${key}`)
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("CONFLUENT_KEY")
  })

  it("should detect kafka api key: format", () => {
    const key = "KafkaKeyValue12345678"
    const matches = detectConfluentKeys(`kafka api key: ${key}`)
    expect(matches).toHaveLength(1)
    expect(matches[0].value).toBe(key)
  })

  it("should set confidence to 0.93", () => {
    const matches = detectConfluentKeys("CONFLUENT_API_KEY=TestApiKeyValue123")
    expect(matches[0].confidence).toBe(0.93)
  })

  it("should return empty without context prefix", () => {
    expect(detectConfluentKeys("AbCdEfGhIjKlMnOp")).toHaveLength(0)
  })

  it("should return empty for unrelated text", () => {
    expect(detectConfluentKeys("confluent kafka cluster info")).toHaveLength(0)
  })
})

// ─── NEW RELIC ────────────────────────────────────────────────────────

describe("detectNewRelicKeys", () => {
  it("should detect NRAK- API key", () => {
    const key = "NRAK-" + "A".repeat(27)
    const matches = detectNewRelicKeys(`NEW_RELIC_API_KEY=${key}`)
    expect(matches).toHaveLength(1)
    expect(matches[0].value).toBe(key)
    expect(matches[0].type).toBe("NEWRELIC_KEY")
  })

  it("should set confidence to 0.98 for NRAK- keys", () => {
    const key = "NRAK-" + "B".repeat(27)
    const matches = detectNewRelicKeys(key)
    expect(matches[0].confidence).toBe(0.98)
  })

  it("should detect NRII- ingest key", () => {
    const key = "NRII-" + "A".repeat(32)
    const matches = detectNewRelicKeys(key)
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("NEWRELIC_KEY")
    expect(matches[0].confidence).toBe(0.96)
  })

  it("should detect NRIL- license key", () => {
    const key = "NRIL-" + "C".repeat(32)
    const matches = detectNewRelicKeys(key)
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("NEWRELIC_KEY")
  })

  it("should return empty for NRAK- with wrong length body", () => {
    // Only 26 uppercase alphanumeric chars instead of 27
    const key = "NRAK-" + "A".repeat(26)
    expect(detectNewRelicKeys(key)).toHaveLength(0)
  })

  it("should return empty for unrelated text", () => {
    expect(detectNewRelicKeys("new relic apm overview")).toHaveLength(0)
  })
})

// ─── DATADOG ──────────────────────────────────────────────────────────

describe("detectDatadogKeys", () => {
  it("should detect DD_API_KEY= assignment with 32 hex chars", () => {
    const hex32 = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4"
    const matches = detectDatadogKeys(`DD_API_KEY=${hex32}`)
    expect(matches).toHaveLength(1)
    expect(matches[0].value).toBe(hex32)
    expect(matches[0].type).toBe("DATADOG_KEY")
  })

  it("should detect DD_APP_KEY= assignment", () => {
    const hex40 = "a".repeat(40)
    const matches = detectDatadogKeys(`DD_APP_KEY=${hex40}`)
    expect(matches).toHaveLength(1)
    expect(matches[0].value).toBe(hex40)
  })

  it("should detect DATADOG_API_KEY= assignment", () => {
    const hex32 = "f".repeat(32)
    const matches = detectDatadogKeys(`DATADOG_API_KEY=${hex32}`)
    expect(matches).toHaveLength(1)
    expect(matches[0].type).toBe("DATADOG_KEY")
  })

  it("should detect datadog api key: (lowercase) assignment", () => {
    const hex32 = "0".repeat(32)
    const matches = detectDatadogKeys(`datadog api key: ${hex32}`)
    expect(matches).toHaveLength(1)
    expect(matches[0].value).toBe(hex32)
  })

  it("should set confidence to 0.94", () => {
    const matches = detectDatadogKeys(`DD_API_KEY=${"e".repeat(32)}`)
    expect(matches[0].confidence).toBe(0.94)
  })

  it("should return empty without context prefix", () => {
    const hex32 = "b".repeat(32)
    expect(detectDatadogKeys(hex32)).toHaveLength(0)
  })

  it("should return empty for unrelated text", () => {
    expect(detectDatadogKeys("datadog dashboard metrics")).toHaveLength(0)
  })
})
