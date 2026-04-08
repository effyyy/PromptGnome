/**
 * Offscreen document for local NER inference via Transformers.js.
 *
 * Runs NER models entirely in the browser to detect person names,
 * organisation names, locations, medical terms, and other Tier 3 PII types
 * that regex cannot reliably catch:
 *   - Multilingual DistilBERT NER (Xenova/distilbert-base-multilingual-cased-ner-hrl):
 *     10-language coverage including non-Western names, fast inference
 *
 * Mode-aware inference:
 *   - "balanced": Multilingual DistilBERT only
 *   - "maximum": Routed to backend API (3-detector ensemble) — not handled locally
 *
 * Communication: receives messages via chrome.runtime.onMessage from
 * the service worker, returns PIIMatch-compatible results.
 *
 * Architecture layer: Offscreen Document (NER inference)
 */

import { shouldRejectNERResult } from "~src/detection/ner-blocklist";

/* eslint-disable no-console */
// Only warn/error are logged in this file. Informational console.log calls
// have been removed to keep production consoles clean.

/**
 * Shape of a single raw token returned by the Transformers.js
 * token-classification pipeline.
 *
 * NOTE: Transformers.js (all versions, including v4) does NOT implement
 * `aggregation_strategy` — the option is silently ignored.  The pipeline
 * always returns per-subword-token results with BIO-tagged `entity`
 * labels (e.g. "B-PER", "I-LOC") and no character offsets.
 *
 * We therefore run the pipeline in raw-token mode and aggregate ourselves
 * via {@link aggregateTokens}.
 */
interface RawTokenEntity {
  readonly word: string;
  readonly entity: string;
  readonly score: number;
  readonly index: number;
}

/**
 * Shape of a properly aggregated NER entity after BIO post-processing.
 * Offsets reference the original input text.
 */
interface AggregatedEntity {
  readonly entity_group: string;
  readonly word: string;
  readonly score: number;
  readonly start: number;
  readonly end: number;
}

/**
 * Strips the BIO prefix from an entity tag.
 * "B-PER" → "PER", "I-LOC" → "LOC", "PER" → "PER", "O" → "O".
 *
 * @param tag - Raw entity tag from the model.
 * @returns The base entity label without BIO prefix.
 */
function stripBIO(tag: string): string {
  if (tag.length > 2 && (tag[0] === "B" || tag[0] === "I") && tag[1] === "-") {
    return tag.slice(2);
  }
  return tag;
}

/**
 * Aggregates raw per-token NER output into proper entity spans.
 *
 * Implements the "simple" aggregation strategy from the Python
 * `transformers` library, which Transformers.js has not ported:
 *
 * 1. Groups consecutive tokens that share the same base label
 *    (after stripping B-/I- prefixes). A B- tag always starts a
 *    new entity even if the previous token has the same base label.
 * 2. Merges subword tokens (##-prefixed) into their parent word.
 * 3. Computes the aggregated score as the average across tokens.
 * 4. Computes character-level `start`/`end` by scanning the original
 *    text for each decoded word sequentially.
 *
 * @param tokens - Raw token entities from the pipeline.
 * @param text   - The original input text (used for offset computation).
 * @returns Aggregated entities with `entity_group`, `start`, `end`.
 */
function aggregateTokens(tokens: RawTokenEntity[], text: string): AggregatedEntity[] {
  if (tokens.length === 0) return [];

  // --- Phase 1: compute character offsets for each token ---
  // The library doesn't provide start/end, so we locate each decoded
  // word sequentially in the original text.  BERT wordpiece tokens
  // starting with "##" are subwords that continue the previous word
  // without intervening whitespace.
  type TokenWithOffset = RawTokenEntity & { start: number; end: number };
  const positioned: TokenWithOffset[] = [];
  let cursor = 0;

  for (const token of tokens) {
    const w = token.word;
    const isSubword = w.startsWith("##");
    const searchWord = isSubword ? w.slice(2) : w;

    // Find this word's occurrence in the original text starting from cursor.
    // For subwords, search immediately (no whitespace gap expected).
    const idx = text.toLowerCase().indexOf(searchWord.toLowerCase(), cursor);
    if (idx === -1) {
      // Fallback: if the token can't be located (rare edge case with
      // special characters), place it at the current cursor.
      positioned.push({ ...token, start: cursor, end: cursor + searchWord.length });
    } else {
      positioned.push({ ...token, start: idx, end: idx + searchWord.length });
      cursor = idx + searchWord.length;
    }
  }

  // --- Phase 2: BIO aggregation ---
  const result: AggregatedEntity[] = [];
  let group: { label: string; tokens: TokenWithOffset[] } | null = null;

  for (const tok of positioned) {
    const baseLabel = stripBIO(tok.entity);
    const isBeginning = tok.entity.startsWith("B-") || !tok.entity.startsWith("I-");

    if (group && !isBeginning && baseLabel === group.label) {
      // Continuation (I- tag with same label): extend current group
      group.tokens.push(tok);
    } else {
      // Flush previous group
      if (group) {
        result.push(flushGroup(group));
      }
      // Start new group
      group = { label: baseLabel, tokens: [tok] };
    }
  }
  if (group) {
    result.push(flushGroup(group));
  }

  // --- Phase 3: span sanity-check ---
  // BERT subword + cursor desync can produce a span that stretches across an
  // entire line (especially for ORG entities whose names contain rare tokens
  // that fail the indexOf lookup and get parked at a stale cursor). If the
  // computed span is wildly larger than the joined surface form, recompute it
  // by locating the surface form in the original text near the start offset.
  return result.map((ent) => {
    const surface = ent.word.trim();
    if (surface.length === 0) return ent;
    const span = ent.end - ent.start;
    if (span <= surface.length * 2 && span <= surface.length + 16) return ent;

    // Try a case-insensitive search anchored near the original start offset.
    const anchor = Math.max(0, ent.start - 4);
    const idx = text.toLowerCase().indexOf(surface.toLowerCase(), anchor);
    if (idx !== -1 && idx - anchor <= 32) {
      return { ...ent, start: idx, end: idx + surface.length };
    }
    // Last-resort: clamp end to start + surface length so we never highlight
    // an entire line for one entity.
    return { ...ent, end: Math.min(ent.end, ent.start + surface.length) };
  });
}

