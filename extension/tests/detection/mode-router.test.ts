/**
 * Tests for the detection mode router.
 * Verifies correct pipeline composition per slider position.
 */

import { describe, it, expect, vi } from "vitest";
import type { PIIMatch } from "~src/detection/types";

// Mock dependencies
vi.mock("~src/detection/regex-engine", () => ({
  detectPII: vi.fn(() => []),
}));
vi.mock("~src/detection/code-block-filter", () => ({
  filterCodeBlocks: vi.fn((_text: string, matches: PIIMatch[]) => matches),
}));
vi.mock("~src/detection/cross-detector-voting", () => ({
  applyVoting: vi.fn((regex: PIIMatch[], ner: PIIMatch[]) => [...regex, ...ner]),
}));
vi.mock("~src/detection/calibration", () => ({
  calibrateConfidence: vi.fn((c: number) => c),
}));

const { detectPII } = await import("~src/detection/regex-engine");
const { applyVoting } = await import("~src/detection/cross-detector-voting");
const { runDetection } = await import("~src/detection/mode-router");

describe("mode-router", () => {
  describe("speed mode", () => {
    it("should run regex only — no NER", async () => {
      const emailMatch: PIIMatch = {
        type: "EMAIL", value: "a@b.com", start: 0, end: 7,
        confidence: 0.95, source: "regex",
      };
      (detectPII as ReturnType<typeof vi.fn>).mockReturnValue([emailMatch]);

      const result = await runDetection("Hello a@b.com", "speed");
      expect(result.matches).toHaveLength(1);
      expect(result.nerTimeMs).toBeNull();
    });

    it("should still apply voting (pass-through with empty NER)", async () => {
      (detectPII as ReturnType<typeof vi.fn>).mockReturnValue([]);
      await runDetection("Hello", "speed");
      expect(applyVoting).toHaveBeenCalledWith([], []);
    });
  });

  describe("balanced mode", () => {
    it("should include nerTimeMs when NER runs", async () => {
      (detectPII as ReturnType<typeof vi.fn>).mockReturnValue([]);
      const result = await runDetection("Hello world", "balanced");
      // NER attempted (may return empty, but nerTimeMs should be set)
      expect(result.nerTimeMs).not.toBeNull();
    });
  });

  describe("maximum mode", () => {
    it("should include nerTimeMs when NER runs", async () => {
      (detectPII as ReturnType<typeof vi.fn>).mockReturnValue([]);
      const result = await runDetection("Hello world", "maximum");
      expect(result.nerTimeMs).not.toBeNull();
    });
  });
});
