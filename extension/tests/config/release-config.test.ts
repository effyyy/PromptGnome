import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

const REPO_ROOT = join(__dirname, "..", "..", "..")

describe("release-please config", () => {
  it("does not use parent-directory pathing for package changelogs", () => {
    const config = JSON.parse(
      readFileSync(
        join(REPO_ROOT, ".github", "release-please-config.json"),
        "utf8",
      ),
    ) as {
      packages?: Record<string, { "changelog-path"?: string }>
    }

    for (const [packagePath, packageConfig] of Object.entries(config.packages ?? {})) {
      const changelogPath = packageConfig["changelog-path"]
      if (changelogPath === undefined) continue

      expect(
        changelogPath.split(/[\\/]+/),
        `${packagePath} changelog-path must stay inside the release package`,
      ).not.toContain("..")
    }
  })
})