/**
 * Converts a group of consecutive same-label tokens into one AggregatedEntity.
 *
 * @param group - The accumulated token group.
 * @returns A single aggregated entity.
 */
function flushGroup(group: { label: string; tokens: Array<{ word: string; score: number; start: number; end: number }> }): AggregatedEntity {
  const words: string[] = [];
  for (const t of group.tokens) {
    if (t.word.startsWith("##")) {
      words.push(t.word.slice(2));
    } else {
      words.push((words.length > 0 ? " " : "") + t.word);
    }
  }
  const scoreSum = group.tokens.reduce((s, t) => s + t.score, 0);
  return {
    entity_group: group.label,
    word: words.join(""),
    score: scoreSum / group.tokens.length,
    start: group.tokens[0].start,
    end: group.tokens[group.tokens.length - 1].end,
  };
}

/**
 * Maps aggregated NER entity labels to our PII_TYPES keys.
 *
 * After BIO aggregation, labels are base forms ("PER", "LOC", etc.).
 * This map normalises the various naming conventions different model
 * checkpoints may use.
 */
const ENTITY_GROUP_MAP: Readonly<Record<string, string>> = {
  // Standard CoNLL-03 labels (distilbert-multilingual-cased-ner-hrl, bert-large-NER)
  PER: "PERSON_NAME",
  PERSON: "PERSON_NAME",
  ORG: "ORGANIZATION",
  ORGANIZATION: "ORGANIZATION",
  LOC: "LOCATION",
  LOCATION: "LOCATION",
  GPE: "LOCATION",
  MISC: "ORGANIZATION",
  // Medical (if using a biomedical-aware model)
  DISEASE: "MEDICAL_TERM",
  CONDITION: "MEDICAL_TERM",
  MEDICATION: "MEDICAL_TERM",
  DRUG: "MEDICAL_TERM",
};

// GLiNER label maps removed — Transformers.js lacks GLiNER architecture support.
// Maximum mode now uses the multilingual DistilBERT model which outputs standard
// BIO-tagged labels (PER, ORG, LOC, MISC) handled by ENTITY_GROUP_MAP above.

/**
 * Minimum confidence score for local NER results.
 * Below this threshold results are discarded to reduce noise.
 */
const MIN_LOCAL_NER_CONFIDENCE = 0.5;

/**
 * Maximum text length per chunk sent to the local model.
 * BERT models have a 512-token context window (~4 chars/token = ~2048 chars).
 * Texts longer than this are split into overlapping chunks.
 */
const MAX_CHUNK_LENGTH = 2048;

/**
 * Number of overlapping characters between consecutive chunks.
 * Ensures entities straddling a chunk boundary are fully captured
 * by at least one chunk. 200 chars comfortably covers multi-word
 * names, addresses, and other long entity spans.
 */
const CHUNK_OVERLAP = 200;

// ---------------------------------------------------------------------------
// Text chunking utilities
// ---------------------------------------------------------------------------

/**
 * Describes a slice of the original text to be processed independently.
 */
interface TextChunk {
  /** The chunk substring. */
  readonly text: string;
  /** Character offset of this chunk's first character in the original text. */
  readonly offset: number;
}

/**
 * Splits text into overlapping chunks that each fit within the model's
 * context window. Breaks are placed at word boundaries when possible.
 *
 * @param text    - The full input text.
 * @param maxLen  - Maximum characters per chunk.
 * @param overlap - Characters of overlap between consecutive chunks.
 * @returns Array of TextChunk objects covering the entire input.
 */
