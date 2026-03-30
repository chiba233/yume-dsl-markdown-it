[English](./README.md) | **中文**

# yume-dsl-markdown-it

<img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white" />

[![npm](https://img.shields.io/npm/v/yume-dsl-markdown-it)](https://www.npmjs.com/package/yume-dsl-markdown-it)
[![GitHub](https://img.shields.io/badge/GitHub-chiba233%2Fyume--dsl--markdown--it-181717?logo=github)](https://github.com/chiba233/yume-dsl-markdown-it)
[![CI](https://github.com/chiba233/yume-dsl-markdown-it/actions/workflows/publish-yume-dsl-markdown-it.yml/badge.svg)](https://github.com/chiba233/yume-dsl-markdown-it/actions/workflows/publish-yume-dsl-markdown-it.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Contributing](https://img.shields.io/badge/贡献指南-guide-blue.svg)](./CONTRIBUTING.zh-CN.md)
[![Security](https://img.shields.io/badge/安全策略-policy-red.svg)](./SECURITY.md)

在 Markdown 中渲染 [`yume-dsl-rich-text`](https://github.com/chiba233/yumeDSL) 标签的
[markdown-it](https://github.com/markdown-it/markdown-it) 插件。

> **注意：** 默认标签前缀 `$$` 与大多数 markdown-it 数学公式插件使用的 LaTeX 定界符（`$$...$$`）
> 冲突。如果你的 Markdown 包含数学表达式，请在创建 parser 时更换前缀——例如
> `createEasySyntax({ tagPrefix: "%%" })`。详见[自定义语法](#自定义语法)。

插件只做管道胶水——tag 语法交给 rich-text parser，渲染交给
[`yume-dsl-token-walker`](https://github.com/chiba233/yume-dsl-token-walker)。
不硬编码任何语法规则；上游换 `createEasySyntax({ tagPrefix: "%%" })` 插件自动跟。

- **Inline** 标签（`$$tag(...)$$`）由 inline rule 处理
- **Raw**（`$$tag(arg)%...%end$$`）和 **Block**（`$$tag(arg)*...*end$$`）标签由 block rule 处理
- `createText` 输出自动经 `md.utils.escapeHtml` 转义
- DSL 片段渲染失败时默认回退为转义后的源文本（`onRenderFailure: "preserve"`）
- 可选的 `shouldAttempt` 快速门控，跳过非 DSL 位置的解析
- silent / non-silent 结果缓存——同一 parser state 内每个位置最多解析一次
- Block 匹配受当前 markdown-it 容器边界约束，blockquote / list 不会把前缀或结束标记泄漏到容器外

**本包处于早期开发阶段（v0.x）。** API 可能在次版本号之间变动。稳定后，破坏性变更将在主版本号升级时附带明确的迁移说明。

---

## 目录

- [生态](#生态)
- [安装](#安装)
- [快速上手](#快速上手)
- [选项](#选项)
- [标签形式](#标签形式)
- [自定义语法](#自定义语法)
- [错误处理](#错误处理)
- [安全性](#安全性)
- [更新日志](#更新日志)
- [许可证](#许可证)

---

## 生态

```
text ──▶ yume-dsl-rich-text (parse) ──▶ TextToken[] ──▶ yume-dsl-token-walker (interpret) ──▶ TNode[]
         │                                                       │
         ╰─────────── yume-dsl-markdown-it (glue) ───────────────╯
                                   ↓
                        markdown-it 管道 ──▶ HTML
```

| 包                                                                                  | 角色                                       |
|------------------------------------------------------------------------------------|------------------------------------------|
| [`yume-dsl-rich-text`](https://github.com/chiba233/yumeDSL)                        | 解析器 — 文本到 token 树                        |
| [`yume-dsl-token-walker`](https://github.com/chiba233/yume-dsl-token-walker)       | 解释器 — token 树到输出节点                       |
| [`yume-dsl-shiki-highlight`](https://github.com/chiba233/yume-dsl-shiki-highlight) | 语法高亮 — 彩色 token 或 TextMate 语法            |
| **`yume-dsl-markdown-it`**                                                         | markdown-it 插件 — Markdown 中渲染 DSL 标签（本包） |

---

## 安装

```bash
npm install yume-dsl-markdown-it markdown-it
# 或
pnpm add yume-dsl-markdown-it markdown-it
```

`yume-dsl-token-walker` 和 `yume-dsl-rich-text` 是依赖项，会自动安装。
`markdown-it` 是 peer dependency，需自行安装（`>=14`）。

---

## 快速上手

```ts
import MarkdownIt from "markdown-it";
import {createParser, createSimpleInlineHandlers} from "yume-dsl-rich-text";
import type {InterpretRuleset} from "yume-dsl-token-walker";
import {yumePlugin} from "yume-dsl-markdown-it";

const parser = createParser({
    handlers: createSimpleInlineHandlers(["bold", "italic"]),
});

const ruleset: InterpretRuleset<string> = {
    createText: (text) => text,
    interpret: (token, helpers) => {
        if (token.type === "bold")
            return {type: "nodes", nodes: ["<strong>", ...helpers.interpretChildren(token.value), "</strong>"]};
        if (token.type === "italic")
            return {type: "nodes", nodes: ["<em>", ...helpers.interpretChildren(token.value), "</em>"]};
        return {type: "unhandled"};
    },
    onUnhandled: "flatten",
};

const md = new MarkdownIt().use(yumePlugin, {parser, ruleset, env: undefined});

md.render("# Hello $$bold(world)$$");
// → <h1>Hello <strong>world</strong></h1>
```

---

## 选项

```ts
interface YumePluginOptions<TEnv = undefined> {
    /** yume-dsl-rich-text parser 实例 */
    parser: Parser;

    /** token-walker 规则集，TNode 为 string（HTML 片段） */
    ruleset: InterpretRuleset<string, TEnv>;

    /** 环境值，转发给每次 interpret 调用 */
    env: TEnv;

    /** 可选的快速门控，在交给 parser 前调用 */
    shouldAttempt?: (src: string, pos: number) => boolean;

    /** DSL 匹配成功但渲染失败时的处理策略 */
    onRenderFailure?: "preserve" | "throw" | ((context: RenderFailureContext<TEnv>) => string);
}
```

### `shouldAttempt`

在每个字符位置、parser 运行之前调用。返回 `false` 可完全跳过该位置的解析。适合你知道 DSL
总是以固定前缀开头的场景：

```ts
md.use(yumePlugin, {
    parser,
    ruleset,
    env: undefined,
    shouldAttempt: (src, pos) => src.charCodeAt(pos) === 0x24 && src.charCodeAt(pos + 1) === 0x24,
});
```

### `onRenderFailure`

控制 DSL 标签结构匹配成功、但 `interpretTokens` 抛错时的行为：

| 值            | 行为                                              |
|--------------|-------------------------------------------------|
| `"preserve"` | 输出原始源文本（HTML 转义后）                               |
| `"throw"`    | 重新抛出错误                                          |
| `function`   | 以 `{ error, source, env, form }` 调用，返回 HTML 字符串 |

默认值：`"preserve"`。

---

## 标签形式

插件识别 yume-dsl 的全部三种标签形式：

| 形式     | 语法                           | 规则     | 示例                                |
|--------|------------------------------|--------|-----------------------------------|
| Inline | `$$tag(content)$$`           | Inline | `$$bold(hello)$$`                 |
| Raw    | `$$tag(arg)% content %end$$` | Block  | `$$code(ts)% const x = 1; %end$$` |
| Block  | `$$tag(arg)* content *end$$` | Block  | `$$collapse(note)* ... *end$$`    |

Inline 标签可出现在段落、标题、列表项等内联上下文中。
Raw 和 Block 标签是块级的——独立于段落之间。
当它们出现在 blockquote 或列表项内时，匹配范围也只限于当前容器内部。

---

## 自定义语法

插件不硬编码任何定界符。如果你用自定义语法创建 parser，插件会自动跟随：

```ts
import {createEasySyntax, createParser, createSimpleInlineHandlers} from "yume-dsl-rich-text";

const parser = createParser({
    syntax: createEasySyntax({tagPrefix: "%%"}),
    handlers: createSimpleInlineHandlers(["bold"]),
});

const md = new MarkdownIt().use(yumePlugin, {parser, ruleset, env: undefined});

md.render("%%bold(hello)%%");
// → <p><strong>hello</strong></p>
```

完整的语法自定义说明请参阅 [`yume-dsl-rich-text` 文档](https://github.com/chiba233/yumeDSL/?tab=readme-ov-file#custom-syntax)。

---

## 错误处理

- **结构匹配成功但渲染失败**：由 `onRenderFailure` 控制（默认 `"preserve"`）
- **未匹配到结构**：文本原样交给 markdown-it 处理，不产生错误
- **结构扫描阶段 parser 异常**：静默跳过（向 markdown-it 返回 `false`）
- **链接文本等 silent scan 场景中的 inline 命中**：会正确消费输入，不会破坏 markdown-it 解析

插件默认不会抛错。在开发阶段可设置 `onRenderFailure: "throw"` 暴露问题。

---

## 安全性

- `createText` 输出经 `md.utils.escapeHtml` 包装——纯文本节点始终被转义
- `onRenderFailure` 为 `"preserve"` 时，失败片段会经转义后输出
- 除非你的 `ruleset.interpret` 显式返回 HTML，否则插件不会注入用户输入的原始 HTML
- `ruleset.createText` 应返回**未转义的纯文本**；转义由插件负责

---

## 更新日志

参见 [CHANGELOG.zh-CN.md](./CHANGELOG.zh-CN.md)。

## 许可证

[MIT](./LICENSE) &copy; 星野夢華
