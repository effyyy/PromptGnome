/**
 * Tests for the local NER client service.
 * Mocks chrome.runtime and chrome.offscreen to test offscreen document
 * lifecycle management and message passing without real APIs.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock chrome APIs before importing module under test
const mockSendMessage = vi.fn()
const mockCreateDocument = vi.fn()
const mockGetContexts = vi.fn()

vi.stubGlobal("chrome", {
  runtime: {
    sendMessage: mockSendMessage,
    getContexts: mockGetContexts,
    lastError: null,
  },
  offscreen: {
    createDocument: mockCreateDocument,
  },
})

// Mock the logger
vi.mock("~src/utils/logger", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    group: vi.fn(),
    groupEnd: vi.fn(),
  }),
}))

// Use dynamic import to allow module reset between tests
let analyzeTextLocally: typeof import("../../src/services/local-ner-client").analyzeTextLocally
let preloadLocalNER: typeof import("../../src/services/local-ner-client").preloadLocalNER
let getLocalNERStatus: typeof import("../../src/services/local-ner-client").getLocalNERStatus

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(async () => {
  vi.clearAllMocks()
  // Reset the module to clear the offscreenCreated singleton
  vi.resetModules()
  const mod = await import("../../src/services/local-ner-client")
  analyzeTextLocally = mod.analyzeTextLocally
  preloadLocalNER = mod.preloadLocalNER
  getLocalNERStatus = mod.getLocalNERStatus
  // Default: no existing offscreen documents
  mockGetContexts.mockResolvedValue([])
  // Default: offscreen document creation succeeds
  mockCreateDocument.mockResolvedValue(undefined)
})

// ---------------------------------------------------------------------------
// analyzeTextLocally
// ---------------------------------------------------------------------------

describe("analyzeTextLocally", () => {
  it("should return entities from offscreen document", async () => {
    mockSendMessage.mockImplementation(
      (_msg: unknown, callback: (response: unknown) => void) => {
        callback({
          success: true,
          data: {
            entities: [
              { type: "PERSON_NAME", value: "Jane Testperson", start: 11, end: 26, confidence: 0.94 },
            ],
            source: "local_ner",
          },
        })
      },
    )

    const result = await analyzeTextLocally("My name is Jane Testperson")
    expect(result).not.toBeNull()
    expect(result).toHaveLength(1)
    expect(result![0].type).toBe("PERSON_NAME")
    expect(result![0].value).toBe("Jane Testperson")
    expect(result![0].source).toBe("ner")
  })

  it("should return empty array for empty text", async () => {
    const result = await analyzeTextLocally("")
    expect(result).toEqual([])
  })

  it("should return null when offscreen document fails to create", async () => {
    mockGetContexts.mockResolvedValue([])
    mockCreateDocument.mockRejectedValue(new Error("Failed to create"))

    const result = await analyzeTextLocally("Test text")
    expect(result).toBeNull()
  })

  it("should return null when sendMessage callback has lastError", async () => {
    mockSendMessage.mockImplementation(
      (_msg: unknown, callback: (response: unknown) => void) => {
        // Simulate lastError
        Object.defineProperty(chrome.runtime, "lastError", {
          value: { message: "Extension context invalidated" },
          configurable: true,
        })
        callback(undefined)
        Object.defineProperty(chrome.runtime, "lastError", {
          value: null,
          configurable: true,
        })
      },
    )

    const result = await analyzeTextLocally("Test text")
    expect(result).toBeNull()
  })

  it("should return null when response has no entities", async () => {
    mockSendMessage.mockImplementation(
      (_msg: unknown, callback: (response: unknown) => void) => {
        callback({ success: true, data: {} })
      },
    )

    const result = await analyzeTextLocally("Test text")
    expect(result).toBeNull()
  })

  it("should skip creating offscreen document if already exists", async () => {
    // First call creates the document
    mockGetContexts.mockResolvedValue([{ contextType: "OFFSCREEN_DOCUMENT" }])
    mockSendMessage.mockImplementation(
      (_msg: unknown, callback: (response: unknown) => void) => {
        callback({
          success: true,
          data: { entities: [], source: "local_ner" },
        })
      },
    )

    await analyzeTextLocally("Test text")
    expect(mockCreateDocument).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// preloadLocalNER
// ---------------------------------------------------------------------------

describe("preloadLocalNER", () => {
  it("should return true when model loads successfully", async () => {
    mockSendMessage.mockImplementation(
      (_msg: unknown, callback: (response: unknown) => void) => {
        callback({
          success: true,
          data: { loaded: true, error: null },
        })
      },
    )

    const result = await preloadLocalNER()
    expect(result).toBe(true)
  })

  it("should return false when model fails to load", async () => {
    mockSendMessage.mockImplementation(
      (_msg: unknown, callback: (response: unknown) => void) => {
        callback({
          success: true,
          data: { loaded: false, error: "Model download failed" },
        })
      },
    )

    const result = await preloadLocalNER()
    expect(result).toBe(false)
  })

  it("should return false when offscreen document is unavailable", async () => {
    mockCreateDocument.mockRejectedValue(new Error("Cannot create"))
    mockGetContexts.mockResolvedValue([])

    const result = await preloadLocalNER()
    expect(result).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// getLocalNERStatus
// ---------------------------------------------------------------------------

describe("getLocalNERStatus", () => {
  it("should return model status", async () => {
    mockSendMessage.mockImplementation(
      (_msg: unknown, callback: (response: unknown) => void) => {
        callback({
          success: true,
          data: { loaded: true, loading: false, error: null },
        })
      },
    )

    const status = await getLocalNERStatus()
    expect(status).not.toBeNull()
    expect(status!.loaded).toBe(true)
    expect(status!.loading).toBe(false)
    expect(status!.error).toBeNull()
  })

  it("should return loading state", async () => {
    mockSendMessage.mockImplementation(
      (_msg: unknown, callback: (response: unknown) => void) => {
        callback({
          success: true,
          data: { loaded: false, loading: true, error: null },
        })
      },
    )

    const status = await getLocalNERStatus()
    expect(status).not.toBeNull()
    expect(status!.loaded).toBe(false)
    expect(status!.loading).toBe(true)
  })

  it("should return null when offscreen unavailable", async () => {
    mockCreateDocument.mockRejectedValue(new Error("Cannot create"))
    mockGetContexts.mockResolvedValue([])

    const status = await getLocalNERStatus()
    expect(status).toBeNull()
  })
})
