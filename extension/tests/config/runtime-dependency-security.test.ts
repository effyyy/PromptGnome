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

  it("should keep audited transitive build/test tools on patched versions", () => {
    const packageJson = JSON.parse(readRelative("package.json")) as {
      pnpm?: {
        overrides?: Record<string, string>;
        patchedDependencies?: Record<string, string>;
      };
    };
    const overrides = packageJson.pnpm?.overrides ?? {};
    const patchedDependencies = packageJson.pnpm?.patchedDependencies ?? {};
    const lockfile = readRelative("pnpm-lock.yaml");

    expect(overrides["@parcel/reporter-dev-server"]).toBe("2.16.4");
    expect(patchedDependencies["@parcel/reporter-dev-server@2.16.4"]).toBe(
      "patches/@parcel__reporter-dev-server@2.16.4.patch",
    );
    expect(overrides["content-security-policy-parser"]).toBe("0.6.0");
    expect(overrides["esbuild"]).toBe("0.28.0");
    expect(overrides["msgpackr"]).toBe("1.11.9");
    expect(overrides["svelte"]).toBe("5.55.9");
    expect(overrides["tsup"]).toBe("8.5.1");
    expect(overrides["picomatch@<4.0.0"]).toBe("2.3.2");
    expect(overrides["picomatch@>=4.0.0 <4.0.4"]).toBe("4.0.4");
    expect(overrides["yaml@>=1.0.0 <2.0.0"]).toBe("1.10.3");
    expect(overrides["yaml@>=2.0.0 <2.8.3"]).toBe("2.9.0");
    expect(overrides["brace-expansion@>=5.0.0 <5.0.6"]).toBe("5.0.6");

    for (const vulnerableLockEntry of [
      "@parcel/reporter-dev-server@2.9.3:",
      "brace-expansion@5.0.5:",
      "content-security-policy-parser@0.4.1:",
      "esbuild@0.18.20:",
      "esbuild@0.21.5:",
      "msgpackr@1.8.5:",
      "picomatch@2.3.1:",
      "picomatch@4.0.3:",
      "svelte@4.2.2:",
      "tsup@7.2.0:",
      "vite@5.4.21:",
      "yaml@1.10.2:",
      "yaml@2.8.2:",
    ]) {
      expect(lockfile).not.toContain(vulnerableLockEntry);
    }
  });
});
