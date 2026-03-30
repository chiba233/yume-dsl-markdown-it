import type MarkdownIt from "markdown-it";
import {
  collectNodes,
  interpretTokens,
  type InterpretRuleset,
} from "yume-dsl-token-walker";
import type { Parser } from "yume-dsl-rich-text";

export type { InterpretRuleset } from "yume-dsl-token-walker";
export type { Parser } from "yume-dsl-rich-text";

interface MatchResult {
  form: "inline" | "raw" | "block";
  source: string;
  endOffset: number;
}

interface RenderedMeta {
  html: string;
}

interface CachedAttempt {
  match: MatchResult | null;
  html?: string;
}

export interface RenderFailureContext<TEnv> {
  error: Error;
  source: string;
  env: TEnv;
  form: "inline" | "raw" | "block";
}

// ── Options ──

export interface YumePluginOptions<TEnv = undefined> {
  /** yume-dsl-rich-text parser instance */
  parser: Parser;
  /**
   * token-walker ruleset whose string nodes represent HTML fragments.
   * `createText` should return unescaped plain text; this plugin escapes it at the markdown-it boundary.
   */
  ruleset: InterpretRuleset<string, TEnv>;
  /** environment value forwarded to every interpret call */
  env: TEnv;
  /** optional fast-path gate before delegating to the parser */
  shouldAttempt?: (src: string, pos: number) => boolean;
  /** render contract for parse / interpret failures after a DSL match is confirmed */
  onRenderFailure?: "preserve" | "throw" | ((context: RenderFailureContext<TEnv>) => string);
}

const isRenderableForm = (type: string): type is MatchResult["form"] =>
  type === "inline" || type === "raw" || type === "block";

const countConsumedLines = (source: string): number => {
  let breaks = 0;
  for (const char of source) {
    if (char === "\n") breaks++;
  }
  return breaks + (source.endsWith("\n") ? 0 : 1);
};

const toError = (caught: unknown): Error =>
  caught instanceof Error ? caught : new Error(String(caught));

const attemptCache = new WeakMap<object, Map<number, CachedAttempt>>();

const getCachedAttempt = <TState extends object>(
  state: TState,
  start: number,
): CachedAttempt | undefined => attemptCache.get(state)?.get(start);

const setCachedAttempt = <TState extends object>(
  state: TState,
  start: number,
  attempt: CachedAttempt,
): CachedAttempt => {
  let byStart = attemptCache.get(state);
  if (!byStart) {
    byStart = new Map<number, CachedAttempt>();
    attemptCache.set(state, byStart);
  }
  byStart.set(start, attempt);
  return attempt;
};

const findLeadingMatch = (parser: Parser, input: string): MatchResult | null => {
  const nodes = parser.structural(input, { trackPositions: true });
  const first = nodes[0];

  if (!first || !isRenderableForm(first.type) || !first.position) return null;
  if (first.position.start.offset !== 0 || first.position.end.offset <= 0) return null;

  return {
    form: first.type,
    endOffset: first.position.end.offset,
    source: input.slice(0, first.position.end.offset),
  };
};

const buildFailureHtml = <TEnv>(
  md: MarkdownIt,
  source: string,
  form: MatchResult["form"],
  env: TEnv,
  failure: YumePluginOptions<TEnv>["onRenderFailure"],
  caught: unknown,
): string => {
  const error = toError(caught);

  if (typeof failure === "function") {
    return failure({ error, source, env, form });
  }
  if (failure === "throw") {
    throw error;
  }
  return md.utils.escapeHtml(source);
};

const renderMatch = <TEnv>(
  md: MarkdownIt,
  parser: Parser,
  ruleset: InterpretRuleset<string, TEnv>,
  env: TEnv,
  match: MatchResult,
  failure: YumePluginOptions<TEnv>["onRenderFailure"],
): string => {
  const safeRuleset: InterpretRuleset<string, TEnv> = {
    ...ruleset,
    // In markdown-it, walker text should become escaped HTML text by default.
    createText: (text) => md.utils.escapeHtml(ruleset.createText(text)),
  };

  try {
    const tokens = parser.parse(match.source, { trackPositions: true });
    return collectNodes(interpretTokens(tokens, safeRuleset, env)).join("");
  } catch (caught) {
    return buildFailureHtml(md, match.source, match.form, env, failure, caught);
  }
};

const createMeta = (html: string): RenderedMeta => ({ html });

// ── Plugin ──

export function yumePlugin<TEnv = undefined>(
  md: MarkdownIt,
  options: YumePluginOptions<TEnv>,
): void {
  const { parser, ruleset, env, shouldAttempt, onRenderFailure = "preserve" } = options;

  md.block.ruler.before("paragraph", "yume_block", (state, startLine, endLine, silent) => {
    if (state.sCount[startLine] - state.blkIndent >= 4) return false;

    const start = state.bMarks[startLine] + state.tShift[startLine];
    const src = state.src;

    if (shouldAttempt && !shouldAttempt(src, start)) return false;

    let attempt = getCachedAttempt(state, start);
    if (!attempt) {
      // Build normalized content bounded by the current container so that
      // container prefixes (e.g. ">") are excluded and endLine is respected.
      let content = src.slice(start, state.eMarks[startLine]);
      for (let line = startLine + 1; line < endLine; line++) {
        content += "\n" + src.slice(state.bMarks[line], state.eMarks[line]);
      }
      content += "\n";

      try {
        attempt = setCachedAttempt(state, start, {
          match: findLeadingMatch(parser, content),
        });
      } catch {
        return false;
      }
    }

    const { match } = attempt;
    if (!match || (match.form !== "raw" && match.form !== "block")) return false;
    if (silent) return true;

    const token = state.push("yume_block", "", 0);
    token.block = true;
    token.content = match.source;
    token.map = [startLine, startLine + countConsumedLines(match.source)];
    attempt.html ??= renderMatch(md, parser, ruleset, env, match, onRenderFailure);
    token.meta = createMeta(attempt.html);

    state.line = token.map[1];
    return true;
  });

  md.inline.ruler.push("yume_inline", (state, silent) => {
    const start = state.pos;
    const src = state.src;

    if (shouldAttempt && !shouldAttempt(src, start)) return false;

    let attempt = getCachedAttempt(state, start);
    if (!attempt) {
      try {
        attempt = setCachedAttempt(state, start, {
          match: findLeadingMatch(parser, src.slice(start, state.posMax)),
        });
      } catch {
        return false;
      }
    }

    const { match } = attempt;
    if (!match || match.form !== "inline") return false;
    if (silent) return true;

    const token = state.push("yume_inline", "", 0);
    token.content = match.source;
    attempt.html ??= renderMatch(md, parser, ruleset, env, match, onRenderFailure);
    token.meta = createMeta(attempt.html);
    state.pos = start + match.endOffset;
    return true;
  });

  md.renderer.rules.yume_inline = (tokens, idx) => {
    const meta = tokens[idx].meta as RenderedMeta | null | undefined;
    return meta?.html ?? md.utils.escapeHtml(tokens[idx].content);
  };

  md.renderer.rules.yume_block = (tokens, idx) => {
    const meta = tokens[idx].meta as RenderedMeta | null | undefined;
    return (meta?.html ?? md.utils.escapeHtml(tokens[idx].content)) + "\n";
  };
}
