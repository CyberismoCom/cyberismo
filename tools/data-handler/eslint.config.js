import { nodeConfig } from '../../eslint.config.js';

// Layers under src/: api/ (handles and façades) and domain/ sit above infra/
// and shared/. infra/, shared/ and the root-level files may not import api/
// or domain/. `*/**` (not `**`) leaves the folder under api/ or domain/
// unmatched, so an allowlist negation can re-include a file in it.
const UPPER = ['**/api/*/**', '**/domain/*/**'];

// The infra boundary, minus the allowlisted import paths in `allow`.
function infraBoundary(allow = []) {
  return {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: [...UPPER, ...allow.map((path) => `!${path}`)],
            message: 'src/infra/ may not import api/ or domain/ code.',
          },
        ],
      },
    ],
  };
}

// The shared boundary: no api/ or domain/ code, and infra only as types
// (utilities take a Checkout parameter). `allow` lists allowlisted import
// paths.
function sharedBoundary(allow = []) {
  const allowed = allow.map((path) => `!${path}`);
  return {
    '@typescript-eslint/no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: [...UPPER, ...allowed],
            message:
              'src/shared/ and root-level files may not import api/ or domain/ code.',
          },
          {
            group: ['**/infra/**', ...allowed],
            allowTypeImports: true,
            message:
              'src/shared/ and root-level files may import infra types only.',
          },
        ],
      },
    ],
  };
}

export default [
  ...nodeConfig,
  {
    ignores: ['vitest.config.ts'],
  },
  {
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  { files: ['src/infra/**/*.ts'], rules: infraBoundary() },
  // Allowlist: the remaining infra -> domain edges, each with its ticket.
  // Ticket (to file): inject the report runner into the engine.
  {
    files: ['src/infra/calculation-engine.ts'],
    rules: infraBoundary(['**/domain/queries/report.js']),
  },
  // Ticket (to file): resources-as-data or a resource factory; the cache
  // constructs the resource classes, which import the checkout back.
  // Ticket (to file, V-series): Validate's process-wide caches, cleared by
  // the checkout's repopulate().
  {
    files: ['src/infra/checkout.ts'],
    rules: infraBoundary([
      '**/domain/resources/template-resource.js',
      '**/domain/commands/validate.js',
    ]),
  },
  // Ticket (to file, V-series): the prefix and project-name checks live on
  // Validate; move them out with the validation redesign.
  {
    files: ['src/infra/project-settings.ts'],
    rules: infraBoundary(['**/domain/commands/validate.js']),
  },
  {
    files: ['src/infra/resource-cache.ts'],
    rules: infraBoundary(['**/domain/resources/**']),
  },
  // index.ts is the package's public surface and re-exports the domain.
  {
    files: ['src/shared/**/*.ts', 'src/*.ts'],
    ignores: ['src/index.ts'],
    rules: sharedBoundary(),
  },
  // Allowlist: the remaining shared -> domain/infra edges, each with its
  // ticket.
  // Ticket (to file): xref resolution reads cards; move it next to the
  // xref macro or pass the card lookup in.
  {
    files: ['src/shared/utils/asciidoc-xref.ts'],
    rules: sharedBoundary(['**/domain/cards/read.js']),
  },
  // Ticket (to file): prefix rename rewrites cards and resources; it is a
  // domain operation, not a utility (move it out of utils/).
  {
    files: ['src/shared/utils/prefix-rename.ts'],
    rules: sharedBoundary([
      '**/domain/cards/attachments.js',
      '**/domain/cards/update.js',
      '**/infra/resources-from.js',
    ]),
  },
];
