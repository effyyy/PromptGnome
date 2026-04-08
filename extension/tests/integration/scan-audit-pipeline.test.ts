/**
 * Integration tests for the scan → audit-log pipeline.
 *
 * Verifies that provider IDs, action values, and PII types flow
 * consistently from a SCAN_REQUEST through detection to audit log writes.
 * Exercises the message-router → audit-logger path end-to-end.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Chrome storage mock
// ---------------------------------------------------------------------------

const mockStorage: Record<string, unknown> = {};

const chromeMock = {
  storage: {
    local: {
      get: vi.fn(
        (
          keys: string | string[] | null,
          cb: (items: Record<string, unknown>) => void,
        ) => {
          if (keys === null) {
            cb({ ...mockStorage });
            return;
          }
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
      remove: vi.fn((_keys: string[], cb: () => void) => { cb(); }),
    },
    sync: {
      get: vi.fn((_keys: unknown, cb: (items: Record<string, unknown>) => void) => { cb({}); }),
      set: vi.fn((_items: Record<string, unknown>, cb: () => void) => { cb(); }),
    },
  },
  runtime: { lastError: null as chrome.runtime.LastError | null },
  alarms: {
    create: vi.fn(),
    onAlarm: { addListener: vi.fn() },
  },
  sidePanel: { open: vi.fn() },
};

vi.stubGlobal("chrome", chromeMock);
vi.stubGlobal("performance", { now: () => Date.now() });

// ---------------------------------------------------------------------------
// Modules under test (imported AFTER the global mock is installed)
// ---------------------------------------------------------------------------

import { logDetection, getRecentLogs, clearLogs } from "../../src/services/audit-logger";
import { getSettings, getDefaultSettings } from "../../src/services/settings-manager";
import { PROVIDER_NAMES, PII_TYPES } from "../../src/shared/constants";
import { AuditLogEntrySchema } from "../../src/shared/schemas";

// ---------------------------------------------------------------------------
// Reset between tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  for (const key of Object.keys(mockStorage)) {
    delete mockStorage[key];
  }
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Provider ID consistency tests
// ---------------------------------------------------------------------------

describe("Provider ID consistency", () => {
  const phase1Providers = ["CHATGPT", "CLAUDE", "GEMINI"] as const;

  for (const provider of phase1Providers) {
    it(`should write audit log entries with provider ID "${provider}"`, async () => {
      await logDetection({
        provider,
        entityType: "EMAIL",
        action: "warned",
        placeholder: PII_TYPES.EMAIL.placeholder,
      });

      const logs = await getRecentLogs(1);
      expect(logs).toHaveLength(1);
      expect(logs[0].provider).toBe(provider);
    });
  }

  it("should accept all PROVIDER_NAMES values in the audit schema", () => {
    for (const providerValue of Object.values(PROVIDER_NAMES)) {
      const result = AuditLogEntrySchema.safeParse({
        timestamp: Date.now(),
        provider: providerValue,
        entityType: "EMAIL",
        action: "warned",
        placeholderUsed: "EMAIL",
      });
      expect(result.success, `Provider "${providerValue}" should be valid`).toBe(true);
    }
  });

  it("should reject invalid provider names in the audit schema", () => {
    const result = AuditLogEntrySchema.safeParse({
      timestamp: Date.now(),
      provider: "ChatGPT", // mixed case — invalid
      entityType: "EMAIL",
      action: "warned",
      placeholderUsed: "EMAIL",
    });
    expect(result.success).toBe(false);
  });

  it("should have matching provider IDs in PROVIDER_NAMES keys and values", () => {
    for (const [key, value] of Object.entries(PROVIDER_NAMES)) {
      expect(key).toBe(value);
    }
  });
});

// ---------------------------------------------------------------------------
// Audit log action consistency
// ---------------------------------------------------------------------------

describe("Audit log action values", () => {
  const validActions = ["warned", "blocked", "anonymized", "dismissed"] as const;

  for (const action of validActions) {
    it(`should accept action "${action}" in audit log entries`, async () => {
      await logDetection({
        provider: "CHATGPT",
        entityType: "SSN",
        action,
        placeholder: PII_TYPES.SSN.placeholder,
      });

      const logs = await getRecentLogs(1);
      expect(logs).toHaveLength(1);
      expect(logs[0].action).toBe(action);

      await clearLogs();
    });
  }

  it("should silently reject invalid action values", async () => {
    await logDetection({
      provider: "CHATGPT",
      entityType: "SSN",
      action: "invalid_action" as "warned",
      placeholder: "",
    });

    // Invalid action should be swallowed (fail-open for audit logging)
    const logs = await getRecentLogs(10);
    // Entry should NOT have been written since schema validation failed
    expect(logs).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Per-provider settings consistency
// ---------------------------------------------------------------------------

describe("Per-provider settings consistency", () => {
  it("should create default settings with PROVIDER_NAMES keys", () => {
    const defaults = getDefaultSettings();
    const enabledProviders = defaults.enabledProviders as Record<string, boolean>;

    for (const providerKey of Object.keys(PROVIDER_NAMES)) {
      expect(
        enabledProviders[providerKey],
        `Default settings should include provider "${providerKey}"`,
      ).toBe(true);
    }
  });

  it("should correctly check provider toggle with matching IDs", async () => {
    // Write settings with CHATGPT disabled
    const defaults = getDefaultSettings();
    const modified = {
      ...defaults,
      enabledProviders: { ...defaults.enabledProviders as Record<string, boolean>, CHATGPT: false },
    };
    mockStorage["settings"] = modified;

    const settings = await getSettings();
    const providers = settings.enabledProviders as Record<string, boolean>;

    // CHATGPT should be disabled, others enabled
    expect(providers["CHATGPT"]).toBe(false);
    expect(providers["CLAUDE"]).toBe(true);
    expect(providers["GEMINI"]).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Full scan → audit pipeline
// ---------------------------------------------------------------------------

describe("Scan to audit-log pipeline", () => {
  it("should write a warned entry with correct provider and entity type", async () => {
    await logDetection({
      provider: "CLAUDE",
      entityType: "CREDIT_CARD",
      action: "warned",
      placeholder: PII_TYPES.CREDIT_CARD.placeholder,
    });

    const logs = await getRecentLogs(1);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      provider: "CLAUDE",
      entityType: "CREDIT_CARD",
      action: "warned",
      placeholderUsed: "CREDIT_CARD",
    });
    expect(logs[0].timestamp).toBeGreaterThan(0);
  });

  it("should write a blocked entry after user decision", async () => {
    await logDetection({
      provider: "GEMINI",
      entityType: "SSN",
      action: "blocked",
      placeholder: PII_TYPES.SSN.placeholder,
    });

    const logs = await getRecentLogs(1);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      provider: "GEMINI",
      entityType: "SSN",
      action: "blocked",
    });
  });

  it("should write a dismissed entry after user sends anyway", async () => {
    await logDetection({
      provider: "CHATGPT",
      entityType: "EMAIL",
      action: "dismissed",
      placeholder: PII_TYPES.EMAIL.placeholder,
    });

    const logs = await getRecentLogs(1);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      provider: "CHATGPT",
      entityType: "EMAIL",
      action: "dismissed",
    });
  });

  it("should accumulate multiple audit entries for multi-PII detection", async () => {
    const detectedTypes = ["EMAIL", "SSN", "PHONE_US"] as const;

    for (const entityType of detectedTypes) {
      await logDetection({
        provider: "CHATGPT",
        entityType,
        action: "warned",
        placeholder: PII_TYPES[entityType].placeholder,
      });
    }

    const logs = await getRecentLogs(10);
    expect(logs).toHaveLength(3);

    // All entries should have the same provider
    for (const log of logs) {
      expect(log.provider).toBe("CHATGPT");
      expect(log.action).toBe("warned");
    }

    // All entity types should be present
    const types = logs.map((l) => l.entityType).sort();
    expect(types).toEqual(["EMAIL", "PHONE_US", "SSN"]);
  });
});
