/**
 * Tests for the alarm-handler background module.
 *
 * Exercises alarm registration, the onAlarm listener dispatch, cleanup of
 * expired stats entries, weekly-summary aggregation, and all edge cases
 * (empty storage, missing partial entries).
 *
 * All chrome APIs are stubbed via vi.stubGlobal so the module can run in
 * a Node/jsdom test environment without a real browser context.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PRO_BUILD } from "../../src/shared/build-flags";

// ---------------------------------------------------------------------------
// Chrome mock — promise-returning storage (MV3 style)
// ---------------------------------------------------------------------------

const mockStorage: Record<string, unknown> = {};

const chromeMock = {
  storage: {
    local: {
      /**
       * Supports both MV3 promise API and callback API:
       *   `get(keys)`           → returns Promise
       *   `get(keys, callback)` → invokes callback
       */
      get: vi.fn(
        (
          keys: string | string[] | null,
          callback?: (items: Record<string, unknown>) => void,
        ): Promise<Record<string, unknown>> | void => {
          let result: Record<string, unknown>;
          if (keys === null) {
            result = { ...mockStorage };
          } else {
            result = {};
            const keyList = Array.isArray(keys) ? keys : [keys];
            for (const k of keyList) {
              if (k in mockStorage) result[k] = mockStorage[k];
            }
          }
          if (callback) {
            callback(result);
            return;
          }
          return Promise.resolve(result);
        },
      ),
      set: vi.fn(
        (items: Record<string, unknown>, callback?: () => void): Promise<void> | void => {
          Object.assign(mockStorage, items);
          if (callback) {
            callback();
            return;
          }
          return Promise.resolve();
        },
      ),
      remove: vi.fn((keys: string | string[], callback?: () => void): Promise<void> | void => {
        const keyList = Array.isArray(keys) ? keys : [keys];
        for (const k of keyList) {
          delete mockStorage[k];
        }
        if (callback) {
          callback();
          return;
        }
        return Promise.resolve();
      }),
    },
  },
  runtime: {
    lastError: null as chrome.runtime.LastError | null,
  },
  alarms: {
    create: vi.fn(async () => {}),
    onAlarm: {
      addListener: vi.fn(),
    },
  },
};

vi.stubGlobal("chrome", chromeMock);

// ---------------------------------------------------------------------------
// Module under test (imported AFTER the global mock is installed)
// ---------------------------------------------------------------------------

import {
  registerAlarms,
  initAlarmHandler,
} from "../../src/background/alarm-handler";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Builds a minimal valid StatsEntry for a given date string. */
function makeStatsEntry(
  date: string,
  overrides: {
    messagesScanned?: number;
    piiDetected?: Record<string, number>;
    messagesBlocked?: number;
    messagesSentAnyway?: number;
  } = {},
): Record<string, unknown> {
  return {
    date,
    messagesScanned: overrides.messagesScanned ?? 0,
    piiDetected: overrides.piiDetected ?? { EMAIL: 0, SSN: 0 },
    messagesBlocked: overrides.messagesBlocked ?? 0,
    messagesSentAnyway: overrides.messagesSentAnyway ?? 0,
  };
}

/**
 * Returns an ISO-8601 date string offset by `deltaDays` from today.
 * Negative values produce past dates.
 */
function dateOffset(deltaDays: number): string {
  const d = new Date(Date.now() + deltaDays * 24 * 60 * 60 * 1_000);
  return d.toISOString().slice(0, 10);
}

/** Retrieves the alarm listener registered via initAlarmHandler(). */
function getAlarmListener(): (alarm: { name: string }) => Promise<void> {
  const calls = chromeMock.alarms.onAlarm.addListener.mock.calls;
  if (calls.length === 0) {
    throw new Error("initAlarmHandler has not been called yet");
  }
  // The most-recently registered listener is the authoritative one.
  return calls[calls.length - 1][0] as (alarm: { name: string }) => Promise<void>;
}

/**
 * Fires the named alarm and waits for the async handler to settle.
 *
 * The production wrapper calls `onAlarmFired(alarm).catch(...)` without
 * returning the promise, so we flush the microtask queue with a short
 * setTimeout to ensure all chained awaits inside the handler complete.
 */
async function fireAlarm(name: string): Promise<void> {
  const listener = getAlarmListener();
  listener({ name });
  await new Promise((resolve) => setTimeout(resolve, 10));
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Clear the in-memory storage backing.
  for (const key of Object.keys(mockStorage)) {
    delete mockStorage[key];
  }
  chromeMock.runtime.lastError = null;
  vi.clearAllMocks();
  // Re-register the alarm listener after clearing mocks
  initAlarmHandler();
});

