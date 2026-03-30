**English** | [中文](./CHANGELOG.zh-CN.md)

# Changelog

### 0.1.1

- Initial release — markdown-it plugin for yume-dsl-rich-text
- Inline rule: delegates tag grammar to `parser.structural()`, renders via `interpretTokens`
- Block rule: handles raw (`$$tag(arg)%...%end$$`) and block (`$$tag(arg)*...*end$$`) forms
- `createText` output is automatically HTML-escaped via `md.utils.escapeHtml`
- `onRenderFailure` option: `"preserve"` (default), `"throw"`, or custom function
- `shouldAttempt` fast-path gate for skipping non-DSL positions
- WeakMap-based per-render caching — each position parsed at most once
- No hard-coded syntax — works with any `createEasySyntax` configuration
- Exports: `yumePlugin`, `YumePluginOptions`, `RenderFailureContext`, re-exports `InterpretRuleset` and `Parser`
