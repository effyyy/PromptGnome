/**
 * Privacy-safe audit logger — records detection events without storing PII.
 *
 * Every log entry captures the provider, entity type, action taken, and
 * optionally the placeholder that was substituted — but NEVER the original
 * PII value.  Entries are stored in `chrome.storage.local` under the
 * {@link CONFIG_KEYS.AUDIT_LOG} key with a FIFO cap of 1 000 entries.
 */

import { CONFIG_KEYS } from "~src/shared/constants";
import { AuditLogEntrySchema } from "~src/shared/schemas";
import type { AuditLogEntry } from "~src/shared/schemas";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum number of audit log entries retained in storage. */
const MAX_ENTRIES = 1000;

// ---------------------------------------------------------------------------
// Chrome storage helpers
// ---------------------------------------------------------------------------

/**
 * Promise wrapper around `chrome.storage.local.get`.
 *
 * @param keys - Storage keys to retrieve.
 * @returns The stored key-value pairs.
 */
function localGet(keys: string | string[]): Promise<Record<string, unknown>> {
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

/**
 * Promise wrapper around `chrome.storage.local.set`.
 *
 * @param items - Key-value pairs to persist.
 */
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

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Loads the current audit log array from storage. */
async function loadLog(): Promise<AuditLogEntry[]> {
  const items = await localGet(CONFIG_KEYS.AUDIT_LOG);
  const raw = items[CONFIG_KEYS.AUDIT_LOG];

  if (!Array.isArray(raw)) {
    return [];
  }

  const entries: AuditLogEntry[] = [];
  for (const item of raw) {
    const parsed = AuditLogEntrySchema.safeParse(item);
    if (parsed.success) {
      entries.push(parsed.data);
    }
  }
  return entries;
}

/** Persists the audit log array, enforcing the FIFO size cap. */
async function saveLog(entries: AuditLogEntry[]): Promise<void> {
  const trimmed =
    entries.length > MAX_ENTRIES
      ? entries.slice(entries.length - MAX_ENTRIES)
      : entries;

  await localSet({ [CONFIG_KEYS.AUDIT_LOG]: trimmed });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Records a detection event in the audit log.
 *
 * The entry is appended to the end of the log.  If the log exceeds the
 * maximum size (1 000 entries), the oldest entries are evicted (FIFO).
 *
 * @param entry - Detection event details (provider, entity type, action).
 */
export async function logDetection(entry: {
  provider: string;
  entityType: string;
  action: "warned" | "blocked" | "anonymized" | "dismissed";
  placeholder?: string;
}): Promise<void> {
  try {
    const logEntry: AuditLogEntry = AuditLogEntrySchema.parse({
      timestamp: Date.now(),
      provider: entry.provider,
      entityType: entry.entityType,
      action: entry.action,
      placeholderUsed: entry.placeholder ?? "",
    });

    const logs = await loadLog();
    logs.push(logEntry);
    await saveLog(logs);
  } catch {
    // Silently swallow — audit logging is non-critical
  }
}

/**
 * Retrieves recent audit log entries, newest first.
 *
 * @param limit - Maximum number of entries to return (default: 100).
 * @returns An array of audit log entries in reverse chronological order.
 */
export async function getRecentLogs(
  limit: number = 100,
): Promise<AuditLogEntry[]> {
  try {
    const logs = await loadLog();
    const sorted = logs.sort((a, b) => b.timestamp - a.timestamp);
    return sorted.slice(0, limit);
  } catch {
    return [];
  }
}

/**
 * Removes all audit log entries from storage.
 */
export async function clearLogs(): Promise<void> {
  try {
    await localSet({ [CONFIG_KEYS.AUDIT_LOG]: [] });
  } catch {
    // Silently swallow
  }
}

/**
 * Exports all audit log entries as a formatted JSON string.
 *
 * @returns A pretty-printed JSON string of all log entries.
 */
export async function exportLogs(): Promise<string> {
  try {
    const logs = await loadLog();
    return JSON.stringify(logs, null, 2);
  } catch {
    return "[]";
  }
}
