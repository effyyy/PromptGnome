/**
 * Tests for the settings manager service.
 *
 * Mocks chrome.storage.local to exercise settings persistence, default
 * fallback, partial updates, and per-type / per-provider queries.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Chrome storage mock
// ---------------------------------------------------------------------------

const mockStorage: Record<string, unknown> = {};

const chromeMock = {
  storage: {
    sync: {
      get: vi.fn(
        (
          _keys: string | string[],
          cb: (items: Record<string, unknown>) => void,
        ) => {
          cb({});
        },
      ),
      set: vi.fn(
        (_items: Record<string, unknown>, cb: () => void) => {
          cb();
        },
      ),
    },
    local: {
      get: vi.fn(
        (
          keys: string | string[],
          cb: (items: Record<string, unknown>) => void,
        ) => {
          const result: Record<string, unknown> = {};
          const keyList = Array.isArray(keys) ? keys : [keys];
          for (const k of keyList) {
            if (k in mockStorage) {
              result[k] = mockStorage[k];
            }
          }
          cb(result);
        },
      ),
      set: vi.fn(
        (items: Record<string, unknown>, cb: () => void) => {
          Object.assign(mockStorage, items);
          cb();
        },
      ),
    },
  },
  runtime: { lastError: null as chrome.runtime.LastError | null },
};

vi.stubGlobal("chrome", chromeMock);

// ---------------------------------------------------------------------------
// Module under test (imported AFTER the global mock is installed)
// ---------------------------------------------------------------------------

import {
  getSettings,
  updateSettings,
  getDefaultSettings,
  isTypeEnabled,
  isProviderEnabled,
} from "../../src/services/settings-manager";

// ---------------------------------------------------------------------------
// Reset between tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  for (const key of Object.keys(mockStorage)) {
    delete mockStorage[key];
  }
  chromeMock.runtime.lastError = null;
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("getDefaultSettings", () => {
  it("should enable all PII types", () => {
    const defaults = getDefaultSettings();
    for (const value of Object.values(defaults.enabledTypes)) {
      expect(value).toBe(true);
    }
  });

  it("should enable all providers", () => {
    const defaults = getDefaultSettings();
    for (const value of Object.values(defaults.enabledProviders)) {
      expect(value).toBe(true);
    }
  });

  it("should use 'warn' as default behaviour mode", () => {
    const defaults = getDefaultSettings();
    expect(defaults.behaviorMode).toBe("warn");
  });

  it("should set confidenceThreshold to 0.7", () => {
    const defaults = getDefaultSettings();
    expect(defaults.confidenceThreshold).toBe(0.7);
  });

  it("should set protectionEnabled to true", () => {
    const defaults = getDefaultSettings();
    expect(defaults.protectionEnabled).toBe(true);
  });
});

describe("getSettings", () => {
  it("should return defaults when storage is empty", async () => {
    const settings = await getSettings();
    expect(settings.behaviorMode).toBe("warn");
    expect(settings.confidenceThreshold).toBe(0.7);
  });

  it("should return stored settings when valid", async () => {
    const custom = getDefaultSettings();
    custom.behaviorMode = "block";
    mockStorage["settings"] = custom;

    const settings = await getSettings();
    expect(settings.behaviorMode).toBe("block");
  });

  it("should fall back to defaults when stored data is invalid", async () => {
    mockStorage["settings"] = { bad: "data" };
    const settings = await getSettings();
    expect(settings.behaviorMode).toBe("warn");
  });

  it("should fall back to defaults when chrome.runtime.lastError is set", async () => {
    chromeMock.storage.local.get.mockImplementationOnce(
      (
        _keys: string | string[],
        cb: (items: Record<string, unknown>) => void,
      ) => {
        chromeMock.runtime.lastError = { message: "Quota exceeded" };
        cb({});
        chromeMock.runtime.lastError = null;
      },
    );

    const settings = await getSettings();
    expect(settings.behaviorMode).toBe("warn");
  });
});

describe("updateSettings", () => {
  it("should merge partial settings and persist", async () => {
    await updateSettings({ behaviorMode: "silent" });

    const stored = mockStorage["settings"] as Record<string, unknown>;
    expect(stored).toBeDefined();
    expect(stored.behaviorMode).toBe("silent");
  });

  it("should preserve existing fields when updating a single field", async () => {
    const initial = getDefaultSettings();
    initial.confidenceThreshold = 0.5;
    mockStorage["settings"] = initial;

    await updateSettings({ behaviorMode: "block" });

    const stored = mockStorage["settings"] as Record<string, unknown>;
    expect(stored.behaviorMode).toBe("block");
    expect(stored.confidenceThreshold).toBe(0.5);
  });

  it("should throw when merged settings fail validation", async () => {
    await expect(
      updateSettings({ confidenceThreshold: 2.0 } as Partial<
        ReturnType<typeof getDefaultSettings>
      >),
    ).rejects.toThrow("Failed to update settings");
  });
});

describe("isTypeEnabled", () => {
  it("should return true for enabled types", async () => {
    const settings = getDefaultSettings();
    mockStorage["settings"] = settings;

    const result = await isTypeEnabled("EMAIL");
    expect(result).toBe(true);
  });

  it("should return false for explicitly disabled types", async () => {
    const settings = getDefaultSettings();
    settings.enabledTypes["EMAIL"] = false;
    mockStorage["settings"] = settings;

    const result = await isTypeEnabled("EMAIL");
    expect(result).toBe(false);
  });

  it("should return true for unknown types (safe default)", async () => {
    const settings = getDefaultSettings();
    mockStorage["settings"] = settings;

    const result = await isTypeEnabled("UNKNOWN_TYPE");
    expect(result).toBe(true);
  });
});

describe("isProviderEnabled", () => {
  it("should return true for enabled providers", async () => {
    const settings = getDefaultSettings();
    mockStorage["settings"] = settings;

    const result = await isProviderEnabled("CHATGPT");
    expect(result).toBe(true);
  });

  it("should return false for explicitly disabled providers", async () => {
    const settings = getDefaultSettings();
    settings.enabledProviders["CLAUDE"] = false;
    mockStorage["settings"] = settings;

    const result = await isProviderEnabled("CLAUDE");
    expect(result).toBe(false);
  });
});