function chunkText(text: string, maxLen: number, overlap: number): TextChunk[] {
  if (text.length <= maxLen) {
    return [{ text, offset: 0 }];
  }

  const stride = maxLen - overlap;
  const chunks: TextChunk[] = [];

  for (let start = 0; start < text.length; start += stride) {
    let end = Math.min(start + maxLen, text.length);

    // For non-final chunks, snap the end to a word boundary so we don't
    // split in the middle of a token the model would see as one unit.
    if (end < text.length) {
      const searchFloor = Math.max(end - 100, start + stride);
      for (let i = end; i >= searchFloor; i--) {
        const ch = text[i];
        if (ch === " " || ch === "\n" || ch === "\t" || ch === "\r") {
          end = i;
          break;
        }
      }
    }

    chunks.push({ text: text.slice(start, end), offset: start });

    if (end >= text.length) break;
  }

  return chunks;
}

/**
 * Shifts entity offsets so they reference the original (unchunked) text.
 *
 * @param results - Entity results with chunk-relative offsets.
 * @param offset  - The chunk's start position in the original text.
 * @returns New array with adjusted start/end values.
 */
function shiftResults(results: EntityResult[], offset: number): EntityResult[] {
  if (offset === 0) return results;
  return results.map((r) => ({
    ...r,
    start: r.start + offset,
    end: r.end + offset,
  }));
}

/**
 * Deduplicates entity results that were detected in overlapping chunk regions.
 *
 * When two results share the same type and have overlapping spans, the one
 * with higher confidence is kept. Results are returned sorted by start position.
 *
 * @param results - Potentially-duplicate entity results from multiple chunks.
 * @returns Deduplicated, sorted entity results.
 */
function deduplicateChunkResults(results: EntityResult[]): EntityResult[] {
  if (results.length <= 1) return results;

  // Sort by start so overlapping duplicates are adjacent or near-adjacent
  const sorted = [...results].sort((a, b) => a.start - b.start || a.end - b.end);
  const deduped: EntityResult[] = [];

  for (const result of sorted) {
    const overlapIdx = deduped.findIndex(
      (d) => d.type === result.type && d.start < result.end && result.start < d.end,
    );

    if (overlapIdx !== -1) {
      // Keep the higher-confidence detection
      if (result.confidence > deduped[overlapIdx].confidence) {
        deduped[overlapIdx] = result;
      }
    } else {
      deduped.push(result);
    }
  }

  return deduped;
}

// ---------------------------------------------------------------------------
// Structured text preprocessing for NER
// ---------------------------------------------------------------------------

/** Maps a value region in synthetic NER text back to the original text. */
interface ValueMapping {
  /** Start position of the value in the preprocessed text. */
  readonly synthStart: number;
  /** End position of the value in the preprocessed text. */
  readonly synthEnd: number;
  /** Start position of the value in the original text. */
  readonly origStart: number;
  /** End position of the value in the original text. */
  readonly origEnd: number;
}

/** Result of preprocessing structured text for NER inference. */
interface StructuredPreprocessResult {
  /** The transformed text with sentence-wrapped KV values. */
  readonly text: string;
  /** Position mappings from synthetic text back to original text. */
  readonly mappings: readonly ValueMapping[];
}

/**
 * Detects structured "Key: Value" text and converts it to natural language
 * sentences that BERT NER models can better understand.
 *
 * BERT-base-NER (trained on CoNLL-2003 news text) classifies all tokens as
 * "O" when the input is structured data like "Name: Aarav Mehta" because
 * that format was absent from training data. This function converts such
 * patterns into "My name is Aarav Mehta." which activates the model's entity
 * recognition capabilities.
 *
 * Non-KV lines are kept verbatim so unstructured portions still benefit
 * from standard NER inference.
 *
 * @param text        - Original input text.
 * @param minKVLines  - Minimum number of KV lines required to consider text
 *                      structured. Defaults to 2. Use 1 to force preprocessing
 *                      on retry when the model returns no entities.
 * @returns Preprocessing result with transformed text and offset mappings,
 *          or null if the text does not look structured (fewer than minKVLines KV lines).
 */
