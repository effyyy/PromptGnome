/**
 * Session-scoped entity-to-placeholder mapping for PII anonymization.
 *
 * Belongs to the anonymization layer. Maintains bidirectional maps between
 * PII values and their `[TYPE_N]` placeholder strings for a single browser
 * session, enabling consistent re-hydration of AI responses.
 */

// ---------------------------------------------------------------------------
// Architecture layer: Anonymization — session state
// Dependencies: ~src/utils/logger
// ---------------------------------------------------------------------------

import { createLogger } from "~src/utils/logger"

const log = createLogger("session-mapper")

/**
 * Opaque serializable representation of a {@link SessionMapper} state.
 *
 * Keys are either `[TYPE_N]` placeholder strings or `__counter:TYPE` entries
 * that track the per-type counter. Values are always strings.
 */
export type SerializableSessionMap = Record<string, string>

// ---------------------------------------------------------------------------
// SessionMapper
// ---------------------------------------------------------------------------

/**
 * Maintains a bidirectional mapping between raw PII values and their
 * `[TYPE_N]` placeholder strings within a single session.
 *
 * The same raw value always resolves to the same placeholder (idempotent).
 * Counters are tracked per placeholder-type label so that independent types
 * (e.g. `EMAIL` vs `SSN`) each start at `_1`.
 *
 * @example
 * ```ts
 * const mapper = new SessionMapper()
 * mapper.getOrCreatePlaceholder("EMAIL", "jane@example.com") // "[EMAIL_1]"
 * mapper.getOrCreatePlaceholder("EMAIL", "bob@example.com")  // "[EMAIL_2]"
 * mapper.getOrCreatePlaceholder("EMAIL", "jane@example.com") // "[EMAIL_1]"
 * mapper.getOriginalValue("[EMAIL_1]")                        // "jane@example.com"
 * ```
 */
export class SessionMapper {
  /** Maps `"TYPE::value"` composite key → placeholder string. */
  private readonly valueToPlaceholder: Map<string, string>

  /** Maps placeholder string → original PII value. */
  private readonly placeholderToValue: Map<string, string>

  /** Per-type counters tracking how many distinct values have been seen. */
  private readonly counters: Map<string, number>

  constructor() {
    this.valueToPlaceholder = new Map()
    this.placeholderToValue = new Map()
    this.counters = new Map()
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Builds a composite key used as the key in {@link valueToPlaceholder}.
   *
   * @param type - The placeholder type label (e.g. `"EMAIL"`).
   * @param value - The raw PII value.
   * @returns A string that uniquely identifies this type+value combination.
   */
  private static compositeKey(type: string, value: string): string {
    return `${type}::${value}`
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Returns the existing placeholder for `value` under `type`, or creates and
   * stores a new one if this is the first time the value has been seen.
   *
   * @param type - Placeholder type label (e.g. `"EMAIL"`, `"NAME"`).
   * @param value - The raw PII string to map.
   * @returns The `[TYPE_N]` placeholder string.
   *
   * @example
   * ```ts
   * mapper.getOrCreatePlaceholder("SSN", "123-45-6789") // "[SSN_1]"
   * ```
   */
  getOrCreatePlaceholder(type: string, value: string): string {
    const key = SessionMapper.compositeKey(type, value)
    const existing = this.valueToPlaceholder.get(key)
    if (existing !== undefined) {
      log.info("Placeholder reused", { type, placeholder: existing })
      return existing
    }

    const count = (this.counters.get(type) ?? 0) + 1
    this.counters.set(type, count)

    const placeholder = `[${type}_${count}]`
    this.valueToPlaceholder.set(key, placeholder)
    this.placeholderToValue.set(placeholder, value)

    log.info("Placeholder created", { type, placeholder, counterForType: count })
    return placeholder
  }

  /**
   * Looks up the original PII value for a given placeholder string.
   *
   * @param placeholder - A `[TYPE_N]` string previously returned by
   *   {@link getOrCreatePlaceholder}.
   * @returns The original PII value, or `null` if the placeholder is unknown.
   *
   * @example
   * ```ts
   * mapper.getOriginalValue("[SSN_1]") // "123-45-6789" or null
   * ```
   */
  getOriginalValue(placeholder: string): string | null {
    return this.placeholderToValue.get(placeholder) ?? null
  }

  /**
   * Serializes the current mapping state into a plain object suitable for
   * storage (e.g. encrypted IndexedDB).
   *
   * The serialized form contains:
   * - One entry per placeholder: `"[TYPE_N]"` → original value.
   * - One counter entry per type: `"__counter:TYPE"` → stringified count.
   *
   * @returns A plain `Record<string, string>` snapshot of current state.
   */
  toSerializable(): SerializableSessionMap {
    const result: SerializableSessionMap = {}

    for (const [placeholder, value] of this.placeholderToValue) {
      result[placeholder] = value
    }

    for (const [type, count] of this.counters) {
      result[`__counter:${type}`] = String(count)
    }

    log.info("Serialized mapper state", {
      placeholderCount: this.placeholderToValue.size,
      typeCounters: Object.fromEntries(this.counters),
    })
    return result
  }

  /**
   * Reconstructs a {@link SessionMapper} from a previously serialized snapshot.
   *
   * Counter entries (prefixed `__counter:`) are restored so that new
   * placeholders created after deserialization continue from the correct index.
   *
   * @param data - A plain object produced by {@link toSerializable}.
   * @returns A fully initialized `SessionMapper` instance.
   *
   * @example
   * ```ts
   * const snap = mapper.toSerializable()
   * const restored = SessionMapper.fromSerializable(snap)
   * ```
   */
  static fromSerializable(data: SerializableSessionMap): SessionMapper {
    const mapper = new SessionMapper()

    for (const [key, value] of Object.entries(data)) {
      if (key.startsWith("__counter:")) {
        const type = key.slice("__counter:".length)
        mapper.counters.set(type, Number(value))
      } else {
        // key is a placeholder like "[EMAIL_1]"
        mapper.placeholderToValue.set(key, value)

        // Derive the composite value→placeholder key.
        // We need to know the type from the placeholder pattern [TYPE_N].
        const match = /^\[([A-Z0-9_]+)_\d+\]$/.exec(key)
        if (match !== null) {
          const type = match[1]
          if (type !== undefined) {
            mapper.valueToPlaceholder.set(
              SessionMapper.compositeKey(type, value),
              key,
            )
          }
        }
      }
    }

    log.info("Deserialized mapper from snapshot", {
      placeholderCount: mapper.placeholderToValue.size,
      typeCounters: Object.fromEntries(mapper.counters),
    })
    return mapper
  }
}
