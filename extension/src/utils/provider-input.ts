/**
 * Provider chat-input helpers shared by content-script overlays.
 *
 * These utilities focus and prefill the current provider's composer using
 * best-effort DOM selectors without coupling the rest of the codebase to the
 * host page's exact markup.
 */

/**
 * Provider-specific selectors for locating the visible chat composer.
 *
 * Each list is tried in order; the first match wins.  Selectors must cover
 * both `contenteditable="true"` AND `contenteditable="plaintext-only"` since
 * many providers have migrated to the latter for paste-safety.  The broad
 * `[contenteditable]:not([contenteditable="false"])` catch-all covers future
 * attribute values without enumerating every possibility.
 */
export const PROVIDER_INPUT_SELECTORS: Record<string, string[]> = {
  CHATGPT: [
    '#prompt-textarea[contenteditable]',
    "#prompt-textarea",
    'div[contenteditable="true"][id="prompt-textarea"]',
    'div.ProseMirror[contenteditable]:not([contenteditable="false"])',
    '[role="textbox"][contenteditable]:not([contenteditable="false"])',
    'div[contenteditable]:not([contenteditable="false"])',
    'textarea[data-id="root"]',
    "textarea",
  ],
  CLAUDE: [
    'div.ProseMirror[contenteditable="true"]',
    'div.ProseMirror[contenteditable]:not([contenteditable="false"])',
    '[role="textbox"][contenteditable]:not([contenteditable="false"])',
    'div[contenteditable]:not([contenteditable="false"])',
  ],
  GEMINI: [
    'div.ql-editor[contenteditable]:not([contenteditable="false"])',
    'div.ql-editor[contenteditable="true"]',
    '[role="textbox"][contenteditable]:not([contenteditable="false"])',
    'div[contenteditable]:not([contenteditable="false"])',
    ".text-input-area textarea",
    'rich-textarea textarea',
    "textarea",
  ],
  DEEPSEEK: [
    // Modern DeepSeek composer variants — try the most specific first.
    "#chat-input",
    'textarea#chat-input',
    'textarea[placeholder*="message" i]',
    'textarea[placeholder*="ask" i]',
    'textarea[placeholder*="DeepSeek" i]',
    'textarea[aria-label*="message" i]',
    'textarea[aria-label*="chat" i]',
    'div[contenteditable="true"][role="textbox"]',
    'div[contenteditable="plaintext-only"][role="textbox"]',
    '[role="textbox"][contenteditable]:not([contenteditable="false"])',
    'div[contenteditable]:not([contenteditable="false"])',
    // Generic last-resort fallbacks
    'textarea[placeholder]',
    "textarea",
  ],
  PERPLEXITY: [
    "textarea[placeholder]",
    "textarea",
    '[role="textbox"][contenteditable]:not([contenteditable="false"])',
    'div[contenteditable]:not([contenteditable="false"])',
  ],
  GROK: [
    '[role="textbox"][contenteditable]:not([contenteditable="false"])',
    'div[contenteditable="true"]',
    'div[contenteditable="plaintext-only"]',
    'div[contenteditable]:not([contenteditable="false"])',
    "textarea",
  ],
  COPILOT: [
    // Modern copilot.microsoft.com composer (consumer + M365)
    'textarea#userInput',
    'textarea[data-testid="composer-input"]',
    'textarea[aria-label*="Message" i]',
    'textarea[placeholder*="Message" i]',
    'textarea[placeholder*="Ask me" i]',
    'div[contenteditable="true"][role="textbox"]',
    '#searchbox[contenteditable]:not([contenteditable="false"])',
    '[role="textbox"][contenteditable]:not([contenteditable="false"])',
    'div[contenteditable]:not([contenteditable="false"])',
    "textarea",
  ],
  META_AI: [
    // Meta AI's primary composer is a contenteditable div with role=textbox.
    'div[contenteditable="true"][role="textbox"]',
    'div[contenteditable="plaintext-only"][role="textbox"]',
    '[role="textbox"][contenteditable]:not([contenteditable="false"])',
    'div[contenteditable="true"]',
    'div[contenteditable="plaintext-only"]',
    'div[contenteditable]:not([contenteditable="false"])',
    'textarea[placeholder*="Ask" i]',
    'textarea[name="message"]',
    "textarea",
  ],
}

