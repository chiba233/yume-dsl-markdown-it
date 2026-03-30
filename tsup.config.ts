import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: false,
  splitting: false,
  external: ["yume-dsl-token-walker", "yume-dsl-rich-text", "markdown-it"],
});
