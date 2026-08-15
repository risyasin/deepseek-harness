/**
 * `SerperSearchProvider`: a `WebSearchProvider` backed by the Serper Google Search API
 * (`POST /search`). It maps `organic[]` entries to sources, maps `answerBox.answer` to the
 * optional generated `content`, and omits provider-private fields.
 * @module @deepseek-ai/dsh-web-search-serper/provider
 */

import { WebError } from '@deepseek-ai/dsh-web'
import type {
  WebSearchProvider,
  WebSearchRequest,
  WebSearchResult,
  WebSearchSource,
} from '@deepseek-ai/dsh-web'
import type { SerperError, SerperOrganicResult, SerperSearchResponse } from './types.ts'

/** Stable id this provider registers under. */
export const SERPER_PROVIDER_ID = 'serper'

/** Default Serper search endpoint; `/search` is the operation. */
export const SERPER_DEFAULT_BASE_URL = 'https://google.serper.dev'

/** Environment variable this provider's API key falls back to. */
export const SERPER_DEFAULT_API_KEY_ENV = 'SERPER_API_KEY'

/** Attribution header sent on every request. Bump with the package version. */
const USER_AGENT = 'deepseek-harness/0.0.1'

/** Resolved provider options (the plugin's `apply` supplies env-var and constant defaults). */
export interface SerperSearchProviderOptions {
  /** Serper API key. Empty/absent makes the provider unavailable. */
  apiKey: string
  /** Endpoint base; `/search` is appended. */
  baseURL: string
  /** Default result count when a request carries no `maxResults` (Serper's `num`). */
  numResults?: number
  /** Optional country/region sent as Serper's `gl`. */
  gl?: string
  /** Optional language sent as Serper's `hl`. */
  hl?: string
}

/** Trim a nullable string to its non-blank form, or `undefined`. */
function nonBlank(value: string | null | undefined): string | undefined {
  if (value === undefined || value === null) return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

/**
 * Map one Serper organic result to a normalized source, or `undefined` when it carries no
 * usable `link` (the seam requires a URL). Unlike Exa, a missing `snippet` does not drop the
 * source — a title-and-link entry is still citeable.
 *
 * @param result - one entry of Serper's `organic[]`.
 * @returns the normalized source, or `undefined` when the entry has no usable link.
 */
export function mapSerperResult(result: SerperOrganicResult): WebSearchSource | undefined {
  const url = nonBlank(result.link)
  if (url === undefined) return undefined
  const title = nonBlank(result.title)
  const snippet = nonBlank(result.snippet)
  const publishedAt = nonBlank(result.date)
  return {
    url,
    ...title !== undefined ? { title } : {},
    ...snippet !== undefined ? { snippet } : {},
    ...publishedAt !== undefined ? { publishedAt } : {},
  }
}

/**
 * Map a Serper response envelope to a normalized search result. `content` carries the
 * `answerBox.answer` direct answer when present; sources come from `organic[]`.
 *
 * @param response - the parsed `POST /search` response body.
 * @returns the normalized result; link-less entries are dropped ({@link mapSerperResult}).
 */
export function mapSerperResponse(response: SerperSearchResponse): WebSearchResult {
  const sources = (response.organic ?? [])
    .map(mapSerperResult)
    .filter((source): source is WebSearchSource => source !== undefined)
  const content = nonBlank(response.answerBox?.answer)
  return {
    ...content !== undefined ? { content } : {},
    sources,
    truncated: false,
  }
}

/** The Serper-backed search provider; HTTP redirects fail as `WEB_PROVIDER_ERROR`. */
export class SerperSearchProvider implements WebSearchProvider {
  readonly id = SERPER_PROVIDER_ID

  constructor(private readonly options: SerperSearchProviderOptions) {}

  available(): boolean {
    return this.options.apiKey.length > 0
      && isValidBaseUrl(this.options.baseURL)
      && (this.options.numResults === undefined || isPositiveInteger(this.options.numResults))
  }

  async search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult> {
    // A per-request bound wins over the configured default; either may be absent.
    const num = request.maxResults ?? this.options.numResults
    const gl = nonBlank(this.options.gl)
    const hl = nonBlank(this.options.hl)
    let response: Response
    try {
      response = await fetch(`${this.options.baseURL}/search`, {
        method: 'POST',
        redirect: 'error',
        headers: {
          'x-api-key': this.options.apiKey,
          'content-type': 'application/json',
          'accept': 'application/json',
          'user-agent': USER_AGENT,
        },
        body: JSON.stringify({
          q: request.query,
          ...num !== undefined ? { num } : {},
          ...gl !== undefined ? { gl } : {},
          ...hl !== undefined ? { hl } : {},
        }),
        ...signal !== undefined ? { signal } : {},
      })
    } catch (error: unknown) {
      if (isAbortError(error)) throw new WebError('Serper search aborted', 'WEB_ABORTED', { cause: error })
      throw new WebError(`Serper search request failed: ${String(error)}`, 'WEB_PROVIDER_ERROR', { cause: error })
    }

    if (!response.ok) {
      const status = response.status
      let message = `Serper API error (HTTP ${status})`
      try {
        const parsed = await response.json() as SerperError
        const detail = parsed.message
        if (detail !== undefined && detail.length > 0) message = detail
      } catch (error: unknown) {
        // An abort fired mid-body must surface as WEB_ABORTED, not be swallowed
        // into a generic HTTP-error message — cancellation is not a provider
        // error (the seam's cancellation contract).
        if (isAbortError(error)) throw new WebError('Serper search aborted', 'WEB_ABORTED', { cause: error })
        // Otherwise: the HTTP status is already captured in `message` above; a
        // malformed/non-JSON error body (normal for gateway 5xx/429s) can only
        // cost a richer provider message, never the real error.
      }
      throw new WebError(message, 'WEB_PROVIDER_ERROR')
    }

    try {
      const payload = await response.json() as SerperSearchResponse
      return mapSerperResponse(payload)
    } catch (error: unknown) {
      if (isAbortError(error)) throw new WebError('Serper search aborted', 'WEB_ABORTED', { cause: error })
      throw new WebError(`Serper returned an unprocessable response body: ${String(error)}`, 'WEB_PROVIDER_ERROR', { cause: error })
    }
  }
}

/** True when `baseURL` parses as an absolute URL (a cheap local config check). */
function isValidBaseUrl(baseURL: string): boolean {
  return URL.canParse(baseURL)
}

/** True for a request limit that can be sent to Serper (a positive whole number). */
function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0
}

/** True for a fetch/`AbortSignal` abort, surfaced as `WEB_ABORTED`. */
function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}
