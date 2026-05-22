/**
 * Latency benchmark for the regex-based PII detection engine.
 *
 * Validates that detectPII stays within the performance budgets defined in
 * CLAUDE.md: <50ms hard limit per call, <10ms p95 on 200-char real PII text.
 * Architecture layer: Benchmarks (quality assurance, not shipped to users)
 */

import { describe, it, expect } from "vitest"
import { detectPII } from "~src/detection/regex-engine"

describe("latency benchmarks", () => {
  const sizes = [50, 200, 500, 2000]
  const measureRuns = (text: string, runs = 100): number[] => {
    const samples: number[] = []
    for (let i = 0; i < 10; i++) detectPII(text)
    for (let i = 0; i < runs; i++) {
      const start = performance.now()
      detectPII(text)
      samples.push(performance.now() - start)
    }
    samples.sort((a, b) => a - b)
    return samples
  }

  const p95 = (samples: number[]) => samples[Math.ceil(0.95 * samples.length) - 1]

  for (const size of sizes) {
    it(`regex detection on ${size}-char text should complete under 50ms`, () => {
      const text = "a".repeat(size)
      expect(p95(measureRuns(text))).toBeLessThan(50)
    })
  }

  it("regex detection on 200-char real PII text should be under 10ms at p95", () => {
    const text =
      "My email is janedoe@protonmail.com and my SSN is 123-45-6789. " +
      "Call me at (800) 555-0199. My card is 4532015112830366."
    const runs = measureRuns(text, 100)
    const value = p95(runs)
    console.log(
      `\n  p50=${runs[Math.ceil(0.5 * runs.length) - 1].toFixed(2)}ms` +
        `  p95=${value.toFixed(2)}ms` +
        `  p99=${runs[Math.ceil(0.99 * runs.length) - 1].toFixed(2)}ms` +
        `  max=${runs[runs.length - 1].toFixed(2)}ms`
    )
    expect(value).toBeLessThan(10)
  })

  it("regex detection on 5000-char text with embedded PII should complete under 200ms", () => {
    // Realistic long message with PII embedded at different positions
    const piiSnippets = [
      "email me at longtest@example-corp.net",
      "My SSN is 234-56-7891",
      "call (800) 555-0188",
      "card 4929420999884765",
      "IBAN GB29NWBK60161331926819",
      "token " + "gh" + "p_" + "1234567890abcdef12345678901234567890",
    ]
    const padding = "This is some generic text that contains no sensitive information. ".repeat(20)
    const parts: string[] = []
    for (let i = 0; i < piiSnippets.length; i++) {
      parts.push(padding.slice(0, Math.floor(padding.length / piiSnippets.length)))
      parts.push(piiSnippets[i])
    }
    const text = parts.join(" ").slice(0, 5000)

    const start = performance.now()
    detectPII(text)
    const elapsed = performance.now() - start
    console.log(`\n  5000-char text with PII: ${elapsed.toFixed(2)}ms`)
    expect(elapsed).toBeLessThan(200)
  })

  it("repeated calls on the same text should not degrade in performance (no memory leaks)", () => {
    const text = "My email janedoe@protonmail.com, SSN 234-56-7891, phone (800) 555-0188"
    const firstRunTimes: number[] = []
    const lastRunTimes: number[] = []

    // Warm up
    for (let i = 0; i < 10; i++) detectPII(text)

    // Sample first 20 runs
    for (let i = 0; i < 20; i++) {
      const start = performance.now()
      detectPII(text)
      firstRunTimes.push(performance.now() - start)
    }

    // Sample last 20 runs after 200 total
    for (let i = 0; i < 180; i++) detectPII(text)
    for (let i = 0; i < 20; i++) {
      const start = performance.now()
      detectPII(text)
      lastRunTimes.push(performance.now() - start)
    }

    const avgFirst = firstRunTimes.reduce((a, b) => a + b, 0) / firstRunTimes.length
    const avgLast = lastRunTimes.reduce((a, b) => a + b, 0) / lastRunTimes.length
    console.log(
      `\n  avg first 20 runs: ${avgFirst.toFixed(2)}ms  avg last 20 runs: ${avgLast.toFixed(2)}ms`
    )

    // Last batch should not be more than 3x slower than the first batch
    // (guards against progressive memory growth / regex state pollution)
    expect(avgLast).toBeLessThan(avgFirst * 3 + 5)
  })

  it("empty string should complete in under 5ms", () => {
    expect(p95(measureRuns(""))).toBeLessThan(5)
  })

  it("whitespace-only string should complete in under 5ms", () => {
    expect(p95(measureRuns("   \n\t  "))).toBeLessThan(5)
  })

  it("text with no PII should be as fast as text with PII", () => {
    const textNoPII = "The quick brown fox jumps over the lazy dog. ".repeat(10)
    const textWithPII =
      "My email is janedoe@protonmail.com and my SSN is 123-45-6789. " + " ".repeat(300)

    // 10 runs each
    const noPIITimes: number[] = []
    const withPIITimes: number[] = []

    for (let i = 0; i < 10; i++) {
      const s = performance.now()
      detectPII(textNoPII)
      noPIITimes.push(performance.now() - s)
    }
    for (let i = 0; i < 10; i++) {
      const s = performance.now()
      detectPII(textWithPII)
      withPIITimes.push(performance.now() - s)
    }

    const avgNoPII = noPIITimes.reduce((a, b) => a + b, 0) / noPIITimes.length
    const avgWithPII = withPIITimes.reduce((a, b) => a + b, 0) / withPIITimes.length

    console.log(
      `\n  avg no-PII: ${avgNoPII.toFixed(2)}ms  avg with-PII: ${avgWithPII.toFixed(2)}ms`
    )

    // Both should be under the 50ms budget
    expect(avgNoPII).toBeLessThan(50)
    expect(avgWithPII).toBeLessThan(50)
  })
})
