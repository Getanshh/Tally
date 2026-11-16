// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

/**
 * SAFETY RULE 1 (see CLAUDE.md): the MCP server must have NO code path that writes to Tally.
 * It may never import the voucher-posting package or the raw write-capable transport.
 * A test in Phase 2 enforces the same thing independently of lint.
 */
const MCP_SERVER_FORBIDDEN_IMPORTS = [
  {
    group: ["@tally-bridge/poster", "@tally-bridge/poster/*", "**/packages/poster/**"],
    message: "SAFETY RULE 1: apps/mcp-server must never import the poster package (it writes to Tally).",
  },
  {
    group: ["@tally-bridge/tally-client/transport", "**/tally-client/src/transport*"],
    message:
      "SAFETY RULE 1: apps/mcp-server must use TallyReadClient only, never the raw transport (it can send imports).",
  },
];

export default tseslint.config(
  {
    ignores: ["**/node_modules/**", "**/dist/**", "**/out/**", "coverage/**", "apps/mock-tally/fixtures/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": "error",
      "no-console": "off",
      eqeqeq: ["error", "always"],
    },
  },
  {
    files: ["apps/mcp-server/**/*.ts", "apps/mcp-server/**/*.tsx"],
    rules: {
      "no-restricted-imports": ["error", { patterns: MCP_SERVER_FORBIDDEN_IMPORTS }],
    },
  },
);