/**
 * Returns `true` when `el` has a contenteditable attribute that enables
 * editing — covers `"true"`, `"plaintext-only"`, `""`, and any future values.
 * Uses the attribute rather than `el.isContentEditable` because JSDOM
 * does not fully implement the reflected property.
 */
function isEditableElement(el: HTMLElement): boolean {
  const attr = el.getAttribute("contenteditable")
  return attr !== null && attr !== "false"
}

/**
 * Places the cursor at the end of an editable element.
 */
function moveCursorToEnd(el: HTMLElement): void {
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    const end = el.value.length
    el.setSelectionRange(end, end)
    return
  }

  if (isEditableElement(el)) {
    const selection = window.getSelection()
    if (!selection) return
    selection.selectAllChildren(el)
    selection.collapseToEnd()
  }
}

/**
 * Dispatches input-ish events so host frameworks observe the changed draft.
 */
function dispatchDraftEvents(el: HTMLElement): void {
  el.dispatchEvent(new Event("input", { bubbles: true }))
  el.dispatchEvent(new Event("change", { bubbles: true }))
}

/**
 * Generic fallback selectors used when no provider-specific list is available.
 * Covers `contenteditable="true"`, `contenteditable="plaintext-only"`, and
 * any future attribute values via the broad `:not([contenteditable="false"])`
 * negative match.
 */
const GENERIC_FALLBACK_SELECTORS: readonly string[] = [
  '[role="textbox"][contenteditable]:not([contenteditable="false"])',
  'div[contenteditable]:not([contenteditable="false"])',
  "textarea",
]

/**
 * Returns the best matching input element for the given provider.
 *
 * If the matched element is a non-editable wrapper that contains a nested
 * contenteditable or textarea descendant, the function drills down to return
 * the innermost editing surface.
 */
export function findProviderInput(provider: string): HTMLElement | null {
  const selectors = PROVIDER_INPUT_SELECTORS[provider] ?? GENERIC_FALLBACK_SELECTORS

  for (const selector of selectors) {
    const el = document.querySelector<HTMLElement>(selector)
    if (el) return drillToEditor(el)
  }

  return null
}

/**
 * If `el` is not itself contenteditable or a native input, attempts to find
 * the deepest contenteditable or textarea descendant.  Returns `el` unchanged
 * when it is already the editing surface.
 */
function drillToEditor(el: HTMLElement): HTMLElement {
  // Already an editing surface
  if (
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLInputElement ||
    isEditableElement(el)
  ) {
    return el
  }

  // Try nested contenteditable first, then textarea
  const nested =
    el.querySelector<HTMLElement>('[contenteditable]:not([contenteditable="false"])') ??
    el.querySelector<HTMLElement>("textarea")

  return nested ?? el
}

/**
 * Focuses the provider input and moves the caret to the end.
 */
export function restoreInputFocus(provider: string): boolean {
  const el = findProviderInput(provider)
  if (!el) return false

  el.focus()
  moveCursorToEnd(el)
  return true
}

/**
 * Provider-specific selectors for locating the most recently rendered
 * user-message bubble in the conversation transcript.
 *
 * Used by {@link replaceLatestUserBubbleText} to swap an optimistic
 * just-rendered user bubble (which still contains original PII) with the
 * anonymized text, BEFORE the held network request is released. This
 * eliminates the visual flash of original PII in the user's own bubble on
 * providers that render the bubble synchronously from the textarea.
 */
