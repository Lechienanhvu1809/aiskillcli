import { defineConfig } from "tsdown";

export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: "esm",
    outDir: "dist",
    clean: true,
  },
  {
    entry: ["src/mcp.ts"],
    format: "esm",
    outDir: "dist",
    clean: false,
  },
]);
