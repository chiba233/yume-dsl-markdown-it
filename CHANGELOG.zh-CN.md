[English](./CHANGELOG.md) | **中文**

# 更新日志

### 0.1.1

- 首次发布 — yume-dsl-rich-text 的 markdown-it 插件
- Inline rule：将 tag 语法交给 `parser.structural()` 判断，渲染交给 `interpretTokens`
- Block rule：处理 raw（`$$tag(arg)%...%end$$`）和 block（`$$tag(arg)*...*end$$`）形式
- `createText` 输出自动经 `md.utils.escapeHtml` 转义
- `onRenderFailure` 选项：`"preserve"`（默认）、`"throw"` 或自定义函数
- `shouldAttempt` 快速门控，跳过非 DSL 位置
- 基于 WeakMap 的每 render 缓存——每个位置最多解析一次
- 不硬编码语法——兼容任何 `createEasySyntax` 配置
- 导出：`yumePlugin`、`YumePluginOptions`、`RenderFailureContext`，重导出 `InterpretRuleset` 和 `Parser`
