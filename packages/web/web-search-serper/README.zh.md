# @deepseek-ai/dsh-web-search-serper

[English](README.md) | 中文

一个以 [Serper](https://serper.dev)（Google 搜索 API）为后端的 `WebSearchProvider`，服务于 harness 的 [web 能力接缝](../web/README.md)（`ctx.web`）。它调用 Serper 的 `POST /search` 端点，把扁平的 `organic[]` 以及可选的 `answerBox` 直接答案映射为接缝标准化的 `WebSearchResult`。

这是一个**实现**包：它把提供方注册进 `ctx.web`，不拥有 `ctx.web` 键，也不注册面向模型的工具（那是 `@deepseek-ai/dsh-tool-web`）。与 `@deepseek-ai/dsh-web-search-exa` 一样，它是一个函数/命名空间插件（`inject: ['web']`）。

## Config

| 键 | 默认值 | 含义 |
|---|---|---|
| `apiKey` | `$SERPER_API_KEY` | Serper API 密钥。为空/缺失时该提供方不可用。 |
| `baseURL` | `https://google.serper.dev` | 端点基址；会追加 `/search`。无法解析的值会使该提供方不可用。 |
| `numResults` | （未设置） | 当请求未携带 `maxResults` 时的默认结果数；作为 Serper 的 `num` 发送。必须是正整数。 |
| `gl` | （未设置） | 可选的国家/地区提示（Serper 的 `gl`）。 |
| `hl` | （未设置） | 可选的语言提示（Serper 的 `hl`）。 |

```yaml
- id: web-search-serper
  name: '@deepseek-ai/dsh-web-search-serper'
  config:
    apiKey: !!js process.env.SERPER_API_KEY
```

## Mapping

Serper 返回扁平的 `organic[]`，不提供由提供方撰写的摘要，因此每个 organic 条目映射为一个 `WebSearchSource`：`url` ← `link`、`title` ← `title`、`snippet` ← `snippet`、`publishedAt` ← `date`（原样透传——Serper 的日期是展示字符串，不是 ISO-8601）。没有可用 `link` 的条目会被丢弃；缺少 `snippet` 的条目仍保留 title+link 来源。当响应携带 `answerBox.answer`（Serper 对查询的直接答案）时，会把它映射为 `content`；否则忽略 `answerBox`。

请求的 `maxResults` 优先于配置的 `numResults` 默认值，并作为 Serper 的 `num` 发送以做成本/延迟优化；最终上界由接缝强制执行。提供方失败（HTTP 错误、网络失败、无法解析或形状错误的响应体）会以 `WebError` `WEB_PROVIDER_ERROR` 暴露；被中止的请求以 `WEB_ABORTED` 暴露。HTTP 重定向会在联系 `Location` 目标前被拒绝，并以 `WEB_PROVIDER_ERROR` 暴露。

## Model Experience

间接地通过 [`dsh-tool-web`](../tool-web/README.md) 生效：它保留该提供方受 `maxResults` 约束的 URL、标题、摘要、发布日期，以及直接答案 `content`；失败时则在该消费方的错误包装下保留确切的 `Serper search aborted`、`Serper search request failed: <error>`、`Serper returned an unprocessable response body: <error>` 文本，而提供方私有字段仍留在上下文之外。

## Known Limitations and Deferred Work

- **仅暴露 `numResults`/`gl`/`hl`** —— Serper 的其他控制项（`page`、`tbs`、`autocorrect`）有待提供方中立的 Service Definition 字段。
- **`publishedAt` 未做标准化** —— Serper 返回展示日期（"Feb 13, 2025"），接缝原样透传。
- **`answerBox` 除 `answer` 外被忽略** —— `knowledgeGraph`、`relatedSearches`、`peopleAlsoAsk` 未映射。
- **中止分类基于错误形状** —— 只有名为 `AbortError` 的 `DOMException` 会映射为 `WEB_ABORTED`。
