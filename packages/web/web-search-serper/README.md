# @deepseek-ai/dsh-web-search-serper

English | [中文](README.zh.md)

A [Serper](https://serper.dev) (Google Search API)-backed `WebSearchProvider` for the harness [web capability seam](../web/README.md) (`ctx.web`). It calls Serper's `POST /search` endpoint and maps the flat `organic[]` plus the optional `answerBox` direct answer into the seam's normalized `WebSearchResult`.

This is an **implementation** package: it registers a provider into `ctx.web`, it does not own the `ctx.web` key, and it does not register a model-facing tool (that is `@deepseek-ai/dsh-tool-web`). Like `@deepseek-ai/dsh-web-search-exa`, it is a function/namespace plugin (`inject: ['web']`).

## Config

| Key | Default | Meaning |
|---|---|---|
| `apiKey` | `$SERPER_API_KEY` | Serper API key. Empty/absent makes the provider unavailable. |
| `baseURL` | `https://google.serper.dev` | Endpoint base; `/search` is appended. An unparseable value makes the provider unavailable. |
| `numResults` | (unset) | Default result count when a request carries no `maxResults`; sent as Serper's `num`. Must be a positive integer. |
| `gl` | (unset) | Optional country/region hint (Serper's `gl`). |
| `hl` | (unset) | Optional language hint (Serper's `hl`). |

```yaml
- id: web-search-serper
  name: '@deepseek-ai/dsh-web-search-serper'
  config:
    apiKey: !!js process.env.SERPER_API_KEY
```

## Mapping

Serper returns a flat `organic[]` and no provider-written summary, so each organic entry maps to a `WebSearchSource`: `url` ← `link`, `title` ← `title`, `snippet` ← `snippet`, `publishedAt` ← `date` (passed through verbatim — Serper dates are display strings, not ISO-8601). An entry with no usable `link` is dropped; a missing `snippet` keeps the title-and-link source. When the response carries an `answerBox.answer` (Serper's direct answer to the query), it is mapped to `content`; the `answerBox` is otherwise ignored.

A request's `maxResults` wins over the configured `numResults` default and is sent as Serper's `num` for a cost/latency optimization; the final bound is enforced by the seam. Provider failures (HTTP errors, network failure, unparseable or wrong-shape bodies) surface as `WebError` `WEB_PROVIDER_ERROR`; an aborted request surfaces as `WEB_ABORTED`. HTTP redirects are rejected before the `Location` target is contacted and surface as `WEB_PROVIDER_ERROR`.

## Model Experience

Indirectly, through [`dsh-tool-web`](../tool-web/README.md), which retains this provider's `maxResults`-bounded URLs, titles, snippets, publication dates, and the direct-answer `content`, or its exact `Serper search aborted`, `Serper search request failed: <error>`, and `Serper returned an unprocessable response body: <error>` failures under the consumer's error wrapper while provider-private fields remain outside context.

## Known Limitations and Deferred Work

- **Only `numResults`/`gl`/`hl` are exposed** — Serper's other controls (`page`, `tbs`, `autocorrect`) wait on provider-neutral Service Definition fields.
- **`publishedAt` is not normalized** — Serper returns display dates ("Feb 13, 2025"), which the seam passes through as-is.
- **`answerBox` beyond `answer` is ignored** — `knowledgeGraph`, `relatedSearches`, and `peopleAlsoAsk` are not mapped.
- **Abort classification is error-shape-based** — only a `DOMException` named `AbortError` maps to `WEB_ABORTED`.
