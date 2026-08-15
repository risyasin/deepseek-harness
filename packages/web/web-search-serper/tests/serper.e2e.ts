import { describe, expect, it } from 'vitest'
import { SerperSearchProvider, SERPER_DEFAULT_BASE_URL } from '@deepseek-ai/dsh-web-search-serper'

/**
 * Real-API smoke for the Serper search provider. Self-skips without `$SERPER_API_KEY`
 * (CI has no secrets), per the with-key e2e policy in docs/testing.md.
 */
const apiKey = process.env.SERPER_API_KEY
const maybe = apiKey !== undefined && apiKey.length > 0 ? describe : describe.skip

maybe('SerperSearchProvider real API', () => {
  it('returns sources for a live query', async () => {
    const provider = new SerperSearchProvider({
      apiKey: apiKey!,
      baseURL: process.env.SERPER_BASE_URL ?? SERPER_DEFAULT_BASE_URL,
    })
    const result = await provider.search({ query: 'DeepSeek Harness', maxResults: 5 })
    expect(result.sources.length).toBeGreaterThan(0)
    for (const source of result.sources) expect(source.url).toMatch(/^https?:\/\//)
  }, 30_000)
})