function preprocessStructuredText(text: string, minKVLines = 2): StructuredPreprocessResult | null {
  // Match "Key: Value" lines, tolerating common list prefixes (bullets, numbers)
  const kvPattern = /^(?:[-*•]\s*|\d+[.)]\s*)?([A-Za-z][\w\s/()-]*?):\s*(.+)$/;
  const lines = text.split("\n");

  // Quick scan: need at least minKVLines KV lines to consider text structured
  let kvCount = 0;
  for (const line of lines) {
    if (kvPattern.test(line.trim())) kvCount++;
  }
  if (kvCount < minKVLines) {
    return null;
  }

  let synthText = "";
  const mappings: ValueMapping[] = [];
  let origCursor = 0;

  for (const line of lines) {
    // Locate this line in the original text (advancing past prior lines)
    const lineStart = text.indexOf(line, origCursor);
    if (lineStart === -1) {
      origCursor += line.length + 1;
      continue;
    }

    const trimmed = line.trim();
    const match = trimmed.match(kvPattern);

    if (match) {
      const key = match[1].trim();
      const value = match[2].trim();

      // Locate the value within the original line
      const colonIdx = line.indexOf(":", line.indexOf(key));
      const valueStartInLine = line.indexOf(value, colonIdx + 1);
      const origValueStart = lineStart + valueStartInLine;
      const origValueEnd = origValueStart + value.length;

      // Sentence-wrap: "My {key} is {value}. "
      const prefix = `My ${key.toLowerCase()} is `;
      const suffix = ". ";

      const synthValueStart = synthText.length + prefix.length;
      const synthValueEnd = synthValueStart + value.length;

      mappings.push({
        synthStart: synthValueStart,
        synthEnd: synthValueEnd,
        origStart: origValueStart,
        origEnd: origValueEnd,
      });

      synthText += prefix + value + suffix;
    } else if (trimmed.length > 0) {
      // Non-KV line — keep verbatim with position mapping
      const origLineStart = lineStart + (line.length - line.trimStart().length);

      mappings.push({
        synthStart: synthText.length,
        synthEnd: synthText.length + trimmed.length,
        origStart: origLineStart,
        origEnd: origLineStart + trimmed.length,
      });

      synthText += trimmed + " ";
    }

    origCursor = lineStart + line.length + 1;
  }

  return { text: synthText, mappings };
}

/**
 * Maps a character span from preprocessed NER text back to the original text.
 *
 * Finds the value mapping that contains (or best overlaps) the given span
 * and computes the corresponding position in the original text.
 *
 * @param synthStart - Start position in the preprocessed text.
 * @param synthEnd   - End position in the preprocessed text.
 * @param mappings   - Value mappings from {@link preprocessStructuredText}.
 * @returns Corresponding span in the original text.
 */
function mapSynthToOriginal(
  synthStart: number,
  synthEnd: number,
  mappings: readonly ValueMapping[],
): { start: number; end: number } {
  // Exact containment: entity falls entirely within one mapped value
  for (const m of mappings) {
    if (synthStart >= m.synthStart && synthEnd <= m.synthEnd) {
      const delta = synthStart - m.synthStart;
      return {
        start: m.origStart + delta,
        end: m.origStart + delta + (synthEnd - synthStart),
      };
    }
  }

  // Partial overlap: entity starts in one mapping
  for (const m of mappings) {
    if (synthStart >= m.synthStart && synthStart < m.synthEnd) {
      const delta = synthStart - m.synthStart;
      return {
        start: m.origStart + delta,
        end: Math.min(m.origEnd, m.origStart + delta + (synthEnd - synthStart)),
      };
    }
  }

  // No mapping found — return as-is (shouldn't happen for well-formed results)
  return { start: synthStart, end: synthEnd };
}

// ---------------------------------------------------------------------------
// Model state — Multilingual DistilBERT (balanced mode)
// ---------------------------------------------------------------------------

/** The loaded multilingual DistilBERT pipeline instance, or null if not yet loaded. */
let bertPipeline: unknown = null;

/** Error from the last multilingual model load attempt, if any. */
let bertLoadError: string | null = null;

/** Shared promise for concurrent callers waiting on the same multilingual load. */
let bertLoadingPromise: Promise<unknown> | null = null;

// (GLiNER model state removed — Transformers.js has no GLiNER architecture
// support, so onnx-community/gliner_multi_pii-v1 always failed to load.
// BERT-large state removed — maximum mode now uses the backend API.)

// ---------------------------------------------------------------------------
// Model self-test
// ---------------------------------------------------------------------------

/**
 * Runs a quick self-test on a loaded NER pipeline to verify it produces
 * entities for a known-good input.
 *
 * If the pipeline returns nothing (all tokens classified as "O"), we also
 * retry with `ignore_labels: []` to distinguish "model runs but classifies
 * everything as O" from "pipeline is completely non-functional". This
 * diagnostic information is logged to the console.
 *
 * @param pipe  - A loaded Transformers.js token-classification pipeline.
 * @param label - Human-readable label for log messages (e.g. "BERT-base (quantized)").
 * @returns true if the pipeline detected at least one entity, false otherwise.
 */
async function selfTestPipeline(pipe: unknown, label: string): Promise<boolean> {
  const SELF_TEST_TEXT = "John Smith works at Microsoft in Seattle.";
  try {
    const result = await (pipe as (text: string, options?: Record<string, unknown>) => Promise<unknown>)(SELF_TEST_TEXT);
    const entities: unknown[] = Array.isArray(result) && result.length > 0 && Array.isArray(result[0])
      ? result[0]
      : Array.isArray(result) ? result : [];

    if (entities.length > 0) {
      return true;
    }

    // No entities returned — check if pipeline produces tokens at all
    console.warn(`[NER-Worker] ⚠️ ${label} self-test: 0 entities`);
    const rawResult = await (pipe as (text: string, options?: Record<string, unknown>) => Promise<unknown>)(
      SELF_TEST_TEXT,
      { ignore_labels: [] },
    );
    const rawTokens: unknown[] = Array.isArray(rawResult) ? rawResult : [];

    if (rawTokens.length > 0) {
      // Pipeline runs but every token is "O" — model weights are broken
      console.warn(`[NER-Worker] ⚠️ ${label}: ${rawTokens.length} tokens but all classified as "O" — model inference is broken.`);
    } else {
      console.error(`[NER-Worker] ❌ ${label}: 0 tokens even with ignore_labels=[]. WASM backend may be non-functional.`);
    }
    return false;
  } catch (err) {
    console.error(`[NER-Worker] ${label} self-test error:`, err instanceof Error ? err.name : "unknown-error");
    return false;
  }
}

