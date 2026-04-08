/**
 * NER post-filtering blocklist for suppressing common false positives.
 *
 * Applied after NER inference returns results to reject known-bad entity
 * values such as stopwords, programming keywords, repeated characters, and
 * temporal terms misclassified as person names.
 *
 * Architecture layer: Detection Engine (post-processing)
 */

// ---------------------------------------------------------------------------
// Stopwords — common English function words frequently mis-tagged by NER
// ---------------------------------------------------------------------------

const STOPWORDS: Set<string> = new Set([
  "a", "an", "the", "and", "or", "but", "nor", "so", "yet", "for",
  "of", "in", "on", "at", "to", "by", "up", "as", "is", "it",
  "be", "do", "go", "no", "if", "we", "he", "she", "they", "you",
  "i", "me", "my", "our", "us", "his", "her", "its", "their", "them",
  "was", "are", "were", "been", "has", "had", "have", "did", "does",
  "will", "would", "could", "should", "may", "might", "must", "can",
  "not", "that", "this", "these", "those", "what", "which", "who",
  "how", "why", "when", "where", "all", "any", "each", "few", "more",
  "most", "other", "some", "such", "into", "than", "then", "there",
  "from", "with", "about", "after", "before", "between", "through",
  "during", "above", "below", "over", "under", "while", "because",
  "although", "since", "unless", "until", "whether", "both", "either",
  "neither", "also", "only", "just", "even", "very", "too", "much",
  "many", "own", "same", "back", "out", "off", "down", "again",
  "further", "once", "here", "both", "however", "therefore", "thus",
  "hence", "still", "already", "always", "never", "often", "now",
  "being", "having", "get", "got", "make", "made", "take", "taken",
  "know", "think", "see", "look", "come", "give", "find", "tell",
  "ask", "seem", "feel", "leave", "call", "keep", "let", "put",
  "bring", "begin", "show", "hear", "hold", "turn", "need", "became",
  "become", "becomes", "across", "among", "within", "without", "upon",
  "along", "toward", "towards", "against", "throughout", "despite",
  "every", "another", "per", "than", "though", "maybe", "perhaps",
])

// ---------------------------------------------------------------------------
// Programming keywords — reserved words in common languages mis-tagged by NER
// ---------------------------------------------------------------------------

const PROGRAMMING_KEYWORDS: Set<string> = new Set([
  // JavaScript / TypeScript
  "function", "return", "const", "let", "var", "class", "import",
  "export", "default", "async", "await", "new", "this", "super",
  "extends", "implements", "interface", "type", "enum", "namespace",
  "module", "declare", "abstract", "static", "public", "private",
  "protected", "readonly", "override", "typeof", "instanceof",
  "void", "never", "unknown", "any", "null", "undefined", "true",
  "false", "switch", "case", "break", "continue", "throw", "try",
  "catch", "finally", "delete", "in", "of", "yield", "from", "as",
  "satisfies",
  // Python
  "def", "lambda", "pass", "raise", "with", "assert", "global",
  "nonlocal", "elif", "else", "except", "exec", "print",
  // General / other
  "if", "for", "while", "do", "goto", "struct", "union", "typedef",
  "include", "define", "pragma", "ifdef", "endif", "elif",
  "template", "virtual", "inline", "explicit", "operator",
  "require", "require_once", "echo", "isset", "empty",
  "foreach", "endforeach", "endfor", "endwhile",
  "object", "boolean", "number", "string", "integer", "array",
  "list", "dict", "map", "set", "tuple", "vector", "select",
  "where", "from", "join", "table", "index", "view", "insert",
  "update", "delete", "create", "drop", "alter",
])

// ---------------------------------------------------------------------------
// Day and month names — rejected only when entity is PERSON_NAME
// ---------------------------------------------------------------------------

const DAY_MONTH_NAMES: Set<string> = new Set([
  // Full day names
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
  // Day abbreviations
  "mon", "tue", "wed", "thu", "fri", "sat", "sun",
  // Full month names
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
  // Month abbreviations
  "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "oct", "nov", "dec",
])

// ---------------------------------------------------------------------------
// Country names — rejected only when entity is PERSON_NAME
// (allowed when tagged as LOCATION or ORGANIZATION)
// ---------------------------------------------------------------------------

