/**
 * Plasmo tab page wrapper for the NER offscreen document.
 *
 * This file exists solely so that Plasmo builds the ner-worker module
 * into a standalone HTML page (tabs/ner-worker.html) that can be loaded
 * as a Chrome offscreen document via chrome.offscreen.createDocument().
 *
 * The actual NER logic lives in src/offscreen/ner-worker.ts — importing
 * it here causes its chrome.runtime.onMessage listener to register when
 * the page loads.
 *
 * Architecture layer: Build shim (offscreen document entry point)
 */

// Side-effect import: registers the NER message listener at module scope
import "~src/offscreen/ner-worker"

/**
 * Empty component — the offscreen document has no visible UI.
 * @returns null (renders nothing)
 */
export default function NerWorkerPage() {
  return null
}
