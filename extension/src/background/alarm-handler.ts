/**
 * Scheduled tasks for cleanup and summaries.
 *
 * Registers `chrome.alarms` on extension install and handles their
 * callbacks.  Two alarms are managed:
 *
 * - **cleanup-expired** – fires every hour; prunes stats entries older
 *   than 90 days from `chrome.storage.local`.
 * - **weekly-summary** – fires weekly on Monday at 09:00 local time;
 *   prepares a summary of the previous week's detection activity.
 *
 * SECURITY: no PII values are accessed or logged by this module.
 */

import { StatsEntrySchema } from "~src/shared/schemas";
import { pruneOldStats } from "~src/services/stats-tracker";
import { createLogger } from "~src/utils/logger";
import { PRO_BUILD } from "~src/shared/build-flags";
import { sync as telemetrySync } from "~src/services/telemetry-sync-port";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Prefix for daily stats storage keys (matches stats-tracker.ts). */
const STATS_KEY_PREFIX = "stats:";

/** Alarm name for the hourly expired-data cleanup task. */
const ALARM_CLEANUP = "cleanup-expired";

/** Alarm name for the weekly summary task. */
const ALARM_WEEKLY_SUMMARY = "weekly-summary";

/** Number of milliseconds in one day. */
const MS_PER_DAY = 24 * 60 * 60 * 1_000;

/** Number of minutes in one hour (used by the alarms API). */
const MINUTES_PER_HOUR = 60;

/** Number of minutes in one week. */
const MINUTES_PER_WEEK = 7 * 24 * 60;

/** Alarm name for the telemetry sync task (every 6 hours). */
const ALARM_TELEMETRY_SYNC = "telemetry-sync";

/** Number of minutes in 6 hours. */
const MINUTES_PER_6_HOURS = 6 * 60;

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

const log = createLogger("alarm-handler");

// ---------------------------------------------------------------------------
// Alarm registration
// ---------------------------------------------------------------------------

/**
 * Computes the delay in minutes from now until the next Monday at 09:00
 * in the user's local timezone.
 * @returns Minutes until the next Monday 09:00.
 */
function minutesUntilNextMonday9am(): number {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sunday .. 6 = Saturday

  // Days until next Monday (1).  If today is Monday, check the hour.
  let daysUntilMonday = (1 - dayOfWeek + 7) % 7;
  if (daysUntilMonday === 0) {
    // It is Monday -- only schedule for today if before 09:00.
    const pastTarget = now.getHours() >= 9;
    if (pastTarget) {
      daysUntilMonday = 7;
    }
  }

  const target = new Date(now);
  target.setDate(now.getDate() + daysUntilMonday);
  target.setHours(9, 0, 0, 0);

  const delayMs = target.getTime() - now.getTime();
  return Math.max(1, Math.ceil(delayMs / 60_000));
}

/**
 * Creates the two recurring alarms used by the extension.
 * Safe to call multiple times; Chrome deduplicates by alarm name.
 */
export async function registerAlarms(): Promise<void> {
  try {
    await chrome.alarms.create(ALARM_CLEANUP, {
      periodInMinutes: MINUTES_PER_HOUR,
    });

    const delayMinutes = minutesUntilNextMonday9am();
    await chrome.alarms.create(ALARM_WEEKLY_SUMMARY, {
      delayInMinutes: delayMinutes,
      periodInMinutes: MINUTES_PER_WEEK,
    });

    if (PRO_BUILD) {
      await chrome.alarms.create(ALARM_TELEMETRY_SYNC, {
        periodInMinutes: MINUTES_PER_6_HOURS,
      });
    }

    log.info("Alarms registered", {
      cleanup: "every 60 min",
      summary: `first in ${delayMinutes} min`,
    });
  } catch {
    log.error("Failed to register alarms");
  }
}

// ---------------------------------------------------------------------------
// Cleanup handler
// ---------------------------------------------------------------------------

/**
 * Delegates stats pruning to the canonical implementation in stats-tracker.
 */
async function handleCleanup(): Promise<void> {
  try {
    await pruneOldStats();
    log.info("Expired stats pruned");
  } catch {
    log.error("Cleanup handler failed");
  }
}

// ---------------------------------------------------------------------------
// Weekly summary handler
// ---------------------------------------------------------------------------

/**
 * Prepares a summary of the previous 7 days' detection statistics and
 * stores it under a dedicated storage key for the popup/side-panel to
 * display.
 *
 * Stats are stored as individual `stats:YYYY-MM-DD` keys, so we read
 * only the 7 keys that fall within the summary window.
 */
async function handleWeeklySummary(): Promise<void> {
  try {
    const now = Date.now();
    const weekDates: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(now - i * MS_PER_DAY);
      weekDates.push(d.toISOString().slice(0, 10));
    }

    const weekKeys = weekDates.map((d) => `${STATS_KEY_PREFIX}${d}`);
    const result = await chrome.storage.local.get(weekKeys);

    let totalScanned = 0;
    let totalBlocked = 0;
    let totalDetections = 0;

    for (const key of weekKeys) {
      const raw = result[key];
      if (!raw) continue;
      const parsed = StatsEntrySchema.safeParse(raw);
      if (!parsed.success) continue;
      const entry = parsed.data;
      totalScanned += entry.messagesScanned;
      totalBlocked += entry.messagesBlocked;
      for (const count of Object.values(entry.piiDetected)) {
        totalDetections += count as number;
      }
    }

    const summary = {
      weekStarting: weekDates[weekDates.length - 1],
      totalScanned,
      totalBlocked,
      totalDetections,
      generatedAt: new Date(now).toISOString(),
    };

    await chrome.storage.local.set({ weeklySummary: summary });
    log.info("Weekly summary generated", {
      totalScanned,
      totalDetections,
    });
  } catch {
    log.error("Weekly summary handler failed");
  }
}

// ---------------------------------------------------------------------------
// Telemetry sync handler
// ---------------------------------------------------------------------------

/**
 * Uploads buffered telemetry events and clears the local buffer on success.
 */
async function handleTelemetrySync(): Promise<void> {
  try {
    await telemetrySync();
    log.info("Telemetry sync completed");
  } catch {
    log.error("Telemetry sync handler failed");
  }
}

// ---------------------------------------------------------------------------
// Alarm dispatch
// ---------------------------------------------------------------------------

/**
 * Handles a fired alarm by dispatching to the correct handler.
 * @param alarm - The alarm that fired.
 */
async function onAlarmFired(alarm: chrome.alarms.Alarm): Promise<void> {
  switch (alarm.name) {
    case ALARM_CLEANUP:
      await handleCleanup();
      break;

    case ALARM_WEEKLY_SUMMARY:
      await handleWeeklySummary();
      break;

    case ALARM_TELEMETRY_SYNC:
      if (PRO_BUILD) { await handleTelemetrySync(); }
      break;

    default:
      log.warn("Unknown alarm fired", { name: alarm.name });
  }
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

/**
 * Registers the alarm listener on `chrome.alarms.onAlarm`.
 * Call once during service worker startup.
 */
export function initAlarmHandler(): void {
  chrome.alarms.onAlarm.addListener((alarm) => {
    onAlarmFired(alarm).catch(() => {
      log.error("Alarm handler threw unexpectedly", { name: alarm.name });
    });
  });
  log.info("Alarm handler initialized");
}
