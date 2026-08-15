import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import WebRuntime from '@deepseek-ai/dsh-web'
import { SerperSearchProvider, SERPER_PROVIDER_ID } from '@deepseek-ai/dsh-web-search-serper'
import * as serperPlugin from '@deepseek-ai/dsh-web-search-serper'
import { mapSerperResponse, mapSerperResult } from '../src/provider.ts'

const options = { apiKey: 'serper-key', baseURL: 'https://google.serper.test' }

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' }, ...init })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Serper result mapping', () => {
  it('maps a full organic entry', () => {
    expect(mapSerperResult({
      title: 'A',
      link: 'https://a.test',
      snippet: 'a salient sentence',
      date: 'Feb 13, 2025',
    })).toEqual({ url: 'https://a.test', title: 'A', snippet: 'a salient sentence', publishedAt: 'Feb 13, 2025' })
  })

  it('drops an entry with no usable link', () => {
    expect(mapSerperResult({ title: 'A' })).toBeUndefined()
    expect(mapSerperResult({ link: null })).toBeUndefined()
    expect(mapSerperResult({ link: '   ' })).toBeUndefined()
  })

  it('keeps a snippet-less entry as a title-and-link source', () => {
    expect(mapSerperResult({ title: 'A', link: 'https://a.test' }))
      .toEqual({ url: 'https://a.test', title: 'A' })
  })

  it('omits null/blank optional fields rather than emitting them', () => {
    expect(mapSerperResult({ title: null, snippet: '', date: ' ', link: 'https://a.test' }))
      .toEqual({ url: 'https://a.test' })
  })

  it('maps a response to sources and answerBox answer content', () => {
    const result = mapSerperResponse({
      organic: [
        { title: 'A', link: 'https://a.test', snippet: 'one' },
        { title: 'B' },
        { title: 'C', link: 'https://c.test' },
      ],
      answerBox: { answer: '42' },
    })
    expect(result).toEqual({
      content: '42',
      sources: [
        { url: 'https://a.test', title: 'A', snippet: 'one' },
        { url: 'https://c.test', title: 'C' },
      ],
      truncated: false,
    })
  })

  it('omits content when the answerBox carries no answer', () => {
    expect(mapSerperResponse({ organic: [], answerBox: { title: 'Q', link: 'https://a.test' } }).content)
      .toBeUndefined()
  })

  it('tolerates a missing organic array', () => {
    expect(mapSerperResponse({}).sources).toEqual([])
  })
})

describe('SerperSearchProvider availability', () => {
  it('is unavailable without a key', () => {
    expect(new SerperSearchProvider({ ...options, apiKey: '' }).available()).toBe(false)
  })

  it('is available with a key', () => {
    expect(new SerperSearchProvider(options).available()).toBe(true)
  })

  it('is misconfigured when the base URL is unparseable', () => {
    expect(new SerperSearchProvider({ ...options, baseURL: 'not a url' }).available()).toBe(false)
  })

  it('is misconfigured when numResults is set but not a positive integer', () => {
    expect(new SerperSearchProvider({ ...options, numResults: -1 }).available()).toBe(false)
    expect(new SerperSearchProvider({ ...options, numResults: 1.5 }).available()).toBe(false)
  })
})

describe('SerperSearchProvider request mapping', () => {
  it('sends q, num, gl, hl and the X-API-KEY header', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ organic: [{ link: 'https://a.test' }] }))
    vi.stubGlobal('fetch', fetchMock)

    const provider = new SerperSearchProvider({ ...options, gl: 'us', hl: 'en' })
    await provider.search({ query: 'hello', maxResults: 5 })

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://google.serper.test/search')
    expect(init).toMatchObject({ method: 'POST', redirect: 'error' })
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('serper-key')
    expect(JSON.parse(init.body as string)).toEqual({ q: 'hello', num: 5, gl: 'us', hl: 'en' })
  })

  it('falls back to the configured numResults when a request omits maxResults', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ organic: [] }))
    vi.stubGlobal('fetch', fetchMock)
    await new SerperSearchProvider({ ...options, numResults: 7 }).search({ query: 'q' })
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toMatchObject({ num: 7 })
  })

  it('lets a request maxResults win over the configured numResults', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ organic: [] }))
    vi.stubGlobal('fetch', fetchMock)
    await new SerperSearchProvider({ ...options, numResults: 7 }).search({ query: 'q', maxResults: 2 })
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toMatchObject({ num: 2 })
  })

  it('omits num, gl and hl when unset', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ organic: [] }))
    vi.stubGlobal('fetch', fetchMock)
    await new SerperSearchProvider(options).search({ query: 'q' })
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({ q: 'q' })
  })

  it('forwards the abort signal', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ organic: [] }))
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()
    await new SerperSearchProvider(options).search({ query: 'q' }, controller.signal)
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(init.signal).toBe(controller.signal)
  })
})