const PROVIDER_USER_BUBBLE_SELECTORS: Record<string, string[]> = {
  CLAUDE: [
    '[data-testid="user-message"]',
    'div[data-testid="user-message"]',
    'div.font-user-message',
  ],
  CHATGPT: [
    '[data-message-author-role="user"]',
    'div[data-message-author-role="user"] .markdown',
    'div[data-message-author-role="user"]',
  ],
  GEMINI: [
    'user-query .query-text',
    'user-query',
    '[data-test-id="user-query"]',
  ],
  DEEPSEEK: [
    'div[data-role="user"]',
    '.user-message',
  ],
  PERPLEXITY: [
    '[data-testid="user-message"]',
    '.user-message',
  ],
  GROK: [
    '[data-testid="user-message"]',
    'div[data-message-author="user"]',
  ],
  COPILOT: [
    '[data-author="user"]',
    '[data-content="user-message"]',
  ],
  META_AI: [
    '[data-testid="user-message"]',
  ],
}

/**
 * Replaces the text content of the most recent user-message bubble for the
 * given provider. Used by the auto-anonymize pipeline so the visible bubble
 * matches the anonymized payload that goes over the wire.
 *
 * Best-effort: walks text nodes inside the matched bubble and substitutes
 * `originalText` (if found verbatim) for `anonymizedText`. If no exact
 * substring match is found in any single text node (e.g. Prosemirror split
 * the original across multiple runs), falls back to overwriting the bubble's
 * innerText so at least the placeholders are shown.
 *
 * @param provider       - Provider key (CLAUDE, CHATGPT, etc.)
 * @param originalText   - The PII-containing text the user typed.
 * @param anonymizedText - The placeholder version returned by the anonymizer.
 * @returns `true` when a bubble was located and rewritten, `false` otherwise.
 *
 * Side effects: mutates DOM nodes inside the host page's transcript.
 */
export function replaceLatestUserBubbleText(
  provider: string,
  originalText: string,
  anonymizedText: string,
): boolean {
  const selectors = PROVIDER_USER_BUBBLE_SELECTORS[provider]
  if (!selectors || selectors.length === 0) return false
  if (originalText.length === 0 || originalText === anonymizedText) return false

  // Try once immediately so the visible bubble flips before the held fetch
  // is released. ALSO always start a persistent observer: after the wire
  // request is released, host frameworks (React/Lit/etc.) frequently
  // re-render the user bubble from their own state — which still contains
  // the original PII — and clobber our text-node mutation. The observer
  // re-applies the rewrite whenever the original text reappears, until a
  // short backstop timeout elapses.
  const rewroteImmediately = tryRewriteLatestBubble(
    selectors,
    originalText,
    anonymizedText,
  )
  scheduleBubbleRewriteRetry(selectors, originalText, anonymizedText)
  return rewroteImmediately
}

/**
 * Single-shot attempt to locate and rewrite the latest user bubble matching
 * any of the provider's selectors. Only acts on a bubble whose textContent
 * actually contains `originalText` — never clobbers a stale/previous bubble.
 */
function tryRewriteLatestBubble(
  selectors: string[],
  originalText: string,
  anonymizedText: string,
): boolean {
  for (const selector of selectors) {
    const matches = document.querySelectorAll<HTMLElement>(selector)
    // Walk newest-first; the latest bubble matching the original wins.
    for (let i = matches.length - 1; i >= 0; i--) {
      const bubble = matches[i]
      if (!bubble) continue
      const fullText = bubble.textContent ?? ""
      if (!fullText.includes(originalText)) continue

      // Verbatim text-node substitution preserves markup when possible.
      let replacedInPlace = false
      const walker = document.createTreeWalker(bubble, NodeFilter.SHOW_TEXT)
      const textNodes: Text[] = []
      let node: Text | null
      while ((node = walker.nextNode() as Text | null) !== null) {
        textNodes.push(node)
      }
      for (const textNode of textNodes) {
        const content = textNode.textContent ?? ""
        if (content.length > 0 && content.includes(originalText)) {
          textNode.textContent = content.split(originalText).join(anonymizedText)
          replacedInPlace = true
        }
      }
      if (replacedInPlace) return true

      // The original was split across runs (Prosemirror, Quill, etc.) but the
      // joined textContent still contains it — safe to rewrite as a single
      // text node since we've confirmed this is the right bubble.
      bubble.textContent = anonymizedText
      return true
    }
  }
  return false
}

