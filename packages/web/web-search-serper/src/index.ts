/**
 * `@deepseek-ai/dsh-web-search-serper`: registers a Serper-backed `WebSearchProvider`
 * with `ctx.web`. A function/namespace plugin (NOT a default-export service):
 * a search provider does not own the `ctx.web` key — it registers INTO the
 * seam's provider registry, exactly as `@deepseek-ai/dsh-web-search-exa`
 * registers its backend. The key is owned by `@deepseek-ai/dsh-web`.
 *
 * @module @deepseek-ai/dsh-web-search-serper
 */

import type { Context } from '@deepseek-ai/cordis'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-web'
import {
  SerperSearchProvider,
  SERPER_DEFAULT_API_KEY_ENV,
  SERPER_DEFAULT_BASE_URL,
} from './provider.ts'

export {
  SERPER_DEFAULT_API_KEY_ENV,
  SERPER_DEFAULT_BASE_URL,
  SERPER_PROVIDER_ID,
  SerperSearchProvider,
} from './provider.ts'
export type { SerperSearchProviderOptions } from './provider.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'web-search-serper'

/** The web seam this provider registers into. */
export const inject = ['web']

/** Plugin config (all optional — `apply` fills env-var and constant defaults). */
export interface Config {
  /**
   * Literal Serper API key. Prefer the `$SERPER_API_KEY` environment variable so
   * no secret enters configuration files. Empty → provider unavailable.
   */
  apiKey?: string
  /** Endpoint base; `/search` is appended. Defaults to the public API. */
  baseURL?: string
  /** Default result count when a request carries no `maxResults`. Omitted = none. */
  numResults?: number
  /** Optional country/region sent as Serper's `gl`. */
  gl?: string
  /** Optional language sent as Serper's `hl`. */
  hl?: string
}

export const Config: z<Config> = z.object({
  // `role('secret')` keeps a literal key out of every describe()/config-dump
  // response — the same marker the sibling providers use for credential fields.
  apiKey: z.string().role('secret'),
  baseURL: z.string(),
  numResults: z.number().step(1).min(1),
  gl: z.string(),
  hl: z.string(),
})

/** Register the Serper search provider with `ctx.web`. */
export function apply(ctx: Context, config: Config): void {
  ctx.web.registerSearchProvider(new SerperSearchProvider({
    // Every environment layer may name this key: the product trusts the
    // project it is launched in, and the managed store is not involved here.
    apiKey: config.apiKey ?? launchEnvironmentOf(ctx).get(SERPER_DEFAULT_API_KEY_ENV)?.value ?? '',
    baseURL: config.baseURL ?? SERPER_DEFAULT_BASE_URL,
    ...config.numResults !== undefined ? { numResults: config.numResults } : {},
    ...config.gl !== undefined && config.gl.length > 0 ? { gl: config.gl } : {},
    ...config.hl !== undefined && config.hl.length > 0 ? { hl: config.hl } : {},
  }))
}
