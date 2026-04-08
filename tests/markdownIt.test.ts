import assert from "node:assert/strict";
import MarkdownIt from "markdown-it";
import {
  createEasySyntax,
  createParser,
  createSimpleBlockHandlers,
  createSimpleInlineHandlers,
  createSimpleRawHandlers,
} from "yume-dsl-rich-text";
import type { InterpretRuleset } from "yume-dsl-token-walker";
import { yumePlugin } from "../src/index.ts";

// ── Shared fixtures ──

const handlers = {
  ...createSimpleInlineHandlers(["bold", "italic", "unknown", "explode"]),
  ...createSimpleBlockHandlers(["collapse"]),
  ...createSimpleRawHandlers(["code"]),
};

const parser = createParser({ handlers });

const ruleset: InterpretRuleset<string> = {
  createText: (text) => text,
  interpret: (token, helpers) => {
    if (token.type === "bold") {
      return {
        type: "nodes",
        nodes: ["<strong>", ...helpers.interpretChildren(token.value), "</strong>"],
      };
    }
    if (token.type === "italic") {
      return {
        type: "nodes",
        nodes: ["<em>", ...helpers.interpretChildren(token.value), "</em>"],
      };
    }
    if (token.type === "collapse") {
      return {
        type: "nodes",
        nodes: ["<section>", ...helpers.interpretChildren(token.value), "</section>"],
      };
    }
    if (token.type === "code") {
      return {
        type: "nodes",
        nodes: [`<pre>${helpers.flattenText(token.value)}</pre>`],
      };
    }
    return { type: "unhandled" };
  },
  onUnhandled: "flatten",
};

const md = new MarkdownIt().use(yumePlugin, { parser, ruleset, env: undefined });

// ── Cases ──

interface TestCase {
  name: string;
  run: () => void;
}

