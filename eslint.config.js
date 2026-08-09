// ESLint 9 flat config. Two compilation targets, two rule sets:
// src/main (Node/CommonJS-emit) and src/renderer (browser/ESM, React 18, JSX).
// Kept pragmatic on purpose — see the comments on individual rules below for why
// they're off rather than sprinkled with eslint-disable through the code.
const js = require('@eslint/js');
const tseslint = require('typescript-eslint');
const reactHooks = require('eslint-plugin-react-hooks');
const globals = require('globals');

module.exports = tseslint.config(
  {
    // `**/` on each: agent worktrees live under `.claude/worktrees/` and carry
    // their own copy of the tree plus node_modules, so a root-relative pattern
    // would leave thousands of files (and their inline eslint-disable comments,
    // whose rules are not registered for those paths) to be linted.
    ignores: [
      '**/dist/**', '**/release/**', '**/coverage/**', '**/node_modules/**', '.claude/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    // This file itself: plain Node CommonJS, not part of either tsconfig.
    files: ['eslint.config.js'],
    languageOptions: { globals: globals.node, sourceType: 'commonjs' },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },

  {
    // Rules that apply everywhere, main and renderer alike.
    rules: {
      // tsc's noUnusedLocals/noUnusedParameters already catch this for the
      // renderer with full type info. src/main's tsconfig doesn't set those
      // flags, but auditing what the rule finds there is the deliberate
      // destructuring-to-omit idiom (`const { v, ...opts } = idx`) and discarded
      // catch bindings, not real bugs — not worth the false-positive noise of
      // turning it on project-wide for that handful of main-process hits.
      '@typescript-eslint/no-unused-vars': 'off',
      // The IPC boundary (window.electron.invoke / ipcMain.handle payloads) is
      // untyped by design — see CLAUDE.md. Forbidding `any` there would mean
      // hundreds of casts that document nothing.
      '@typescript-eslint/no-explicit-any': 'off',
      // The codebase's standard "best-effort" pattern for localStorage reads,
      // clipboard writes, drag-data parsing, etc. is `try { ... } catch {}` —
      // swallow and fall back, no logging needed for something this non-critical.
      // allowEmptyCatch keeps the rule meaningful for actually-empty blocks
      // elsewhere (if/for/function) while permitting that one deliberate shape.
      'no-empty': ['error', { allowEmptyCatch: true }],
      // Recurring idiom: `cond ? doA() : doB();` / `cond && doB();` as a
      // statement instead of if/else, e.g. the toggle-in-a-Set helpers
      // (`n.has(id) ? n.delete(id) : n.add(id)`). Both options only allow the
      // side-effect shape; a genuinely unused expression (e.g. a stray `x === 5;`)
      // still gets flagged.
      '@typescript-eslint/no-unused-expressions': ['error', { allowShortCircuit: true, allowTernary: true }],
    },
  },

  {
    files: ['src/main/**/*.ts'],
    languageOptions: {
      globals: globals.node,
      sourceType: 'module',
    },
  },

  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // The codebase intentionally omits deps in several effects (mount-once
      // fetches, refs that don't need to retrigger an effect) with a comment
      // explaining why each time. Flag as a hint, don't fail the build over it.
      'react-hooks/exhaustive-deps': 'warn',
    },
  },

  {
    // no-undef duplicates tsc (which already fails the build on a genuinely
    // undefined identifier) but without any of tsc's understanding of TS syntax,
    // ambient declarations (`declare const __dirname`), or global types — it is
    // a known false-positive source with typescript-eslint and the project docs
    // recommend turning it off in favor of the compiler. https://typescript-eslint.io/troubleshooting/faqs/eslint#i-am-using-a-rule-from-eslint-core-and-it-doesnt-work-correctly-with-typescript
    files: ['**/*.{ts,tsx}'],
    rules: {
      'no-undef': 'off',
    },
  }
);
