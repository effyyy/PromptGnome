/**
 * Provider adapter registry.
 *
 * Maps hostnames and URLs to the correct provider adapter instance.
 * This is the main entry point for consumers that need to determine
 * which adapter handles a given request.
 *
 * Architecture layer: Providers
 */

import type { BaseProviderAdapter } from "./base-adapter";
import { chatgptAdapter } from "./chatgpt";
import { claudeAdapter } from "./claude";
import { geminiAdapter } from "./gemini";
import { deepseekAdapter } from "./deepseek";
import { perplexityAdapter } from "./perplexity";
import { grokAdapter } from "./grok";
import { copilotAdapter } from "./copilot";
import { metaAiAdapter } from "./meta-ai";
import { createLogger } from "~src/utils/logger";

const log = createLogger("registry");

/**
 * All registered provider adapters, ordered by expected usage frequency.
 */
const adapters: readonly BaseProviderAdapter[] = [
  chatgptAdapter,
  claudeAdapter,
  geminiAdapter,
  deepseekAdapter,
  perplexityAdapter,
  grokAdapter,
  copilotAdapter,
  metaAiAdapter,
];

/**
 * Extract the hostname from a URL string.
 *
 * Uses the URL constructor for reliable parsing. Returns `null` if
 * the URL is malformed.
 */
function extractHostname(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/**
 * Find the adapter that handles a given full URL.
 *
 * Matches against both the hostname patterns and the URL path pattern.
 * Returns `null` if no adapter matches.
 *
 * @param url - Full URL string (e.g. `https://chatgpt.com/backend-api/conversation`).
 * @returns The matching adapter, or `null`.
 */
export function getAdapterForUrl(url: string): BaseProviderAdapter | null {
  const hostname = extractHostname(url);
  if (hostname === null) {
    log.debug("getAdapterForUrl — could not extract hostname", { url: url.slice(0, 80) })
    return null;
  }

  for (const adapter of adapters) {
    const hostnameMatches = adapter.hostPatterns.some((pattern) =>
      pattern.test(hostname)
    );
    if (hostnameMatches) {
      const urlMatches = adapter.urlPattern.test(url)
      log.debug("Hostname matched adapter", {
        hostname,
        adapter: adapter.name,
        urlPatternMatches: urlMatches,
        url: url.slice(0, 100),
      })
      if (urlMatches) {
        log.info("Adapter matched for request", { adapter: adapter.name, url: url.slice(0, 100) })
        return adapter;
      }
    }
  }

  log.debug("No adapter matched URL", { hostname, url: url.slice(0, 100) })
  return null;
}

/**
 * Find the adapter that handles a given hostname.
 *
 * Unlike {@link getAdapterForUrl}, this only checks hostname patterns
 * and does not require a matching URL path. Useful for determining
 * whether a site is a supported provider at all.
 *
 * @param hostname - Bare hostname (e.g. `chatgpt.com`).
 * @returns The matching adapter, or `null`.
 */
export function getAdapterForHostname(
  hostname: string
): BaseProviderAdapter | null {
  for (const adapter of adapters) {
    const matches = adapter.hostPatterns.some((pattern) =>
      pattern.test(hostname)
    );
    if (matches) return adapter;
  }

  return null;
}

/**
 * Find the adapter for a URL, falling back to a page-level adapter when the
 * request hostname doesn't match any adapter but the URL path does.
 *
 * This handles cross-origin API calls (e.g. Meta AI sending requests to
 * facebook.com/api/graphql). The interceptor runs on the provider page so
 * cross-origin fetches should still be handled by the page's adapter.
 *
 * @param url - Full URL string of the fetch request.
 * @param pageHostname - The current page's hostname (window.location.hostname).
 * @returns The matching adapter, or `null`.
 */
export function getAdapterForUrlWithPageContext(
  url: string,
  pageHostname: string
): BaseProviderAdapter | null {
  // First try the standard hostname + URL pattern match.
  const standard = getAdapterForUrl(url);
  if (standard !== null) return standard;

  // Fallback: if the page itself is a known provider page, check whether the
  // request URL matches that adapter's URL pattern (ignoring request hostname).
  // This catches cross-origin API calls routed through a different domain.
  const pageAdapter = getAdapterForHostname(pageHostname);
  if (pageAdapter !== null && pageAdapter.urlPattern.test(url)) {
    log.info("Cross-origin request matched via page context", {
      pageHostname,
      adapter: pageAdapter.name,
      url: url.slice(0, 100),
    });
    return pageAdapter;
  }

  return null;
}
