import { describe, it, expect } from "vitest"
import { SessionMapper } from "~src/anonymization/session-mapper"

describe("SessionMapper", () => {
  it("should create placeholder for new entity", () => {
    const mapper = new SessionMapper()
    const result = mapper.getOrCreatePlaceholder("EMAIL", "test@example.com")
    expect(result).toBe("[EMAIL_1]")
  })

  it("should return same placeholder for same value", () => {
    const mapper = new SessionMapper()
    mapper.getOrCreatePlaceholder("NAME", "Jane Testperson")
    const second = mapper.getOrCreatePlaceholder("NAME", "Jane Testperson")
    expect(second).toBe("[NAME_1]")
  })

  it("should increment counter for different values of same type", () => {
    const mapper = new SessionMapper()
    mapper.getOrCreatePlaceholder("NAME", "Jane Testperson")
    const second = mapper.getOrCreatePlaceholder("NAME", "Bob Testuser")
    expect(second).toBe("[NAME_2]")
  })

  it("should reverse lookup original value from placeholder", () => {
    const mapper = new SessionMapper()
    mapper.getOrCreatePlaceholder("SSN", "123-45-6789")
    expect(mapper.getOriginalValue("[SSN_1]")).toBe("123-45-6789")
  })

  it("should return null for unknown placeholder", () => {
    const mapper = new SessionMapper()
    expect(mapper.getOriginalValue("[SSN_99]")).toBeNull()
  })

  it("should serialize and deserialize round-trip", () => {
    const mapper = new SessionMapper()
    mapper.getOrCreatePlaceholder("EMAIL", "test@example.com")
    mapper.getOrCreatePlaceholder("NAME", "Jane Testperson")

    const serialized = mapper.toSerializable()
    const restored = SessionMapper.fromSerializable(serialized)

    expect(restored.getOriginalValue("[EMAIL_1]")).toBe("test@example.com")
    expect(restored.getOriginalValue("[NAME_1]")).toBe("Jane Testperson")
    expect(restored.getOrCreatePlaceholder("EMAIL", "test@example.com")).toBe("[EMAIL_1]")
    expect(restored.getOrCreatePlaceholder("NAME", "New Person")).toBe("[NAME_2]")
  })

  it("should handle multiple types independently", () => {
    const mapper = new SessionMapper()
    expect(mapper.getOrCreatePlaceholder("EMAIL", "a@b.com")).toBe("[EMAIL_1]")
    expect(mapper.getOrCreatePlaceholder("SSN", "123-45-6789")).toBe("[SSN_1]")
    expect(mapper.getOrCreatePlaceholder("EMAIL", "c@d.com")).toBe("[EMAIL_2]")
  })
})
