import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import { baseConfig } from '../../eslint.config.js';

// Design-system guard: the token layer in src/theme.ts is the only place that
// may name a colour, and there is exactly one corner radius. Both of these
// drifted badly before the system existed (270 inline sx blocks, seven
// different radii), so they are enforced rather than documented.
const designSystemGuard = {
  files: ['src/components/**/*.tsx', 'src/pages/**/*.tsx'],
  rules: {
    'no-restricted-syntax': [
      'warn',
      {
        selector: 'Literal[value=/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/]',
        message:
          'Raw hex colour. Use a palette token (e.g. "text.secondary") or a --cy-* variable; brand values live in src/theme.ts.',
      },
      {
        selector:
          "Property[key.name='borderRadius'][value.value=/^(?!2px$|0$|50%$|inherit$|sm$|xs$).+/]",
        message:
          'Non-standard corner. The system has one radius: 2px (0 for full-bleed bars and rails, 50% for avatars).',
      },
      {
        // Numeric literals are a separate selector: esquery does not coerce
        // numbers when matching a regex against value.value.
        selector:
          "Property[key.name='borderRadius'] > Literal[raw=/^[1-9][0-9]*$/]",
        message:
          'Non-standard corner. The system has one radius: 2px (0 for full-bleed bars and rails, 50% for avatars).',
      },
    ],
  },
};

export default tseslint.config(
  ...baseConfig,
  designSystemGuard,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
  {
    files: ['e2e/**/*.ts', 'scripts/**/*.js', 'playwright.config.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      'react-hooks/rules-of-hooks': 'off',
      'react-hooks/exhaustive-deps': 'off',
      'react-refresh/only-export-components': 'off',
      'no-empty-pattern': 'off',
    },
  },
);