// ---------------------------------------------------------------------------
// Model loading
// ---------------------------------------------------------------------------

/**
 * Lazily loads the multilingual DistilBERT NER pipeline via Transformers.js.
 *
 * Uses Xenova/distilbert-base-multilingual-cased-ner-hrl, a ~110MB quantised
 * model trained on 10 high-resource languages (Arabic, German, English,
 * Spanish, French, Italian, Latvian, Dutch, Portuguese, Chinese). Provides
 * significantly better recognition of non-Western names compared to the
 * English-only dslim/bert-base-NER (CoNLL-2003). Downloaded once from
 * Hugging Face CDN and cached by the browser's Cache API. After loading,
 * a self-test verifies the model produces entities for known text; if the
 * quantised model fails, a non-quantised fallback is attempted automatically.
 *
 * @returns The pipeline function, or null if loading fails.
 */
async function loadBertPipeline(): Promise<unknown> {
  if (bertPipeline) return bertPipeline;

  // If a load is already in progress, share the same promise to avoid
  // duplicate loads and prevent leaked intervals/timeouts.
  if (bertLoadingPromise) return bertLoadingPromise;

  bertLoadError = null;

  bertLoadingPromise = (async (): Promise<unknown> => {
    try {
      const startTime = performance.now();

      // Import Transformers.js from the bundled npm package.
      // The package must be listed in package.json dependencies.
      // MV3 extensions cannot load scripts from external CDNs.
      const { pipeline: createPipeline, env } = await import(
        /* webpackIgnore: true */
        "@xenova/transformers"
      );

      // Force WASM backend (no WebGPU requirement, works everywhere)
      env.backends.onnx.wasm.numThreads = 1;
      // Models are downloaded from Hugging Face CDN and cached by the browser.
      // This is allowed because only data (ONNX weights) is fetched, not code.
      env.allowLocalModels = false;
      env.allowRemoteModels = true;

      const progressCallback = (progress: { status: string; progress?: number; file?: string; loaded?: number; total?: number }) => {
        try {
          chrome.runtime.sendMessage({
            type: "MODEL_DOWNLOAD_PROGRESS",
            data: {
              status: progress.status,
              progress: progress.progress ?? 0,
              file: progress.file ?? "",
              loaded: progress.loaded ?? 0,
              total: progress.total ?? 0,
              model: "multilingual",
              timestamp: Date.now(),
            },
          }).catch(() => {});
        } catch {}
      };

      // Load a multilingual NER model with 10-language coverage.
      // Xenova/distilbert-base-multilingual-cased-ner-hrl is ~110MB quantised.
      // Trained on diverse datasets (CoNLL-2003, ANERcorp, MSRA, etc.) —
      // recognises non-Western names far better than English-only bert-base-NER.
      bertPipeline = await createPipeline(
        "token-classification",
        "Xenova/distilbert-base-multilingual-cased-ner-hrl",
        { quantized: true, progress_callback: progressCallback },
      );

      void Math.round(performance.now() - startTime);

      // Self-test: verify the model actually produces NER entities.
      // A broken quantized model or WASM backend may load without
      // error but silently classify all tokens as "O", yielding [].
      const selfTestPassed = await selfTestPipeline(bertPipeline, "Multilingual DistilBERT (quantized)");

      if (!selfTestPassed) {
        console.warn("[NER-Worker] ⚠️ Quantized model failed self-test — retrying with quantized=false...");
        bertPipeline = await createPipeline(
          "token-classification",
          "Xenova/distilbert-base-multilingual-cased-ner-hrl",
          { quantized: false, progress_callback: progressCallback },
        );
        const retryPassed = await selfTestPipeline(bertPipeline, "Multilingual DistilBERT (non-quantized)");
        if (!retryPassed) {
          console.error("[NER-Worker] ❌ Non-quantized model also failed self-test. NER will not detect named entities.");
        }
      }

      return bertPipeline;
    } catch (err) {
      bertLoadError = err instanceof Error ? err.name : "unknown-error";
      console.error("[NER-Worker] Multilingual model load FAILED:", bertLoadError);
      return null;
    } finally {
      bertLoadingPromise = null;
    }
  })();

  return bertLoadingPromise;
}

