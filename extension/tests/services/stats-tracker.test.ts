/**
 * Tests for the stats tracker service.
 *
 * Mocks chrome.storage.local to exercise daily stat recording,
 * aggregation across time ranges, and auto-pruning of old entries.
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
          keys: string | string[],
          cb: (items: Record<string, unknown>) => void,
        ) => {
          const result: Record<string, unknown> = {};
          const keyList = Array.isArray(keys) ? keys : [keys];
          for (const k of keyList) {
            if (k in mockStorage) result[k] = mockStorage[k];
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
            if (k in mockStorage) result[k] = mockStorage[k];
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
      remove: vi.fn((keys: string[], cb: () => void) => {
        for (const k of keys) {
          delete mockStorage[k];
        }
        cb();
      }),
    },
  },
  runtime: { lastError: null as chrome.runtime.LastError | null },
};

vi.stubGlobal("chrome", chromeMock);

// ---------------------------------------------------------------------------
// Module under test (imported AFTER the global mock is installed)
// ---------------------------------------------------------------------------

import {
  recordScan,
  recordDetection,
  recordBlock,
  recordSendAnyway,
  getTodayStats,
  getWeekStats,
  getAllTimeStats,
} from "../../src/services/stats-tracker";

import { PII_TYPES } from "../../src/shared/constants";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function buildEmptyPiiDetected(): Record<string, number> {
  const map: Record<string, number> = {};
  for (const key of Object.keys(PII_TYPES)) {
    map[key] = 0;
  }
  return map;
}

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

describe("recordScan", () => {
  it("should increment messagesScanned for today", async () => {
    await recordScan("CHATGPT");
    await recordScan("CHATGPT");

    const stats = await getTodayStats();
    expect(stats.messagesScanned).toBe(2);
  });

  it("should initialise a fresh entry when storage is empty", async () => {
    await recordScan("CLAUDE");

    const key = `stats:${todayKey()}`;
    const stored = mockStorage[key] as Record<string, unknown>;
    expect(stored).toBeDefined();
    expect(stored.messagesScanned).toBe(1);
  });
});

describe("recordDetection", () => {
  it("should increment piiDetected count for a type", async () => {
    await recordDetection("EMAIL", 3);
    await recordDetection("EMAIL", 2);

    const stats = await getTodayStats();
    expect(stats.piiDetected["EMAIL"]).toBe(5);
  });

  it("should track different types independently", async () => {
    await recordDetection("EMAIL", 1);
    await recordDetection("SSN", 2);

    const stats = await getTodayStats();
    expect(stats.piiDetected["EMAIL"]).toBe(1);
    expect(stats.piiDetected["SSN"]).toBe(2);
  });
});

describe("recordBlock", () => {
  it("should increment messagesBlocked for today", async () => {
    await recordBlock();
    await recordBlock();
    await recordBlock();

    const stats = await getTodayStats();
    expect(stats.messagesBlocked).toBe(3);
  });
});

describe("recordSendAnyway", () => {
  it("should increment messagesSentAnyway for today", async () => {
    await recordSendAnyway();

    const stats = await getTodayStats();
    expect(stats.messagesSentAnyway).toBe(1);
  });
});

describe("getTodayStats", () => {
  it("should return an empty entry when storage is empty", async () => {
    const stats = await getTodayStats();
    expect(stats.date).toBe(todayKey());
    expect(stats.messagesScanned).toBe(0);
    expect(stats.messagesBlocked).toBe(0);
    expect(stats.messagesSentAnyway).toBe(0);
  });

  it("should reflect all recorded events", async () => {
    await recordScan("CHATGPT");
    await recordDetection("EMAIL", 2);
    await recordBlock();
    await recordSendAnyway();

    const stats = await getTodayStats();
    expect(stats.messagesScanned).toBe(1);
    expect(stats.piiDetected["EMAIL"]).toBe(2);
    expect(stats.messagesBlocked).toBe(1);
    expect(stats.messagesSentAnyway).toBe(1);
  });
});

describe("getWeekStats", () => {
  it("should aggregate stats from the past 7 days", async () => {
    const today = todayKey();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    mockStorage[`stats:${today}`] = {
      date: today,
      messagesScanned: 10,
      piiDetected: buildEmptyPiiDetected(),
      messagesBlocked: 2,
      messagesSentAnyway: 1,
    };
    mockStorage[`stats:${yesterdayStr}`] = {
      date: yesterdayStr,
      messagesScanned: 5,
      piiDetected: buildEmptyPiiDetected(),
      messagesBlocked: 1,
      messagesSentAnyway: 0,
    };

    const stats = await getWeekStats();
    expect(stats.messagesScanned).toBe(15);
    expect(stats.messagesBlocked).toBe(3);
    expect(stats.messagesSentAnyway).toBe(1);
  });

  it("should return zeros when no data exists for the week", async () => {
    const stats = await getWeekStats();
    expect(stats.messagesScanned).toBe(0);
  });
});

describe("getAllTimeStats", () => {
  it("should aggregate all stats entries in storage", async () => {
    mockStorage["stats:2025-01-01"] = {
      date: "2025-01-01",
      messagesScanned: 100,
      piiDetected: { ...buildEmptyPiiDetected(), EMAIL: 50 },
      messagesBlocked: 10,
      messagesSentAnyway: 5,
    };
    mockStorage["stats:2025-06-15"] = {
      date: "2025-06-15",
      messagesScanned: 200,
      piiDetected: { ...buildEmptyPiiDetected(), SSN: 20 },
      messagesBlocked: 30,
      messagesSentAnyway: 10,
    };

    const stats = await getAllTimeStats();
    expect(stats.messagesScanned).toBe(300);
    expect(stats.messagesBlocked).toBe(40);
    expect(stats.messagesSentAnyway).toBe(15);
    expect(stats.piiDetected["EMAIL"]).toBe(50);
    expect(stats.piiDetected["SSN"]).toBe(20);
  });

  it("should skip non-stats keys in storage", async () => {
    mockStorage["settings"] = { some: "settings" };
    mockStorage["stats:2025-01-01"] = {
      date: "2025-01-01",
      messagesScanned: 5,
      piiDetected: buildEmptyPiiDetected(),
      messagesBlocked: 0,
      messagesSentAnyway: 0,
    };

    const stats = await getAllTimeStats();
    expect(stats.messagesScanned).toBe(5);
  });

  it("should return empty entry when no stats exist", async () => {
    const stats = await getAllTimeStats();
    expect(stats.messagesScanned).toBe(0);
    expect(stats.date).toBe(todayKey());
  });
});

describe("pruneOldStats", () => {
  it("should remove stats older than 90 days when called explicitly", async () => {
    const { pruneOldStats } = await import("../../src/services/stats-tracker");

    const old = new Date();
    old.setDate(old.getDate() - 100);
    const oldKey = `stats:${old.toISOString().slice(0, 10)}`;

    mockStorage[oldKey] = {
      date: old.toISOString().slice(0, 10),
      messagesScanned: 999,
      piiDetected: buildEmptyPiiDetected(),
      messagesBlocked: 0,
      messagesSentAnyway: 0,
    };

    await pruneOldStats();

    expect(mockStorage[oldKey]).toBeUndefined();
  });

  it("should NOT prune on recordScan (pruning is alarm-driven)", async () => {
    const old = new Date();
    old.setDate(old.getDate() - 100);
    const oldKey = `stats:${old.toISOString().slice(0, 10)}`;

    mockStorage[oldKey] = {
      date: old.toISOString().slice(0, 10),
      messagesScanned: 999,
      piiDetected: buildEmptyPiiDetected(),
      messagesBlocked: 0,
      messagesSentAnyway: 0,
    };

    await recordScan("CHATGPT");

    // Old entry should still exist — pruning is now alarm-driven
    expect(mockStorage[oldKey]).toBeDefined();
  });
});
