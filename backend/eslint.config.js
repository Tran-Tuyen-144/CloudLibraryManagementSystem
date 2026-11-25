import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import { defineConfig, globalIgnores } from "eslint/config";
const unused = [
  "error",
  {
    argsIgnorePattern: "^_",
    varsIgnorePattern: "^_",
    caughtErrorsIgnorePattern: "^_",
  },
];
export default defineConfig([
  globalIgnores([
    "dist",
    ".local",
    "output",
    "playwright-report",
    "test-results",
  ]),
  {
    files: ["src/**/*.{js,jsx}"],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: { "no-unused-vars": unused },
  },
  {
    files: [
      "server/**/*.mjs",
      "scripts/**/*.{mjs,cjs}",
      "test/**/*.mjs",
      "*.config.{js,mjs}",
      "infra/**/*.mjs",
    ],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
    rules: { "no-unused-vars": unused },
  },
  { files: ["scripts/**/*.cjs"], rules: { "no-redeclare": "off" } },
  {
    files: ["test/browser/**/*.mjs"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
]);