// loadGLiNERPipeline() removed — Transformers.js has no GLiNER architecture
// support (onnx-community/gliner_multi_pii-v1 always failed to load).
// loadBertLargePipeline() removed — maximum mode now uses the backend API.

// ---------------------------------------------------------------------------
// Inference helpers
// ---------------------------------------------------------------------------

/** Internal return type for entity extraction functions. */
type EntityResult = {
  type: string;
  value: string;
  start: number;
  end: number;
  confidence: number;
};

/**
 * Runs multilingual DistilBERT NER inference on the provided text.
 *
 * Calls the token-classification pipeline, aggregates the raw per-token
 * BIO output into proper entity spans, maps labels to PII_TYPES, and
 * applies confidence + blocklist filtering. Used in balanced mode as the
 * sole model, and in maximum mode alongside BERT-large.
 *
 * @param text - A single chunk of user message text to analyze.
 * @returns Array of entity objects compatible with PIIMatch conversion.
 */
async function runBertInference(text: string): Promise<EntityResult[]> {
  const pipe = await loadBertPipeline();
  if (!pipe) {
    return [];
  }

  if (typeof pipe !== "function") {
    return [];
  }

  try {
    // The pipeline returns raw per-token results (BIO tags, no offsets).
    const rawResult = await (pipe as (text: string, options?: Record<string, unknown>) => Promise<unknown>)(text);

    // Handle nested arrays: pipeline may return [[...entities...]] for single input
    const rawTokens: RawTokenEntity[] = Array.isArray(rawResult) && rawResult.length > 0 && Array.isArray(rawResult[0])
      ? (rawResult[0] as RawTokenEntity[])
      : (rawResult as RawTokenEntity[]);

    if (rawTokens.length === 0 && text.length > 50) {
      // Pipeline returned nothing for substantial text — diagnose why.
      // Retry with ignore_labels=[] to see if tokens exist but are all "O".
      console.warn(`[NER-Worker] ⚠️ 0 entity tokens for ${text.length}-char input. Retrying with ignore_labels=[]...`);
      try {
        const diagResult = await (pipe as (t: string, o?: Record<string, unknown>) => Promise<unknown>)(
          text, { ignore_labels: [] },
        );
        const diagTokens = Array.isArray(diagResult) ? diagResult as Array<Record<string, unknown>> : [];
        if (diagTokens.length > 0) {
          const oCount = diagTokens.filter((t) => String(t.entity ?? "").toUpperCase() === "O").length;
          console.warn(
            `[NER-Worker] ⚠️ ignore_labels=[] → ${diagTokens.length} tokens, ${oCount} are "O" (${Math.round(oCount / diagTokens.length * 100)}%)`,
          );
        } else {
          console.error("[NER-Worker] ❌ 0 tokens even with ignore_labels=[]. Pipeline non-functional for this input.");
        }
      } catch (diagErr) {
        console.error("[NER-Worker] Diagnostic retry error:", diagErr instanceof Error ? diagErr.name : "unknown-error");
      }
    }

    // Aggregate tokens into proper entity spans using BIO convention.
    const aggregated = aggregateTokens(rawTokens, text);

    // Map aggregated labels → PII types and apply filtering.
    const results: EntityResult[] = [];
    const rejected: Array<{ word: string; entity_group: string; score: number; reason: string }> = [];

    for (const entity of aggregated) {
      const mappedType = ENTITY_GROUP_MAP[entity.entity_group];
      if (!mappedType) {
        rejected.push({ word: entity.word, entity_group: entity.entity_group, score: entity.score, reason: "unmapped entity_group" });
        continue;
      }
      if (entity.score < MIN_LOCAL_NER_CONFIDENCE) {
        rejected.push({ word: entity.word, entity_group: entity.entity_group, score: entity.score, reason: `score ${entity.score.toFixed(3)} < ${MIN_LOCAL_NER_CONFIDENCE}` });
        continue;
      }

      const start = Math.max(0, entity.start);
      const end = Math.min(text.length, entity.end);
      if (start >= end) {
        rejected.push({ word: entity.word, entity_group: entity.entity_group, score: entity.score, reason: "invalid span" });
        continue;
      }

      const value = text.slice(start, end).trim();
      if (!value || value.length < 2) {
        rejected.push({ word: entity.word, entity_group: entity.entity_group, score: entity.score, reason: "value too short" });
        continue;
      }

      if (shouldRejectNERResult(value, mappedType)) {
        rejected.push({ word: entity.word, entity_group: entity.entity_group, score: entity.score, reason: "blocklist rejected" });
        continue;
      }

      results.push({
        type: mappedType,
        value,
        start,
        end,
        confidence: Math.round(entity.score * 100) / 100,
      });
    }

    void rejected;

    return results;
  } catch (err) {
    console.error("[NER-Worker] ❌ Multilingual inference error (was silent):", err instanceof Error ? err.name : "unknown-error");
    return [];
  }
}

// runGLiNERInference() removed — Transformers.js has no GLiNER architecture support.
// runBertLargeInference() removed — maximum mode now uses the backend API.

