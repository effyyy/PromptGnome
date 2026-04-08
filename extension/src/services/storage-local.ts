/**
 * Shared wrappers around `chrome.storage.local`.
 * Keeps callback-style API handling in one place.
 */

/**
 * Reads one or more keys from `chrome.storage.local`.
 *
 * @param keys - A single key string, array of key strings, or null for all.
 * @returns A promise resolving to the items object from storage.
 * @throws If `chrome.runtime.lastError` is set after the get call.
 */
export function localGet(
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

/**
 * Writes one or more key-value pairs to `chrome.storage.local`.
 *
 * @param items - The key-value pairs to store.
 * @returns A promise that resolves when the write is complete.
 * @throws If `chrome.runtime.lastError` is set after the set call.
 */
export function localSet(items: Record<string, unknown>): Promise<void> {
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
