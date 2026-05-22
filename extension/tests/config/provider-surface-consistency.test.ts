import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const EXTENSION_ROOT = join(__dirname, "..", "..");

function readRelative(path: string): string {
  return readFileSync(join(EXTENSION_ROOT, path), "utf8");
}

describe("provider surface consistency", () => {
  it("should grant and wire the root perplexity.ai domain everywhere interception depends on it", () => {
    const packageJson = JSON.parse(readRelative("package.json")) as {
      manifest?: { host_permissions?: string[] };
    };
    const interceptorSource = readRelative("src/contents/interceptor.ts");
    const overlaySource = readRelative("src/contents/overlay.tsx");
    const highlighterSource = readRelative("src/contents/highlighter.ts");
    const backgroundSource = readRelative("src/background/index.ts");

    expect(interceptorSource).toContain('"https://perplexity.ai/*"');
    expect(packageJson.manifest?.host_permissions).toContain(
      "https://perplexity.ai/*",
    );
    expect(overlaySource).toContain('"https://perplexity.ai/*"');
    expect(highlighterSource).toContain('"https://perplexity.ai/*"');
    expect(backgroundSource).not.toContain(
      'matches: PROVIDER_MATCHES.filter((m) => m !== "https://perplexity.ai/*")',
    );
  });
});