/**
 * Watches the document for up to ~5 seconds for a user bubble matching one of
 * the provider selectors and containing `originalText`, then rewrites it.
 *
 * Required for providers like Gemini that render the optimistic user bubble
 * AFTER the network request begins, so the synchronous rewrite attempt at
 * Auto-Anonymize time finds nothing.
 */
function scheduleBubbleRewriteRetry(
  selectors: string[],
  originalText: string,
  anonymizedText: string,
): void {
  if (typeof MutationObserver === "undefined") return

  let done = false
  const finish = () => {
    if (done) return
    done = true
    observer.disconnect()
    clearTimeout(timeoutId)
  }

  // Re-apply on every relevant mutation. We intentionally do NOT stop after
  // the first successful rewrite: host frameworks often re-render the user
  // bubble from internal state after the held fetch is released, restoring
  // the original PII. We keep re-rewriting until the backstop timeout.
  const observer = new MutationObserver(() => {
    if (done) return
    tryRewriteLatestBubble(selectors, originalText, anonymizedText)
  })
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  })

  const timeoutId = setTimeout(finish, 8000)

  // Re-attempt once immediately in case the bubble appeared between the
  // initial check and observer attachment.
  tryRewriteLatestBubble(selectors, originalText, anonymizedText)
}

/**
 * Returns true when the given text node lives inside a user-message bubble
 * for the given provider. Used by the rehydration walker to skip user
 * bubbles so auto-anonymize and rehydration remain independent features.
 */
export function isInsideUserBubble(node: Node, provider: string): boolean {
  const selectors = PROVIDER_USER_BUBBLE_SELECTORS[provider]
  if (!selectors || selectors.length === 0) return false
  const el = node.nodeType === Node.ELEMENT_NODE
    ? (node as Element)
    : node.parentElement
  if (!el) return false
  for (const selector of selectors) {
    if (el.closest(selector) !== null) return true
  }
  return false
}

/**
 * Provider-specific selectors for locating the edit button on the last user message.
 */
const PROVIDER_EDIT_BUTTON_SELECTORS: Record<string, string[]> = {
  CHATGPT: [
    'button[aria-label*="Edit" i]',
    'button[data-testid*="edit" i]',
  ],
  CLAUDE: [
    'button[aria-label*="Edit" i]',
  ],
  GEMINI: [
    'button[aria-label*="Edit" i]',
  ],
}

/**
 * Attempts to find and click the provider's edit button on the last user message.
 * Returns true if an edit button was found and clicked, false otherwise.
 */
export function triggerProviderEditButton(provider: string): boolean {
  const selectors = PROVIDER_EDIT_BUTTON_SELECTORS[provider]
  if (!selectors) return false

  for (const selector of selectors) {
    const buttons = document.querySelectorAll<HTMLButtonElement>(selector)
    if (buttons.length > 0) {
      // Click the last matching edit button (most recent message)
      const lastBtn = buttons[buttons.length - 1]
      lastBtn.click()
      return true
    }
  }

  return false
}

/**
 * Prefills the provider draft with the given text using best-effort DOM APIs.
 */
export function fillProviderDraft(provider: string, text: string): boolean {
  const el = findProviderInput(provider)
  if (!el) return false

  el.focus()

  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    const setter = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(el),
      "value",
    )?.set as
      | ((this: HTMLInputElement | HTMLTextAreaElement, value: string) => void)
      | undefined
    if (setter) {
      setter.call(el, text)
    } else {
      el.value = text
    }
    moveCursorToEnd(el)
    dispatchDraftEvents(el)
    return true
  }

  if (isEditableElement(el)) {
    el.textContent = text
    moveCursorToEnd(el)
    dispatchDraftEvents(el)
    return true
  }

  return false
}