/**
 * Merges primary and secondary NER model results with span-overlap deduplication.
 *
 * For each secondary result, checks if any primary result overlaps (using
 * open-interval overlap: startA < endB && startB < endA).
 * If overlapping, keeps the result with higher confidence. Non-overlapping
 * secondary results are appended. Final list is sorted by start position.
 *
 * @param primaryResults   - Entity results from the primary model (e.g. BERT-large).
 * @param secondaryResults - Entity results from the secondary model (e.g. multilingual).
 * @returns Deduplicated, sorted entity results.
 */
function mergeLocalResults(primaryResults: EntityResult[], secondaryResults: EntityResult[]): EntityResult[] {
  // Start with a copy of primary results; we may replace entries below
  const merged: EntityResult[] = [...primaryResults];

  for (const secondary of secondaryResults) {
    // Find any overlapping primary result
    const overlapIndex = merged.findIndex(
      (primary) => primary.start < secondary.end && secondary.start < primary.end,
    );

    if (overlapIndex !== -1) {
      // Keep the higher-confidence span
      if (secondary.confidence > merged[overlapIndex].confidence) {
        merged[overlapIndex] = secondary;
      }
      // Otherwise keep the existing primary result (no-op)
    } else {
      // No overlap — include secondary result as-is
      merged.push(secondary);
    }
  }

  // Sort by start position for deterministic output
  merged.sort((a, b) => a.start - b.start);

  return merged;
}

/**
 * Runs balanced-mode inference: Multilingual DistilBERT NER only.
 *
 * Fastest local NER path — suitable for the "balanced" detection mode.
 * Does not load BERT-large, minimising memory and latency.
 * Texts longer than MAX_CHUNK_LENGTH are split into overlapping chunks
 * so the full input is scanned regardless of length.
 *
 * @param text - The user message text to analyze (any length).
 * @returns Multilingual DistilBERT entity results sorted by start position.
 */
async function runBalancedInference(text: string): Promise<EntityResult[]> {
  // Preprocess structured "Key: Value" text into natural language sentences
  // so BERT NER can recognise entities it would otherwise miss.
  // Use minKVLines=1 to catch even a single structured line — avoids the
  // costly raw→retry double-inference that previously wasted ~5s.
  const preprocessResult = preprocessStructuredText(text, 1);
  const inferenceText = preprocessResult ? preprocessResult.text : text;

  const chunks = chunkText(inferenceText, MAX_CHUNK_LENGTH, CHUNK_OVERLAP);
  const start = performance.now();

  const allResults: EntityResult[] = [];
  for (const chunk of chunks) {
    const results = await runBertInference(chunk.text);
    allResults.push(...shiftResults(results, chunk.offset));
  }

  let deduped = deduplicateChunkResults(allResults);

  // Map preprocessed text positions back to original text positions
  if (preprocessResult && deduped.length > 0) {
    deduped = deduped.map((r) => {
      const mapped = mapSynthToOriginal(r.start, r.end, preprocessResult.mappings);
      const value = text.slice(mapped.start, mapped.end).trim();
      return { ...r, start: mapped.start, end: mapped.end, value };
    }).filter((r) => r.value.length >= 2);
  }

  void Math.round(performance.now() - start);
  void preprocessResult;
  return deduped;
}

// runMaximumInference() removed — maximum mode now uses the backend API (3-detector ensemble).
// All local inference goes through runBalancedInference() (Multilingual DistilBERT).

// ---------------------------------------------------------------------------
// Message handler sub-functions
// ---------------------------------------------------------------------------

/**
 * Handles a `LOCAL_NER_ANALYZE` message by running NER inference.
 *
 * Always uses Multilingual DistilBERT (balanced mode). Maximum mode is
 * handled by the backend API, so any request reaching this handler uses
 * the local balanced inference path.
 *
 * Validates that `text` is a non-empty string before dispatching.
 * Responds with an entity array on success or an empty array on any failure
 * (fail-open policy).
 *
 * @param text         - Raw value of `message.text`; validated before use.
 * @param mode         - Detection mode string from the message (informational only).
 * @param sendResponse - Chrome message channel callback.
 */
function handleAnalyzeMessage(
  text: unknown,
  mode: unknown,
  sendResponse: (response: Record<string, unknown>) => void,
): void {
  if (typeof text !== "string" || text.length === 0) {
    sendResponse({ success: true, data: { entities: [], source: "local_ner" } });
    return;
  }

  const inferenceMode = typeof mode === "string" ? mode : "balanced";

  void inferenceMode;
  runBalancedInference(text)
    .then((entities) => {
      sendResponse({
        success: true,
        data: { entities, source: "local_ner" },
      });
    })
    .catch((err) => {
      console.error(`[NER-Worker] ❌ Inference failed (mode=${inferenceMode}):`, err instanceof Error ? err.name : "unknown-error");
      sendResponse({
        success: true,
        data: { entities: [], source: "local_ner" },
      });
    });
}

