/**
 * Tests for the createLogger utility.
 *
 * Verifies namespace prefixing, per-level console routing, production
 * suppression of debug/info, and meta object forwarding.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

// ---------------------------------------------------------------------------
// Console mocks — installed before the module is imported so the module
// captures the spy references when buildLogFn closes over console.*.
// ---------------------------------------------------------------------------

const consoleMocks = {
  log: vi.spyOn(console, "log").mockImplementation(() => undefined),
  warn: vi.spyOn(console, "warn").mockImplementation(() => undefined),
  error: vi.spyOn(console, "error").mockImplementation(() => undefined),
}

beforeEach(() => {
  vi.clearAllMocks()
  // Reset NODE_ENV to development between tests so each test starts clean.
  process.env.NODE_ENV = "development"
})

// ---------------------------------------------------------------------------
// Import AFTER mocks are in place.
// ---------------------------------------------------------------------------

import { createLogger } from "../../src/utils/logger"

// ---------------------------------------------------------------------------
// Shape tests
// ---------------------------------------------------------------------------

describe("createLogger", () => {
  it("should return an object with debug, info, warn, and error methods", () => {
    const log = createLogger("test")
    expect(typeof log.debug).toBe("function")
    expect(typeof log.info).toBe("function")
    expect(typeof log.warn).toBe("function")
    expect(typeof log.error).toBe("function")
  })

  it("should return independent logger instances for different namespaces", () => {
    const logA = createLogger("alpha")
    const logB = createLogger("beta")
    expect(logA).not.toBe(logB)
  })
})

// ---------------------------------------------------------------------------
// Development mode — all levels are active
// ---------------------------------------------------------------------------

describe("createLogger in development mode", () => {
  beforeEach(() => {
    process.env.NODE_ENV = "development"
  })

  // Logger policy: debug + info are no-ops in ALL builds (including dev) to
  // keep DevTools console clean. Only warn + error produce output.

  it("should suppress debug messages in dev", () => {
    const log = createLogger("dev-debug")
    log.debug("A debug message")
    expect(consoleMocks.log).not.toHaveBeenCalled()
  })

  it("should suppress info messages in dev (info is a no-op)", () => {
    const log = createLogger("dev-info")
    log.info("An info message")
    expect(consoleMocks.log).not.toHaveBeenCalled()
  })

  it("should call console.warn for warn messages", () => {
    const log = createLogger("dev-warn")
    log.warn("A warn message")
    expect(consoleMocks.warn).toHaveBeenCalledOnce()
  })

  it("should call console.error for error messages", () => {
    const log = createLogger("dev-error")
    log.error("An error message")
    expect(consoleMocks.error).toHaveBeenCalledOnce()
  })

  it("should include the namespace in the warn prefix", () => {
    const log = createLogger("my-module")
    log.warn("hello")
    const [prefix] = consoleMocks.warn.mock.calls[0]
    expect(String(prefix)).toContain("my-module")
  })

  it("should include the level tag WARN in the warn prefix", () => {
    const log = createLogger("ns")
    log.warn("hello")
    const [prefix] = consoleMocks.warn.mock.calls[0]
    expect(String(prefix)).toContain("WARN")
  })

  it("should include the level tag ERROR in the error prefix", () => {
    const log = createLogger("ns")
    log.error("hello")
    const [prefix] = consoleMocks.error.mock.calls[0]
    expect(String(prefix)).toContain("ERROR")
  })

  it("should include 'APS' brand abbreviation in the prefix", () => {
    const log = createLogger("brand-check")
    log.warn("msg")
    const [prefix] = consoleMocks.warn.mock.calls[0]
    expect(String(prefix)).toContain("APS")
  })

  it("should embed the message string in the format string (first argument)", () => {
    const log = createLogger("ns")
    log.warn("the warn text")
    const fmt = consoleMocks.warn.mock.calls[0][0] as string
    expect(fmt).toContain("the warn text")
  })

  it("should pass meta object as fifth argument when provided to warn", () => {
    const log = createLogger("ns")
    const meta = { count: 3, type: "EMAIL" }
    log.warn("msg", meta)
    expect(consoleMocks.warn.mock.calls[0][4]).toEqual(meta)
  })

  it("should pass exactly 4 arguments when meta is omitted for warn", () => {
    const log = createLogger("ns")
    log.warn("no meta")
    expect(consoleMocks.warn.mock.calls[0]).toHaveLength(4)
  })

  it("should pass meta object as fifth argument to console.warn when provided", () => {
    const log = createLogger("ns")
    const meta = { stage: "regex", elapsed: 42 }
    log.warn("warning msg", meta)
    // args: [fmt, nsStyle, lvlStyle, resetStyle, meta]
    expect(consoleMocks.warn.mock.calls[0][4]).toEqual(meta)
  })

  it("should pass meta object as fifth argument to console.error when provided", () => {
    const log = createLogger("ns")
    const meta = { code: 500, retries: 0 }
    log.error("error msg", meta)
    // args: [fmt, nsStyle, lvlStyle, resetStyle, meta]
    expect(consoleMocks.error.mock.calls[0][4]).toEqual(meta)
  })
})

// ---------------------------------------------------------------------------
// Production mode — debug and info must be no-ops
// ---------------------------------------------------------------------------

describe("createLogger in production mode", () => {
  it("should not call console.log for debug in production", () => {
    process.env.NODE_ENV = "production"
    const log = createLogger("prod-debug")
    log.debug("should be silent")
    expect(consoleMocks.log).not.toHaveBeenCalled()
  })

  it("should not call console.log for info in production", () => {
    process.env.NODE_ENV = "production"
    const log = createLogger("prod-info")
    log.info("should also be silent")
    expect(consoleMocks.log).not.toHaveBeenCalled()
  })

  // Production policy: ALL log levels are no-ops in production builds.
  // Users should never see extension log output in their DevTools console.

  it("should be silent for warn in production", () => {
    process.env.NODE_ENV = "production"
    const log = createLogger("prod-warn")
    log.warn("should be silent")
    expect(consoleMocks.warn).not.toHaveBeenCalled()
  })

  it("should be silent for error in production", () => {
    process.env.NODE_ENV = "production"
    const log = createLogger("prod-error")
    log.error("should be silent")
    expect(consoleMocks.error).not.toHaveBeenCalled()
  })

  it("should be silent for warn with meta in production", () => {
    process.env.NODE_ENV = "production"
    const log = createLogger("prod-meta-warn")
    log.warn("warn with meta", { reason: "quota" })
    expect(consoleMocks.warn).not.toHaveBeenCalled()
  })

  it("should be silent for error with meta in production", () => {
    process.env.NODE_ENV = "production"
    const log = createLogger("prod-meta-error")
    log.error("error with meta", { stage: "ner", elapsed: 900 })
    expect(consoleMocks.error).not.toHaveBeenCalled()
  })

  it("debug in production should be a true no-op (return undefined without side effects)", () => {
    process.env.NODE_ENV = "production"
    const log = createLogger("prod-noop")
    const result = log.debug("noop call")
    expect(result).toBeUndefined()
    expect(consoleMocks.log).not.toHaveBeenCalled()
    expect(consoleMocks.warn).not.toHaveBeenCalled()
    expect(consoleMocks.error).not.toHaveBeenCalled()
  })

  it("info in production should be a true no-op (return undefined without side effects)", () => {
    process.env.NODE_ENV = "production"
    const log = createLogger("prod-noop-info")
    const result = log.info("noop call")
    expect(result).toBeUndefined()
    expect(consoleMocks.log).not.toHaveBeenCalled()
    expect(consoleMocks.warn).not.toHaveBeenCalled()
    expect(consoleMocks.error).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Namespace isolation — different namespaces produce different prefixes
// ---------------------------------------------------------------------------

describe("namespace prefix formatting", () => {
  beforeEach(() => {
    process.env.NODE_ENV = "development"
  })

  it("should include the exact namespace string in the prefix", () => {
    const log = createLogger("sse-parser")
    log.warn("test")
    const [prefix] = consoleMocks.warn.mock.calls[0]
    expect(String(prefix)).toContain("sse-parser")
  })

  it("should differentiate prefixes for two loggers with different namespaces", () => {
    const logA = createLogger("module-a")
    const logB = createLogger("module-b")
    logA.warn("from a")
    logB.warn("from b")
    const prefixA = String(consoleMocks.warn.mock.calls[0][0])
    const prefixB = String(consoleMocks.warn.mock.calls[1][0])
    expect(prefixA).toContain("module-a")
    expect(prefixB).toContain("module-b")
    expect(prefixA).not.toEqual(prefixB)
  })
})