// ---------------------------------------------------------------------------
// registerAlarms
// ---------------------------------------------------------------------------

describe("registerAlarms", () => {
  it("should call chrome.alarms.create the correct number of times", async () => {
    await registerAlarms();

    // Free build: 2 alarms (cleanup-expired, weekly-summary).
    // Pro build: 3 alarms (adds telemetry-sync).
    const expectedCount = PRO_BUILD ? 3 : 2;
    expect(chromeMock.alarms.create).toHaveBeenCalledTimes(expectedCount);
  });

  it("should create the 'cleanup-expired' alarm with a 60-minute period", async () => {
    await registerAlarms();

    expect(chromeMock.alarms.create).toHaveBeenCalledWith("cleanup-expired", {
      periodInMinutes: 60,
    });
  });

  it("should create the 'weekly-summary' alarm with a 7-day period", async () => {
    await registerAlarms();

    const weeklyMinutes = 7 * 24 * 60; // 10_080
    const calls = chromeMock.alarms.create.mock.calls as unknown as [string, Record<string, number>][];
    const call = calls.find(([name]) => name === "weekly-summary");
    expect(call).toBeDefined();
    const [, options] = call!;
    expect(options.periodInMinutes).toBe(weeklyMinutes);
  });

  it("should pass a positive delayInMinutes for the weekly-summary alarm", async () => {
    await registerAlarms();

    const calls = chromeMock.alarms.create.mock.calls as unknown as [string, Record<string, number>][];
    const call = calls.find(([name]) => name === "weekly-summary");
    expect(call).toBeDefined();
    const [, options] = call!;
    expect(options.delayInMinutes).toBeGreaterThan(0);
  });

  it("should not throw when chrome.alarms.create rejects", async () => {
    chromeMock.alarms.create.mockRejectedValueOnce(new Error("quota exceeded"));

    await expect(registerAlarms()).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// initAlarmHandler
// ---------------------------------------------------------------------------

describe("initAlarmHandler", () => {
  it("should register exactly one listener on chrome.alarms.onAlarm per call", () => {
    // The outer beforeEach already called initAlarmHandler() once (count = 1).
    // Calling it a second time brings the total to 2, proving each call registers
    // exactly one listener.
    initAlarmHandler();

    expect(chromeMock.alarms.onAlarm.addListener).toHaveBeenCalledTimes(2);
  });

  it("should register a function as the alarm listener", () => {
    // The outer beforeEach called initAlarmHandler(), so at least one call was
    // already made. Verify the registered value is a function.
    const [listener] = chromeMock.alarms.onAlarm.addListener.mock.calls[0];
    expect(typeof listener).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// cleanup-expired alarm handler
// ---------------------------------------------------------------------------

describe("cleanup-expired alarm", () => {
  beforeEach(() => {
    initAlarmHandler();
  });

  it("should remove stats entries older than 90 days", async () => {
    const oldDate = dateOffset(-91);
    const oldKey = `stats:${oldDate}`;
    mockStorage[oldKey] = makeStatsEntry(oldDate, { messagesScanned: 50 });

    await fireAlarm("cleanup-expired");

    expect(mockStorage[oldKey]).toBeUndefined();
  });

  it("should remove entries exactly on the boundary (91 days old)", async () => {
    const staleDate = dateOffset(-91);
    const staleKey = `stats:${staleDate}`;
    mockStorage[staleKey] = makeStatsEntry(staleDate);

    await fireAlarm("cleanup-expired");

    expect(mockStorage[staleKey]).toBeUndefined();
  });

  it("should keep stats entries from within the last 90 days", async () => {
    const recentDate = dateOffset(-89);
    const recentKey = `stats:${recentDate}`;
    mockStorage[recentKey] = makeStatsEntry(recentDate, { messagesScanned: 10 });

    await fireAlarm("cleanup-expired");

    expect(mockStorage[recentKey]).toBeDefined();
  });

  it("should keep today's stats entry", async () => {
    const today = dateOffset(0);
    const todayKey = `stats:${today}`;
    mockStorage[todayKey] = makeStatsEntry(today, { messagesScanned: 3 });

    await fireAlarm("cleanup-expired");

    expect(mockStorage[todayKey]).toBeDefined();
  });

  it("should remove multiple stale entries in a single pass", async () => {
    const stale1 = dateOffset(-100);
    const stale2 = dateOffset(-200);
    const recent = dateOffset(-5);

    mockStorage[`stats:${stale1}`] = makeStatsEntry(stale1);
    mockStorage[`stats:${stale2}`] = makeStatsEntry(stale2);
    mockStorage[`stats:${recent}`] = makeStatsEntry(recent, { messagesScanned: 1 });

    await fireAlarm("cleanup-expired");

    expect(mockStorage[`stats:${stale1}`]).toBeUndefined();
    expect(mockStorage[`stats:${stale2}`]).toBeUndefined();
    expect(mockStorage[`stats:${recent}`]).toBeDefined();
  });

  it("should not call remove when there are no stale entries", async () => {
    const recent = dateOffset(-10);
    mockStorage[`stats:${recent}`] = makeStatsEntry(recent);

    await fireAlarm("cleanup-expired");

    expect(chromeMock.storage.local.remove).not.toHaveBeenCalled();
  });

  it("should not touch non-stats keys", async () => {
    mockStorage["settings"] = { protectionEnabled: true };
    mockStorage["auditLog"] = [];
    const stale = dateOffset(-100);
    mockStorage[`stats:${stale}`] = makeStatsEntry(stale);

    await fireAlarm("cleanup-expired");

    expect(mockStorage["settings"]).toBeDefined();
    expect(mockStorage["auditLog"]).toBeDefined();
  });

  it("should not throw when storage is empty", async () => {
    await expect(fireAlarm("cleanup-expired")).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// weekly-summary alarm handler
// ---------------------------------------------------------------------------

describe("weekly-summary alarm", () => {
  beforeEach(() => {
    initAlarmHandler();
  });

  it("should store a weeklySummary object in chrome.storage.local", async () => {
    await fireAlarm("weekly-summary");

    expect(mockStorage["weeklySummary"]).toBeDefined();
  });

  it("should aggregate totalScanned across the last 7 days", async () => {
    const day0 = dateOffset(0);
    const day1 = dateOffset(-1);
    const day3 = dateOffset(-3);

    mockStorage[`stats:${day0}`] = makeStatsEntry(day0, { messagesScanned: 10 });
    mockStorage[`stats:${day1}`] = makeStatsEntry(day1, { messagesScanned: 5 });
    mockStorage[`stats:${day3}`] = makeStatsEntry(day3, { messagesScanned: 8 });

    await fireAlarm("weekly-summary");

    const summary = mockStorage["weeklySummary"] as { totalScanned: number };
    expect(summary.totalScanned).toBe(23);
  });

  it("should aggregate totalBlocked across the last 7 days", async () => {
    const day0 = dateOffset(0);
    const day2 = dateOffset(-2);

    mockStorage[`stats:${day0}`] = makeStatsEntry(day0, { messagesBlocked: 3 });
    mockStorage[`stats:${day2}`] = makeStatsEntry(day2, { messagesBlocked: 7 });

    await fireAlarm("weekly-summary");

    const summary = mockStorage["weeklySummary"] as { totalBlocked: number };
    expect(summary.totalBlocked).toBe(10);
  });

  it("should aggregate totalDetections across all piiDetected values", async () => {
    const day0 = dateOffset(0);
    const day1 = dateOffset(-1);

    mockStorage[`stats:${day0}`] = makeStatsEntry(day0, {
      piiDetected: { EMAIL: 4, SSN: 2, CREDIT_CARD: 1 },
    });
    mockStorage[`stats:${day1}`] = makeStatsEntry(day1, {
      piiDetected: { EMAIL: 3, PHONE_US: 5 },
    });

    await fireAlarm("weekly-summary");

    const summary = mockStorage["weeklySummary"] as { totalDetections: number };
    // day0: 4 + 2 + 1 = 7 | day1: 3 + 5 = 8 → total = 15
    expect(summary.totalDetections).toBe(15);
  });

  it("should set weekStarting to the date 6 days ago", async () => {
    await fireAlarm("weekly-summary");

    const expectedStart = dateOffset(-6);
    const summary = mockStorage["weeklySummary"] as { weekStarting: string };
    expect(summary.weekStarting).toBe(expectedStart);
  });

  it("should include a generatedAt ISO timestamp", async () => {
    const before = Date.now();
    await fireAlarm("weekly-summary");
    const after = Date.now();

    const summary = mockStorage["weeklySummary"] as { generatedAt: string };
    const ts = new Date(summary.generatedAt).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it("should return zeros when storage is empty", async () => {
    await fireAlarm("weekly-summary");

    const summary = mockStorage["weeklySummary"] as {
      totalScanned: number;
      totalBlocked: number;
      totalDetections: number;
    };
    expect(summary.totalScanned).toBe(0);
    expect(summary.totalBlocked).toBe(0);
    expect(summary.totalDetections).toBe(0);
  });

  it("should not include stats from more than 6 days ago (i.e. outside the 7-day window)", async () => {
    // Day 7 back is outside the window (the handler iterates i = 0..6, i.e. 7 days)
    const day7 = dateOffset(-7);
    const day6 = dateOffset(-6);

    mockStorage[`stats:${day7}`] = makeStatsEntry(day7, { messagesScanned: 999 });
    mockStorage[`stats:${day6}`] = makeStatsEntry(day6, { messagesScanned: 1 });

    await fireAlarm("weekly-summary");

    const summary = mockStorage["weeklySummary"] as { totalScanned: number };
    // Only the day6 entry is within the window
    expect(summary.totalScanned).toBe(1);
  });

  it("should silently skip missing stats entries within the 7-day window", async () => {
    // Only populate 2 of the 7 possible days; the others simply don't exist.
    const day0 = dateOffset(0);
    const day4 = dateOffset(-4);

    mockStorage[`stats:${day0}`] = makeStatsEntry(day0, { messagesScanned: 6 });
    mockStorage[`stats:${day4}`] = makeStatsEntry(day4, { messagesScanned: 2 });

    await expect(fireAlarm("weekly-summary")).resolves.toBeUndefined();

    const summary = mockStorage["weeklySummary"] as { totalScanned: number };
    expect(summary.totalScanned).toBe(8);
  });

  it("should silently skip malformed stats entries", async () => {
    const day0 = dateOffset(0);
    const day1 = dateOffset(-1);

    // Valid entry
    mockStorage[`stats:${day0}`] = makeStatsEntry(day0, { messagesScanned: 5 });
    // Invalid entry — will fail StatsEntrySchema.safeParse
    mockStorage[`stats:${day1}`] = { notAValidEntry: true };

    await expect(fireAlarm("weekly-summary")).resolves.toBeUndefined();

    const summary = mockStorage["weeklySummary"] as { totalScanned: number };
    expect(summary.totalScanned).toBe(5);
  });

  it("should handle all supported PII types in piiDetected without error", async () => {
    const day0 = dateOffset(0);
    const allTypes: Record<string, number> = {
      EMAIL: 1,
      SSN: 1,
      CREDIT_CARD: 1,
      PHONE_US: 1,
      PHONE_INTL: 1,
      IPV4: 1,
      IPV6: 1,
      AWS_ACCESS_KEY: 1,
      AWS_SECRET_KEY: 1,
      GITHUB_TOKEN: 1,
      STRIPE_KEY: 1,
      GENERIC_API_KEY: 1,
      IBAN: 1,
      PASSPORT_US: 1,
      DRIVERS_LICENSE: 1,
      ZIP_CODE: 1,
      DATE_OF_BIRTH: 1,
      STREET_ADDRESS: 1,
      PERSON_NAME: 1,
      ORGANIZATION: 1,
      LOCATION: 1,
      MEDICAL_TERM: 1,
    };

    mockStorage[`stats:${day0}`] = makeStatsEntry(day0, {
      piiDetected: allTypes,
    });

    await expect(fireAlarm("weekly-summary")).resolves.toBeUndefined();

    const summary = mockStorage["weeklySummary"] as { totalDetections: number };
    // 22 types × 1 each = 22
    expect(summary.totalDetections).toBe(22);
  });
});

// ---------------------------------------------------------------------------
// Unknown alarm name (no-op dispatch)
// ---------------------------------------------------------------------------

describe("unknown alarm name", () => {
  beforeEach(() => {
    initAlarmHandler();
  });

  it("should not throw and should not modify storage for an unknown alarm", async () => {
    mockStorage["someKey"] = "untouched";

    await expect(fireAlarm("some-unknown-alarm")).resolves.toBeUndefined();

    expect(mockStorage["someKey"]).toBe("untouched");
  });

  it("should not call storage.local.set for an unknown alarm", async () => {
    await fireAlarm("nonexistent");

    expect(chromeMock.storage.local.set).not.toHaveBeenCalled();
  });
});
