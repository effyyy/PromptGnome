/**
 * Debug logging utility, stripped in production builds.
 * SECURITY: This logger intentionally prevents logging of PII values.
 * All log methods accept only type/count info strings, never raw user data.
 */

/**
 * Log severity levels supported by the logger.
 */
type LogLevel = "debug" | "info" | "warn" | "error"

/**
 * A namespaced logger instance with methods for each severity level.
 * In production builds, debug and info are no-ops for performance.
 */
export interface Logger {
  /**
   * Logs a debug-level message. No-op in production.
   * @param message - Descriptive text (must not contain PII)
   * @param meta - Optional structured metadata (counts, types only)
   */
  debug(message: string, meta?: Record<string, unknown>): void

  /**
   * Logs an info-level message. No-op in production.
   * @param message - Descriptive text (must not contain PII)
   * @param meta - Optional structured metadata (counts, types only)
   */
  info(message: string, meta?: Record<string, unknown>): void

  /**
   * Logs a warning-level message. Active in all environments.
   * @param message - Descriptive text (must not contain PII)
   * @param meta - Optional structured metadata (counts, types only)
   */
  warn(message: string, meta?: Record<string, unknown>): void

  /**
   * Logs an error-level message. Active in all environments.
   * @param message - Descriptive text (must not contain PII)
   * @param meta - Optional structured metadata (counts, types only)
   */
  error(message: string, meta?: Record<string, unknown>): void

  /**
   * Opens a collapsed console group for related log entries.
   * No-op in production.
   * @param label - Group label text
   */
  group(label: string): void

  /**
   * Closes the most recently opened console group.
   * No-op in production.
   */
  groupEnd(): void
}

/**
 * Returns true when the current build is production.
 * Extracted for testability and to avoid repeated env access.
 */
function isProduction(): boolean {
  try {
    return process.env.NODE_ENV === "production"
  } catch {
    return false
  }
}

/** A no-op function used to silence debug/info in production. */
const noop = (): void => {
  /* intentionally empty */
}

/**
 * Namespace→colour mapping used to visually separate extension contexts
 * in the browser DevTools console.
 */
const NAMESPACE_COLORS: Record<string, string> = {
  "interceptor":      "#00C853",   // bright green
  "message-router":   "#2979FF",   // bright blue
  "service-worker":   "#FF6D00",   // orange
  "alarm-handler":    "#607D8B",   // blue-grey
  "detection":        "#AA00FF",   // deep purple
  "regex-engine":     "#D500F9",   // purple
  "providers":        "#00B0FF",   // light blue
  "registry":         "#00BCD4",   // cyan
  "settings":         "#8D6E63",   // brown
  "settings-manager": "#795548",   // dark brown
  "stats-tracker":    "#546E7A",   // grey
  "audit-logger":     "#455A64",   // dark grey
  "sse-parser":       "#26C6DA",   // teal
  "overlay":          "#EC407A",   // pink
  "provider-input":   "#AB47BC",   // medium purple
  "telemetry":        "#78909C",   // grey-blue
  "anonymizer":       "#FF9100",   // deep orange
  "session-mapper":   "#FFD740",   // amber
  "encrypted-store":  "#F44336",   // red (security-critical)
  "dom-replacer":     "#69F0AE",   // green accent
}

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: "#9E9E9E",
  info:  "#00E676",
  warn:  "#FFD600",
  error: "#FF1744",
}

/** Numeric priority for each level — higher means more severe. */
const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info:  1,
  warn:  2,
  error: 3,
}

/**
 * Minimum log level shown in development builds.
 * Set to "debug" to see all output; "info" suppresses verbose debug noise.
 * Has no effect in production (debug/info are always no-ops there).
 */
const DEV_MIN_LEVEL: LogLevel = "info"

/** Returns current time as HH:MM:SS.mmm */
function timestamp(): string {
  return new Date().toISOString().slice(11, 23)
}

/**
 * Builds a log function for the given namespace and severity level.
 * Outputs styled, timestamped console entries in development.
 */
function buildLogFn(
  namespace: string,
  level: LogLevel
): (message: string, meta?: Record<string, unknown>) => void {
  if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[DEV_MIN_LEVEL]) {
    return noop
  }

  const nsColor    = NAMESPACE_COLORS[namespace] ?? "#9E9E9E"
  const lvlColor   = LEVEL_COLORS[level]
  const consoleFn: (...args: unknown[]) => void =
    level === "error" ? console.error
    : level === "warn"  ? console.warn
    : console.log

  return (message: string, meta?: Record<string, unknown>): void => {
    const ts = timestamp()
    // Three styled spans: namespace | level | reset
    const fmt = `%c[APS:${namespace}]%c[${level.toUpperCase()}]%c ${ts} — ${message}`
    const nsStyle  = `color:${nsColor};font-weight:bold;`
    const lvlStyle = `color:${lvlColor};font-weight:bold;`
    const reset    = "color:inherit;font-weight:normal;"

    if (meta !== undefined) {
      consoleFn(fmt, nsStyle, lvlStyle, reset, meta)
    } else {
      consoleFn(fmt, nsStyle, lvlStyle, reset)
    }
  }
}

/**
 * Creates a namespaced logger for the given module or feature area.
 *
 * SECURITY: The logger is designed for diagnostic messages only.
 * Pass type names, counts, and status flags -- never raw user input,
 * detected PII values, or plaintext content.
 *
 * @param namespace - Short identifier for the source module (e.g. "sse-parser")
 * @returns A Logger instance with debug, info, warn, error, group, and groupEnd methods
 *
 * @example
 * ```ts
 * const log = createLogger("detection");
 * log.debug("Scan complete", { entityCount: 3, categories: "email,phone" });
 * log.error("Detection pipeline failed", { stage: "regex" });
 * ```
 */
export function createLogger(namespace: string): Logger {
  // In production builds the console must be completely silent — users should
  // never see extension logs, warnings, or errors in their DevTools.
  if (isProduction()) {
    return {
      debug:    noop,
      info:     noop,
      warn:     noop,
      error:    noop,
      group:    noop,
      groupEnd: noop,
    }
  }

  return {
    debug:    noop,
    info:     noop,
    warn:     buildLogFn(namespace, "warn"),
    error:    buildLogFn(namespace, "error"),
    group:    noop,
    groupEnd: noop,
  }
}