const cases: TestCase[] = [
  {
    name: "basic tag rendering",
    run: () => {
      const result = md.render("$$bold(hello)$$").trim();
      assert.equal(result, "<p><strong>hello</strong></p>");
    },
  },
  {
    name: "nested tags",
    run: () => {
      const result = md.render("$$bold(a $$italic(b)$$ c)$$").trim();
      assert.equal(result, "<p><strong>a <em>b</em> c</strong></p>");
    },
  },
  {
    name: "mixed markdown and yumeDSL",
    run: () => {
      const result = md.render("hello $$bold(world)$$ bye").trim();
      assert.equal(result, "<p>hello <strong>world</strong> bye</p>");
    },
  },
  {
    name: "multiple tags in one line",
    run: () => {
      const result = md.render("$$bold(a)$$ and $$italic(b)$$").trim();
      assert.equal(result, "<p><strong>a</strong> and <em>b</em></p>");
    },
  },
  {
    name: "plain text passes through unchanged",
    run: () => {
      const result = md.render("just plain text").trim();
      assert.equal(result, "<p>just plain text</p>");
    },
  },
  {
    name: "yumeDSL inside markdown heading",
    run: () => {
      const result = md.render("# $$bold(title)$$").trim();
      assert.equal(result, "<h1><strong>title</strong></h1>");
    },
  },
  {
    name: "unhandled tag falls back to flatten",
    run: () => {
      const result = md.render("$$unknown(content)$$").trim();
      assert.equal(result, "<p>content</p>");
    },
  },
  {
    name: "bare $$ without tag name is plain text",
    run: () => {
      const result = md.render("$$ not a tag").trim();
      assert.equal(result, "<p>$$ not a tag</p>");
    },
  },
  {
    name: "yumeDSL inside list item",
    run: () => {
      const result = md.render("- $$bold(item)$$").trim();
      assert.equal(result, "<ul>\n<li><strong>item</strong></li>\n</ul>");
    },
  },
  {
    name: "env is forwarded to ruleset",
    run: () => {
      const envRuleset: InterpretRuleset<string, { prefix: string }> = {
        createText: (text) => text,
        interpret: (token, helpers) => {
          if (token.type === "bold") {
            return {
              type: "nodes",
              nodes: [
                `<b data-prefix="${helpers.env.prefix}">`,
                ...helpers.interpretChildren(token.value),
                "</b>",
              ],
            };
          }
          return { type: "unhandled" };
        },
        onUnhandled: "flatten",
      };

      const envMd = new MarkdownIt().use(yumePlugin, {
        parser,
        ruleset: envRuleset,
        env: { prefix: "test" },
      });

      const result = envMd.render("$$bold(hi)$$").trim();
      assert.equal(result, '<p><b data-prefix="test">hi</b></p>');
    },
  },
  {
    name: "custom syntax works without hardcoded $$ trigger",
    run: () => {
      const percentParser = createParser({
        syntax: createEasySyntax({ tagPrefix: "@@" }),
        handlers: createSimpleInlineHandlers(["bold"]),
      });

      const percentMd = new MarkdownIt().use(yumePlugin, {
        parser: percentParser,
        ruleset,
        env: undefined,
      });

      const result = percentMd.render("@@bold(hi)@@").trim();
      assert.equal(result, "<p><strong>hi</strong></p>");
    },
  },
  {
    name: "walker text is escaped before writing HTML",
    run: () => {
      const result = md.render("$$bold(<script>alert(1)</script>)$$").trim();
      assert.equal(result, "<p><strong>&lt;script&gt;alert(1)&lt;/script&gt;</strong></p>");
    },
  },
  {
    name: "block form is handled by block ruler",
    run: () => {
      const result = md.render("before\n\n$$collapse(note)*\nhello $$bold(world)$$\n*end$$\n\nafter").trim();
      assert.equal(
        result,
        "<p>before</p>\n<section>hello <strong>world</strong></section>\n<p>after</p>",
      );
    },
  },
  {
    name: "raw form is handled by block ruler",
    run: () => {
      const result = md.render("$$code(js)%\nconst x = 1;\n%end$$").trim();
      assert.equal(result, "<pre>const x = 1;</pre>");
    },
  },
  {
    name: "confirmed render failure preserves escaped source by default",
    run: () => {
      const explodingRuleset: InterpretRuleset<string> = {
        createText: (text) => text,
        interpret: (token) => {
          if (token.type === "explode") {
            throw new Error("boom");
          }
          return { type: "unhandled" };
        },
        onUnhandled: "flatten",
      };

      const explodingMd = new MarkdownIt().use(yumePlugin, {
        parser,
        ruleset: explodingRuleset,
        env: undefined,
      });

      const result = explodingMd.render("$$explode(<b>x</b>)$$").trim();
      assert.equal(result, "<p>$$explode(&lt;b&gt;x&lt;/b&gt;)$$</p>");
    },
  },
  {
    name: "block form inside blockquote excludes container prefix",
    run: () => {
      const result = md.render("> $$collapse(note)*\n> hello $$bold(world)$$\n> *end$$\n\nafter").trim();
      assert.equal(
        result,
        "<blockquote>\n<section>hello <strong>world</strong></section>\n</blockquote>\n<p>after</p>",
      );
    },
  },
  {
    name: "raw form inside blockquote excludes container prefix",
    run: () => {
      const result = md.render("> $$code(js)%\n> const x = 1;\n> %end$$\n\nafter").trim();
      assert.equal(
        result,
        "<blockquote>\n<pre>const x = 1;</pre>\n</blockquote>\n<p>after</p>",
      );
    },
  },
  {
    name: "inline DSL inside link label does not crash (silent pos advance)",
    run: () => {
      const result = md.render("[$$bold(x)$$](https://example.com)").trim();
      assert.equal(result, '<p><a href="https://example.com"><strong>x</strong></a></p>');
    },
  },
  {
    name: "block form does not cross blockquote boundary",
    run: () => {
      const result = md.render("> $$collapse(note)*\n> hello\n\n*end$$").trim();
      assert.equal(
        result,
        "<blockquote>\n<p>$$collapse(note)*\nhello</p>\n</blockquote>\n<p>*end$$</p>",
      );
    },
  },
  {
    name: "matched fragments are interpreted once and reuse cached render output",
    run: () => {
      let parseCalls = 0;
      let structuralCalls = 0;

      const countedParser = {
        parse: (input: string, overrides?: Parameters<typeof parser.parse>[1]) => {
          parseCalls++;
          return parser.parse(input, overrides);
        },
        structural: (input: string, overrides?: Parameters<typeof parser.structural>[1]) => {
          structuralCalls++;
          return parser.structural(input, overrides);
        },
      };

      const countedMd = new MarkdownIt().use(yumePlugin, {
        parser: countedParser,
        ruleset,
        env: undefined,
      });

      const result = countedMd.render("$$bold(hi)$$").trim();
      assert.equal(result, "<p><strong>hi</strong></p>");
      assert.equal(parseCalls, 1);
      assert.equal(structuralCalls, 2);
    },
  },
];

// ── Runner ──

let passed = 0;
let failed = 0;

for (const testCase of cases) {
  try {
    testCase.run();
    console.log(`PASS ${testCase.name}`);
    passed++;
  } catch (error) {
    console.error(`FAIL ${testCase.name}`);
    console.error(error);
    failed++;
  }
}

console.log(`\nPASS ${passed} 个 markdown-it plugin case`);
if (failed > 0) {
  console.error(`FAIL ${failed} 个 case`);
  process.exit(1);
}
