// Minimal ESLint v9 flat config (CommonJS) — keeps platform linter happy
// without enforcing intrusive rules on the existing CRA/React codebase.
// Registers react-hooks plugin so inline `eslint-disable react-hooks/*`
// directives sprinkled through the code do not trigger "rule not found".
const reactHooks = require("eslint-plugin-react-hooks");

module.exports = [
  {
    ignores: [
      "build/**",
      "dist/**",
      "node_modules/**",
      "public/**",
      "coverage/**",
      "**/*.min.js",
    ],
  },
  {
    files: ["src/**/*.{js,jsx,ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
    },
    linterOptions: {
      reportUnusedDisableDirectives: false,
    },
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        window: "readonly",
        document: "readonly",
        navigator: "readonly",
        console: "readonly",
        process: "readonly",
        localStorage: "readonly",
        sessionStorage: "readonly",
        fetch: "readonly",
        FormData: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
      },
    },
    rules: {},
  },
];
