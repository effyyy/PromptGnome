/**
 * Zod CJS/ESM compatibility shim for Plasmo bundler.
 *
 * Plasmo's bundler compiles named import `{ z }` to `(0, _zod.z)` which
 * fails at runtime. This module provides a single source for the workaround
 * plus derived key tuples used across multiple schema files.
 *
 * Architecture layer: Shared (build compatibility)
 */

// Workaround for Plasmo bundler Zod CJS/ESM interop issue:
// Named import `{ z }` is compiled to `(0, _zod.z)` which fails at runtime.
import * as ZodModule from "zod";

/** Re-exported Zod instance that works with both CJS and ESM bundling. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const z = (ZodModule as any).z || ZodModule;

/** Type-level helper that mirrors `z.infer` for the CJS/ESM workaround. */
export type ZodInfer<T extends ZodModule.ZodType> = T["_output"];

import { PII_TYPES, PROVIDER_NAMES } from "~src/shared/constants";

/** All PII type keys as a readonly tuple for use with `z.enum`. */
export const piiTypeKeys = Object.keys(PII_TYPES) as [
  keyof typeof PII_TYPES,
  ...(keyof typeof PII_TYPES)[],
];

/** All provider name keys as a readonly tuple for use with `z.enum`. */
export const providerKeys = Object.keys(PROVIDER_NAMES) as [
  keyof typeof PROVIDER_NAMES,
  ...(keyof typeof PROVIDER_NAMES)[],
];
