/**
 * Shared JSON parsing and type-guard helpers for provider adapters.
 *
 * Centralises `safeParse` and `isObject` — previously duplicated across
 * every provider adapter file. Imported by all adapters in `src/providers/`.
 *
 * Architecture layer: Providers (shared utility)
 */

/**
 * Try to parse a JSON string. Returns `null` on failure instead of throwing.
 *
 * @param text - The raw string to parse.
 * @returns The parsed value, or `null` if parsing fails.
 *
 * @example
 * ```ts
 * const obj = safeParse('{"key": 1}') // { key: 1 }
 * const bad = safeParse('not json')    // null
 * ```
 */
export function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Type guard: checks that a value is a non-null, non-array object.
 *
 * @param value - The value to check.
 * @returns `true` if value is a plain object.
 *
 * @example
 * ```ts
 * isObject({ a: 1 }) // true
 * isObject([1, 2])    // false
 * isObject(null)      // false
 * ```
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
