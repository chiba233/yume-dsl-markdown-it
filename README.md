**English** | [中文](./GUIDE.zh-CN.md)

# yume-dsl-markdown-it

<img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white" />

[![npm](https://img.shields.io/npm/v/yume-dsl-markdown-it)](https://www.npmjs.com/package/yume-dsl-markdown-it)
[![GitHub](https://img.shields.io/badge/GitHub-chiba233%2Fyume--dsl--markdown--it-181717?logo=github)](https://github.com/chiba233/yume-dsl-markdown-it)
[![CI](https://github.com/chiba233/yume-dsl-markdown-it/actions/workflows/publish-yume-dsl-markdown-it.yml/badge.svg)](https://github.com/chiba233/yume-dsl-markdown-it/actions/workflows/publish-yume-dsl-markdown-it.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Contributing](https://img.shields.io/badge/Contributing-guide-blue.svg)](./CONTRIBUTING.md)
[![Security](https://img.shields.io/badge/Security-policy-red.svg)](./SECURITY.md)

[markdown-it](https://github.com/markdown-it/markdown-it) plugin that renders
[`yume-dsl-rich-text`](https://github.com/chiba233/yumeDSL) tags inside Markdown.

> **Heads-up:** The default tag prefix `$$` conflicts with LaTeX math delimiters (`$$...$$`) used by
> most markdown-it math plugins. If your Markdown includes math, create the parser with a different
> prefix — e.g. `createEasySyntax({ tagPrefix: "%%" })` — to avoid collisions. See
> [Custom Syntax](#custom-syntax).

The plugin is pure pipeline glue — it delegates tag grammar to the rich-text parser and rendering to
[`yume-dsl-token-walker`](https://github.com/chiba233/yume-dsl-token-walker).
No syntax rules are hard-coded; swap `createEasySyntax({ tagPrefix: "%%" })` upstream and the plugin follows.

- **Inline** tags (`$$tag(...)$$`) handled by an inline rule
- **Raw** (`$$tag(arg)%...%end$$`) and **block** (`$$tag(arg)*...*end$$`) tags handled by a block rule
- `createText` output is automatically HTML-escaped via `md.utils.escapeHtml`
- Failed DSL fragments fall back to escaped source text by default (`onRenderFailure: "preserve"`)
- Optional `shouldAttempt` fast-path gate to skip parsing at non-DSL positions
- Silent / non-silent result caching — each position is parsed at most once per parser state

**This package is in early development (v0.x).** The API may change between minor versions.
Once stable, breaking changes will land in major versions with explicit migration notes.

---

## Table of Contents

- [Ecosystem](#ecosystem)
- [Install](#install)
- [Quick Start](#quick-start)
- [Options](#options)
- [Tag Forms](#tag-forms)
- [Custom Syntax](#custom-syntax)
- [Error Handling](#error-handling)
- [Safety](#safety)
- [Changelog](#changelog)
- [License](#license)

---

## Ecosystem

```
text ──▶ yume-dsl-rich-text (parse) ──▶ TextToken[] ──▶ yume-dsl-token-walker (interpret) ──▶ TNode[]
         │                                                        │
         ╰─────────── yume-dsl-markdown-it (glue) ───────────────╯
                                   ↓
                        markdown-it pipeline ──▶ HTML
```

| Package                                                                            | Role                                                            |
|------------------------------------------------------------------------------------|-----------------------------------------------------------------|
| [`yume-dsl-rich-text`](https://github.com/chiba233/yumeDSL)                        | Parser — text to token tree                                     |
| [`yume-dsl-token-walker`](https://github.com/chiba233/yume-dsl-token-walker)       | Interpreter — token tree to output nodes                        |
| [`yume-dsl-shiki-highlight`](https://github.com/chiba233/yume-dsl-shiki-highlight) | Syntax highlighting — tokens or TextMate grammar                |
| **`yume-dsl-markdown-it`**                                                         | markdown-it plugin — DSL tags inside Markdown (this package)    |

---

## Install

```bash
npm install yume-dsl-markdown-it markdown-it
# or
pnpm add yume-dsl-markdown-it markdown-it
```

`yume-dsl-token-walker` and `yume-dsl-rich-text` are dependencies and will be installed automatically.
`markdown-it` is a peer dependency — bring your own version (`>=14`).

---

## Quick Start

```ts
import MarkdownIt from "markdown-it";
import { createParser, createSimpleInlineHandlers } from "yume-dsl-rich-text";
import type { InterpretRuleset } from "yume-dsl-token-walker";
import { yumePlugin } from "yume-dsl-markdown-it";

const parser = createParser({
  handlers: createSimpleInlineHandlers(["bold", "italic"]),
});

const ruleset: InterpretRuleset<string> = {
  createText: (text) => text,
  interpret: (token, helpers) => {
    if (token.type === "bold")
      return { type: "nodes", nodes: ["<strong>", ...helpers.interpretChildren(token.value), "</strong>"] };
    if (token.type === "italic")
      return { type: "nodes", nodes: ["<em>", ...helpers.interpretChildren(token.value), "</em>"] };
    return { type: "unhandled" };
  },
  onUnhandled: "flatten",
};

const md = new MarkdownIt().use(yumePlugin, { parser, ruleset, env: undefined });

md.render("# Hello $$bold(world)$$");
// → <h1>Hello <strong>world</strong></h1>
```

---

## Options

```ts
interface YumePluginOptions<TEnv = undefined> {
  /** yume-dsl-rich-text parser instance */
  parser: Parser;

  /** token-walker ruleset whose string nodes represent HTML fragments */
  ruleset: InterpretRuleset<string, TEnv>;

  /** environment value forwarded to every interpret call */
  env: TEnv;

  /** optional fast-path gate before delegating to the parser */
  shouldAttempt?: (src: string, pos: number) => boolean;

  /** render contract for parse / interpret failures after a DSL match is confirmed */
  onRenderFailure?: "preserve" | "throw" | ((context: RenderFailureContext<TEnv>) => string);
}
```

### `shouldAttempt`

Called at every character position before the parser runs. Return `false` to skip parsing entirely at
that position. Useful when you know your DSL always starts with a fixed prefix:

```ts
md.use(yumePlugin, {
  parser,
  ruleset,
  env: undefined,
  shouldAttempt: (src, pos) => src.charCodeAt(pos) === 0x24 && src.charCodeAt(pos + 1) === 0x24,
});
```

### `onRenderFailure`

Controls what happens when a DSL tag is structurally matched but `interpretTokens` throws:

| Value        | Behavior                                        |
|--------------|-------------------------------------------------|
| `"preserve"` | Emit the original source text, HTML-escaped     |
| `"throw"`    | Re-throw the error                              |
| `function`   | Call with `{ error, source, env, form }`, return HTML string |

Default: `"preserve"`.

---

## Tag Forms

The plugin recognizes all three yume-dsl tag forms:

| Form   | Syntax                          | Rule    | Example                                  |
|--------|---------------------------------|---------|------------------------------------------|
| Inline | `$$tag(content)$$`              | Inline  | `$$bold(hello)$$`                        |
| Raw    | `$$tag(arg)% content %end$$`    | Block   | `$$code(ts)% const x = 1; %end$$`       |
| Block  | `$$tag(arg)* content *end$$`    | Block   | `$$collapse(note)* ... *end$$`           |

Inline tags live inside paragraphs, headings, list items, etc.
Raw and block tags are block-level — they stand alone between paragraphs.

---

## Custom Syntax

The plugin does not hard-code any delimiter. If you create a parser with custom syntax, the plugin
follows automatically:

```ts
import { createEasySyntax, createParser, createSimpleInlineHandlers } from "yume-dsl-rich-text";

const parser = createParser({
  syntax: createEasySyntax({ tagPrefix: "%%" }),
  handlers: createSimpleInlineHandlers(["bold"]),
});

const md = new MarkdownIt().use(yumePlugin, { parser, ruleset, env: undefined });

md.render("%%bold(hello)%%");
// → <p><strong>hello</strong></p>
```

For full syntax customization details, see the
[`yume-dsl-rich-text` documentation](https://github.com/chiba233/yumeDSL/?tab=readme-ov-file#custom-syntax).

---

## Error Handling

- **Structural match but render failure**: controlled by `onRenderFailure` (default: `"preserve"`)
- **No structural match**: the text passes through to markdown-it as-is — no error
- **Parser exception during structural scan**: silently skipped (returns `false` to markdown-it)

The plugin never throws by default. Set `onRenderFailure: "throw"` to surface errors during development.

---

## Safety

- `createText` output is wrapped with `md.utils.escapeHtml` — plain text nodes are always escaped
- Failed fragments are escaped before emitting when `onRenderFailure` is `"preserve"`
- The plugin does not inject raw HTML from user input unless your `ruleset.interpret` explicitly returns it
- `ruleset.createText` should return **un-escaped plain text**; the plugin handles escaping

---

## Changelog

See [CHANGELOG.md](./CHANGELOG.md).

## License

[MIT](./LICENSE) &copy; 星野夢華