/**
 * Handles a `LOCAL_NER_STATUS` message by returning the current load state
 * of the multilingual DistilBERT pipeline.
 *
 * The response includes the multilingual model detail object as well as
 * backward-compatible top-level fields. BERT-large is no longer loaded
 * locally — maximum mode uses the backend API.
 *
 * @param sendResponse - Chrome message channel callback.
 */
function handleStatusMessage(
  sendResponse: (response: Record<string, unknown>) => void,
): void {
  sendResponse({
    success: true,
    data: {
      bert: {
        loaded: bertPipeline !== null,
        loading: bertLoadingPromise !== null,
        error: bertLoadError,
      },
      // Backward-compatible: keep "gliner" key pointing at the multilingual model
      // so existing UI code that reads data.gliner doesn't break.
      gliner: {
        loaded: bertPipeline !== null,
        loading: bertLoadingPromise !== null,
        error: bertLoadError,
      },
      // Backward-compatible top-level fields (reflect multilingual status as primary)
      loaded: bertPipeline !== null,
      loading: bertLoadingPromise !== null,
      error: bertLoadError,
    },
  });
}

/**
 * Handles a `LOCAL_NER_PRELOAD` message by eagerly loading the multilingual
 * DistilBERT pipeline. All modes preload the same local model since maximum
 * mode now uses the backend API and only balanced mode runs locally.
 *
 * Preloading is triggered by the service worker when the user switches
 * detection mode so that subsequent inference requests do not incur
 * cold-start latency.
 *
 * @param mode         - The detection mode to preload models for (informational only).
 * @param sendResponse - Chrome message channel callback.
 */
function handlePreloadMessage(
  mode: string | undefined,
  sendResponse: (response: Record<string, unknown>) => void,
): void {
  const loaders: Promise<unknown>[] = [loadBertPipeline()];
  void mode;

  Promise.all(loaders)
    .then(() => {
      const loaded = bertPipeline !== null;
      const error = bertLoadError;

      // Send a distinct completion signal so UI knows ALL files are done
      try {
        chrome.runtime.sendMessage({
          type: "MODEL_DOWNLOAD_COMPLETE",
          data: { loaded, error, mode, timestamp: Date.now() },
        }).catch(() => {});
      } catch {}

      sendResponse({ success: true, data: { loaded, error } });
    })
    .catch((err) => {
      const error = bertLoadError;

      void err;
      console.error(`[NER-Worker] Preload FAILED — mode="${mode}" error=${error ?? "unknown"}`);

      // Notify UI of failure
      try {
        chrome.runtime.sendMessage({
          type: "MODEL_DOWNLOAD_ERROR",
          data: { error: error ?? "Model download failed", mode, timestamp: Date.now() },
        }).catch(() => {});
      } catch {}

      sendResponse({ success: true, data: { loaded: false, error } });
    });
}

// ---------------------------------------------------------------------------
// Message listener
// ---------------------------------------------------------------------------

/**
 * Guard against duplicate listener registration (e.g. from HMR reloads in
 * dev mode). Uses a globalThis flag that persists across module re-evaluations,
 * preventing multiple handlers from racing on the same message.
 */
const LISTENER_KEY = "__APS_NER_WORKER_LISTENER__";

/**
 * Routes messages from the service worker to the appropriate handler.
 *
 * Supported message types:
 * - `LOCAL_NER_ANALYZE`: Run NER inference on `message.text` (mode-aware).
 *   Returns `{ success: true, data: { entities: EntityResult[], source: "local_ner" } }`.
 * - `LOCAL_NER_STATUS`: Return load state for the multilingual DistilBERT pipeline.
 *   Returns `{ success: true, data: { bert, gliner, loaded, loading, error } }`.
 * - `LOCAL_NER_PRELOAD`: Eagerly load pipelines for given mode without running inference.
 *   Returns `{ success: true, data: { loaded: boolean, error: string | null } }`.
 *
 * All handlers return `true` to keep the message channel open for async responses.
 * Unknown message types return `false` to release the channel immediately.
 */
if (!(globalThis as Record<string, unknown>)[LISTENER_KEY]) {
  (globalThis as Record<string, unknown>)[LISTENER_KEY] = true;
  chrome.runtime.onMessage.addListener(
    (message: Record<string, unknown>, _sender, sendResponse) => {
      const type = message["type"] as string;

      if (type === "LOCAL_NER_ANALYZE") {
        handleAnalyzeMessage(message["text"], message["mode"], sendResponse);
        return true; // Keep message channel open for async response
      }

      if (type === "LOCAL_NER_STATUS") {
        handleStatusMessage(sendResponse);
        return true;
      }

      if (type === "LOCAL_NER_PRELOAD") {
        handlePreloadMessage(message["mode"] as string | undefined, sendResponse);
        return true;
      }

      return false;
    },
  );
} else {
  console.warn("[NER-Worker] Listener already registered — skipping duplicate registration (likely HMR reload)");
}
