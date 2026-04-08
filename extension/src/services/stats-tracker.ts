/**
 * Stats tracker — records and aggregates detection statistics.
 *
 * Each calendar day is stored as an independent {@link StatsEntry} under the
 * key `stats:YYYY-MM-DD` in `chrome.storage.local`.  Statistics older than
 * 90 days are automatically pruned on every write to keep storage bounded.
 */

import { PII_TYPES } from "~src/shared/constants";
import { StatsEntrySchema } from "~src/shared/schemas";
import type { StatsEntry } from "~src/shared/schemas";

/** Prefix for daily stats storage keys. */
const STATS_KEY_PREFIX = "stats:";

/** Maximum age (in days) before a stats entry is pruned. */
const MAX_AGE_DAYS = 90;

// ---------------------------------------------------------------------------
// Chrome storage helpers
// ---------------------------------------------------------------------------

/** Promise wrapper around `chrome.storage.local.get`. */
function localGet(
  keys: string | string[] | null,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(keys, (items) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(items);
      }
    });
  });
}

/** Promise wrapper around `chrome.storage.local.set`. */
function localSet(items: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(items, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
}

/** Promise wrapper around `chrome.storage.local.remove`. */
function localRemove(keys: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.remove(keys, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Returns today's date as `YYYY-MM-DD`. */
function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Returns the storage key for a given date string. */
function storageKey(date: string): string {
  return `${STATS_KEY_PREFIX}${date}`;
}

/** Builds a blank {@link StatsEntry} for the given date. */
function emptyEntry(date: string): StatsEntry {
  const piiDetected: Record<string, number> = {};
  for (const key of Object.keys(PII_TYPES)) {
    piiDetected[key] = 0;
  }
  return {
    date,
    messagesScanned: 0,
    piiDetected,
    messagesBlocked: 0,
    messagesSentAnyway: 0,
  } as StatsEntry;
}

/**
 * Loads a single day's stats from storage, returning a blank entry when
 * storage is empty or the stored value is invalid.
 */
async function loadDay(date: string): Promise<StatsEntry> {
  const key = storageKey(date);
  const items = await localGet(key);
  const raw = items[key];
  if (!raw) return emptyEntry(date);
  const parsed = StatsEntrySchema.safeParse(raw);
  return parsed.success ? parsed.data : emptyEntry(date);
}

/** Persists a single day's stats entry. */
async function saveDay(entry: StatsEntry): Promise<void> {
  await localSet({ [storageKey(entry.date)]: entry });
}

/**
 * Removes stats entries older than {@link MAX_AGE_DAYS}.  Reads all keys,
 * identifies those matching the stats prefix with a stale date, and deletes.
 *
 * Called by the alarm handler on an hourly schedule — not on every write.
 */
export async function pruneOldStats(): Promise<void> {
  const all = await localGet(null);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - MAX_AGE_DAYS);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const staleKeys = Object.keys(all).filter((k) => {
    if (!k.startsWith(STATS_KEY_PREFIX)) return false;
    return k.slice(STATS_KEY_PREFIX.length) < cutoffStr;
  });

  if (staleKeys.length > 0) {
    await localRemove(staleKeys);
  }
}

/** Merges multiple {@link StatsEntry} objects into a single aggregate. */
function aggregateEntries(entries: StatsEntry[]): StatsEntry {
  const result = emptyEntry(entries[0]?.date ?? todayKey());
  for (const entry of entries) {
    result.messagesScanned += entry.messagesScanned;
    result.messagesBlocked += entry.messagesBlocked;
    result.messagesSentAnyway += entry.messagesSentAnyway;
    const resultDetected = result.piiDetected as Record<string, number>;
    const entryDetected = entry.piiDetected as Record<string, number>;
    for (const key of Object.keys(entryDetected)) {
      resultDetected[key] = (resultDetected[key] ?? 0) + (entryDetected[key] ?? 0);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Public API — recording
// ---------------------------------------------------------------------------

/**
 * Records that a message was scanned on the given provider.
 * @param _provider - The AI provider (reserved for future per-provider stats).
 */
export async function recordScan(_provider: string): Promise<void> {
  try {
    const entry = await loadDay(todayKey());
    entry.messagesScanned += 1;
    await saveDay(entry);
  } catch {
    // Silently swallow — stats are non-critical
  }
}

/**
 * Records PII detections of a specific type.
 * @param type  - The PII type key (e.g. `"EMAIL"`).
 * @param count - Number of detections to add.
 */
export async function recordDetection(
  type: string,
  count: number,
): Promise<void> {
  try {
    const entry = await loadDay(todayKey());
    const detected = entry.piiDetected as Record<string, number>;
    detected[type] = (detected[type] ?? 0) + count;
    await saveDay(entry);
  } catch {
    // Silently swallow
  }
}

/** Records that a message was blocked (user chose not to send). */
export async function recordBlock(): Promise<void> {
  try {
    const entry = await loadDay(todayKey());
    entry.messagesBlocked += 1;
    await saveDay(entry);
  } catch {
    // Silently swallow
  }
}

/** Records that the user sent a message despite a PII warning. */
export async function recordSendAnyway(): Promise<void> {
  try {
    const entry = await loadDay(todayKey());
    entry.messagesSentAnyway += 1;
    await saveDay(entry);
  } catch {
    // Silently swallow
  }
}

// ---------------------------------------------------------------------------
// Public API — retrieval
// ---------------------------------------------------------------------------

/** Returns today's aggregated statistics. */
export async function getTodayStats(): Promise<StatsEntry> {
  try {
    return await loadDay(todayKey());
  } catch {
    return emptyEntry(todayKey());
  }
}

/** Returns statistics aggregated over the last 7 days. */
export async function getWeekStats(): Promise<StatsEntry> {
  try {
    const dates: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dates.push(d.toISOString().slice(0, 10));
    }
    const entries = await Promise.all(dates.map(loadDay));
    return aggregateEntries(entries);
  } catch {
    return emptyEntry(todayKey());
  }
}

/** Returns statistics aggregated across all stored days. */
export async function getAllTimeStats(): Promise<StatsEntry> {
  try {
    const all = await localGet(null);
    const entries: StatsEntry[] = [];
    for (const [key, value] of Object.entries(all)) {
      if (!key.startsWith(STATS_KEY_PREFIX)) continue;
      const parsed = StatsEntrySchema.safeParse(value);
      if (parsed.success) entries.push(parsed.data);
    }
    if (entries.length === 0) return emptyEntry(todayKey());
    return aggregateEntries(entries);
  } catch {
    return emptyEntry(todayKey());
  }
}