const COUNTRY_NAMES: Set<string> = new Set([
  "afghanistan", "albania", "algeria", "andorra", "angola",
  "argentina", "armenia", "australia", "austria", "azerbaijan",
  "bahrain", "bangladesh", "belarus", "belgium", "bolivia",
  "bosnia", "brazil", "bulgaria", "cambodia", "cameroon",
  "canada", "chile", "china", "colombia", "croatia",
  "cuba", "cyprus", "czechia", "denmark", "ecuador",
  "egypt", "estonia", "ethiopia", "finland", "france",
  "georgia", "germany", "ghana", "greece", "guatemala",
  "honduras", "hungary", "iceland", "india", "indonesia",
  "iran", "iraq", "ireland", "israel", "italy",
  "jamaica", "japan", "jordan", "kazakhstan", "kenya",
  "kuwait", "latvia", "lebanon", "libya", "lithuania",
  "luxembourg", "malaysia", "mexico", "moldova", "morocco",
  "myanmar", "nepal", "netherlands", "newzealand", "nicaragua",
  "nigeria", "norway", "pakistan", "palestine", "panama",
  "peru", "philippines", "poland", "portugal", "qatar",
  "romania", "russia", "saudiarabia", "senegal", "serbia",
  "singapore", "slovakia", "slovenia", "somalia", "southafrica",
  "southkorea", "spain", "srilanka", "sudan", "sweden",
  "switzerland", "syria", "taiwan", "tanzania", "thailand",
  "turkey", "ukraine", "uruguay", "uzbekistan", "venezuela",
  "vietnam", "yemen", "zambia", "zimbabwe",
  // Multi-word country names stored normalized (spaces removed for lookup)
  "united states", "united kingdom", "united arab emirates",
  "new zealand", "south africa", "south korea", "saudi arabia",
  "north korea", "costa rica", "el salvador", "trinidad and tobago",
  "papua new guinea", "czech republic",
])

// ---------------------------------------------------------------------------
// Regex helpers
// ---------------------------------------------------------------------------

/** Matches strings where every character is the same (case-insensitive). */
const REPEATED_CHAR_RE = /^(.)\1+$/i

/** Matches at least one uppercase letter including Latin extended / accented. */
const HAS_UPPERCASE_RE = /[A-Z\u00C0-\u024F]/

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Determines whether a NER-detected entity value should be rejected as a
 * false positive.
 *
 * The function applies a chain of heuristic filters in order of cost
 * (cheapest first). As soon as a rule rejects the value, `true` is returned
 * without evaluating further rules.
 *
 * @param value      - The raw text of the detected entity, as returned by the
 *                     NER model.
 * @param entityType - The NER entity type label (e.g. "PERSON_NAME",
 *                     "ORGANIZATION", "LOCATION", "MEDICAL_TERM").
 * @returns `true` if the value should be discarded (false positive),
 *          `false` if the value appears legitimate and should be kept.
 * @throws Never — all errors surface as `false` (fail-open, keep the match).
 * @example
 * ```ts
 * shouldRejectNERResult("the", "PERSON_NAME")   // true  — stopword
 * shouldRejectNERResult("Germany", "PERSON_NAME") // true  — country as person
 * shouldRejectNERResult("Germany", "LOCATION")   // false — country as location OK
 * shouldRejectNERResult("John Smith", "PERSON_NAME") // false — valid name
 * ```
 */
export function shouldRejectNERResult(
  value: string,
  entityType: string,
): boolean {
  try {
    const trimmed = value.trim()

    // Rule 1: Length — reject anything under 3 characters.
    if (trimmed.length < 3) return true

    // Rule 2: Repeated characters — e.g. "AAAA", "xxxx".
    if (REPEATED_CHAR_RE.test(trimmed)) return true

    // Rule 3: Stopwords — case-insensitive lookup.
    const lower = trimmed.toLowerCase()
    if (STOPWORDS.has(lower)) return true

    // Rule 4: Programming keywords — case-insensitive lookup.
    if (PROGRAMMING_KEYWORDS.has(lower)) return true

    // Rule 5: Day/month names — only reject when tagged as PERSON_NAME.
    if (entityType === "PERSON_NAME" && DAY_MONTH_NAMES.has(lower)) return true

    // Rule 6: Country names — only reject when tagged as PERSON_NAME.
    if (entityType === "PERSON_NAME" && COUNTRY_NAMES.has(lower)) return true

    // Rule 7: Capitalization heuristic — PERSON_NAME must have at least one
    // uppercase letter (supports accented characters via Unicode range).
    if (entityType === "PERSON_NAME" && !HAS_UPPERCASE_RE.test(trimmed)) {
      return true
    }

    return false
  } catch {
    // Fail-open: if anything goes wrong, keep the match rather than
    // silently dropping potentially real PII.
    return false
  }
}
