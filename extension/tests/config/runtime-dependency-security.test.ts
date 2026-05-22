import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const EXTENSION_ROOT = join(__dirname, "..", "..");

function readRelative(path: string): string {
  return readFileSync(join(EXTENSION_ROOT, path), "utf8");
}

describe("runtime dependency security", () => {
  it("should pin protobufjs above the audited vulnerable runtime range", () => {
    const packageJson = JSON.parse(readRelative("package.json")) as {
      pnpm?: { overrides?: Record<string, string> };
    };
    const lockfile = readRelative("pnpm-lock.yaml");

    expect(packageJson.pnpm?.overrides?.protobufjs).toBe("7.5.8");
    expect(lockfile).not.toContain("protobufjs@6.11.4:");
  });
});