describe('SerperSearchProvider error handling', () => {
  it('maps an HTTP error to WEB_PROVIDER_ERROR with the provider message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ message: 'bad key' }, { status: 401 })))
    await expect(new SerperSearchProvider(options).search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_ERROR', message: 'bad key' }))
  })

  it('keeps a status-line message when the error body is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('gateway down', { status: 502 })))
    await expect(new SerperSearchProvider(options).search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_ERROR', message: 'Serper API error (HTTP 502)' }))
  })

  it('keeps the status-line message when the JSON error body carries no message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({}, { status: 500 })))
    await expect(new SerperSearchProvider(options).search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({ message: 'Serper API error (HTTP 500)' }))
  })

  it('maps a network failure to WEB_PROVIDER_ERROR', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('connection refused'))))
    await expect(new SerperSearchProvider(options).search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_ERROR' }))
  })

  it('maps an abort to WEB_ABORTED', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new DOMException('aborted', 'AbortError'))))
    await expect(new SerperSearchProvider(options).search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_ABORTED' }))
  })

  it('maps an unparseable success body to WEB_PROVIDER_ERROR', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not json', { status: 200 })))
    await expect(new SerperSearchProvider(options).search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_ERROR' }))
  })

  it('maps a well-formed body of the wrong shape to WEB_PROVIDER_ERROR, not a raw TypeError', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ organic: {} }, { status: 200 })))
    await expect(new SerperSearchProvider(options).search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_ERROR' }))
  })

  it('surfaces an abort during success-body parse as WEB_ABORTED, not provider error', async () => {
    const body = { json: () => Promise.reject(new DOMException('aborted', 'AbortError')), ok: true, status: 200 }
    vi.stubGlobal('fetch', vi.fn(async () => body as unknown as Response))
    await expect(new SerperSearchProvider(options).search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_ABORTED' }))
  })

  it('surfaces an abort during error-body parse as WEB_ABORTED', async () => {
    const body = { json: () => Promise.reject(new DOMException('aborted', 'AbortError')), ok: false, status: 500 }
    vi.stubGlobal('fetch', vi.fn(async () => body as unknown as Response))
    await expect(new SerperSearchProvider(options).search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_ABORTED' }))
  })
})

describe('web-search-serper plugin registration', () => {
  it('registers the provider into ctx.web (HMR-safe)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ organic: [] })))
    const ctx = new Context()
    await ctx.plugin(WebRuntime, { searchProvider: SERPER_PROVIDER_ID })
    const fiber = await ctx.plugin(serperPlugin, { apiKey: 'serper-key' })
    await expect(ctx.web.search({ query: 'q' })).resolves.toMatchObject({ sources: [], truncated: false })
    await fiber.dispose()
    await expect(ctx.web.search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_CONFIGURED_MISSING' }))
  })

  it('has no default export (namespace plugin export shape)', () => {
    expect('default' in serperPlugin).toBe(false)
  })

  it('threads numResults, gl and hl config into the request', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ organic: [] }))
    vi.stubGlobal('fetch', fetchMock)
    const ctx = new Context()
    await ctx.plugin(WebRuntime, { searchProvider: SERPER_PROVIDER_ID })
    const fiber = await ctx.plugin(serperPlugin, { apiKey: 'serper-key', numResults: 9, gl: 'us', hl: 'en' })
    await ctx.web.search({ query: 'q' })
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toMatchObject({ num: 9, gl: 'us', hl: 'en' })
    await fiber.dispose()
  })

  it('falls back to $SERPER_API_KEY and the default base URL when config omits them', async () => {
    const prev = process.env.SERPER_API_KEY
    process.env.SERPER_API_KEY = 'env-key'
    try {
      const fetchMock = vi.fn(async () => jsonResponse({ organic: [] }))
      vi.stubGlobal('fetch', fetchMock)
      const ctx = new Context()
      await ctx.plugin(WebRuntime, { searchProvider: SERPER_PROVIDER_ID })
      const fiber = await ctx.plugin(serperPlugin, {})
      await ctx.web.search({ query: 'q' })
      const [url] = fetchMock.mock.calls[0] as unknown as [string]
      expect(url).toBe('https://google.serper.dev/search')
      await fiber.dispose()
    } finally {
      if (prev === undefined) delete process.env.SERPER_API_KEY
      else process.env.SERPER_API_KEY = prev
    }
  })

  it('is unavailable when neither config nor env supplies a key', async () => {
    const prev = process.env.SERPER_API_KEY
    delete process.env.SERPER_API_KEY
    try {
      const ctx = new Context()
      await ctx.plugin(WebRuntime, { searchProvider: SERPER_PROVIDER_ID })
      await ctx.plugin(serperPlugin, {})
      await expect(ctx.web.search({ query: 'q' }))
        .rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_CONFIGURED_UNAVAILABLE' }))
    } finally {
      if (prev !== undefined) process.env.SERPER_API_KEY = prev
    }
  })
})
