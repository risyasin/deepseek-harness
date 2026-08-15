/**
 * Wire types for the Serper Google Search API (`POST https://google.serper.dev/search`).
 * Types only — no runtime code. Serper returns a flat `organic[]` of organic results
 * and, when the query has a direct answer, an `answerBox` object carrying a generated
 * answer sentence.
 *
 * @module @deepseek-ai/dsh-web-search-serper/types
 */

/** Request body sent to Serper's search endpoint. */
export interface SerperSearchRequest {
  q: string
  /** Result count (Serper's `num`); the seam still enforces the bound on return. */
  num?: number
  /** Optional country/region (Serper's `gl`). */
  gl?: string
  /** Optional language (Serper's `hl`). */
  hl?: string
}

/** One entry of Serper's flat `organic[]`. */
export interface SerperOrganicResult {
  title?: string | null
  link?: string | null
  snippet?: string | null
  /** Publication date as Serper supplies it (best effort, not necessarily ISO-8601). */
  date?: string | null
}

/** Serper's `answerBox`, present when the query has a direct answer. */
export interface SerperAnswerBox {
  title?: string | null
  answer?: string | null
  snippet?: string | null
  link?: string | null
}

/** Serper's search response envelope. */
export interface SerperSearchResponse {
  organic?: SerperOrganicResult[]
  answerBox?: SerperAnswerBox | null
}

/** Serper's error response envelope (best-effort; fields vary by failure). */
export interface SerperError {
  message?: string
}
