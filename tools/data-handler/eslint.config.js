import { nodeConfig } from '../../eslint.config.js';

// Layers under src/: api/ (the handle and the directory) sits above domain/,
// which sits above infra/ and shared/. infra/, shared/ and the root-level
// files may not import api/ or domain/. `*/**` (not `**`) leaves the folder
// under api/ or domain/ unmatched, so an allowlist negation can re-include a
// file in it.
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
            group: ['**/infra/*/**', '**/infra/*.js', ...allowed],
            allowTypeImports: true,
            message:
              'src/shared/ and root-level files may import infra types only.',
          },
        ],
      },
    ],
  };
}

// api/ imports a domain only through its door, domain/<x>/index.ts. `allow`
// lists allowlisted import paths.
function apiBoundary(allow = []) {
  return {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: [
              '**/domain/*/**',
              '!**/domain/*/index.js',
              ...allow.map((path) => `!${path}`),
            ],
            message:
              'src/api/ imports a domain only through domain/<x>/index.ts.',
          },
        ],
      },
    ],
  };
}

// domain/ may not import api/, bar the allowlisted import paths in `allow`.
function domainBoundary(allow = []) {
  return {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['**/api/*/**', ...allow.map((path) => `!${path}`)],
            message: 'src/domain/ may not import api/ code.',
          },
        ],
      },
    ],
  };
}

// A relative import() hides a dependency cycle from the layer rules; use a
// static import.
const NO_RELATIVE_DYNAMIC_IMPORT = {
  'no-restricted-syntax': [
    'error',
    {
      selector: 'ImportExpression[source.value=/^\\./]',
      message: 'Use a static import; a relative import() hides a cycle.',
    },
  ],
};

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
    files: ['src/infra/engine/calculation-engine.ts'],
    rules: infraBoundary(['**/domain/queries/report.js']),
  },
  // Ticket (to file): resources-as-data or a resource factory; the cache
  // constructs the resource classes, which import the checkout back.
  // Ticket (to file, V-series): Validate's process-wide caches, cleared by
  // the checkout's repopulate().
  {
    files: ['src/infra/checkout/checkout.ts'],
    rules: infraBoundary([
      '**/domain/resources/template-resource.js',
      '**/domain/validation/validate.js',
    ]),
  },
  // Ticket (to file, V-series): the prefix and project-name checks live on
  // Validate; move them out with the validation redesign.
  {
    files: ['src/infra/checkout/project-settings.ts'],
    rules: infraBoundary(['**/domain/validation/validate.js']),
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
  { files: ['src/api/**/*.ts'], rules: apiBoundary() },
  { files: ['src/domain/**/*.ts'], rules: domainBoundary() },
  // Ticket (to file, V-series): Validate takes the Workspace handle; the
  // validation redesign inverts it.
  {
    files: ['src/domain/validation/validate.ts'],
    rules: domainBoundary(['**/api/workspace/workspace.js']),
  },
  { files: ['src/**/*.ts'], rules: NO_RELATIVE_DYNAMIC_IMPORT },
  // Ticket (to file, V-series): these two break a cycle with Validate and
  // the macros; they go with the validation and macro rework.
  {
    files: [
      'src/domain/resources/resource-object.ts',
      'src/domain/export/export.ts',
    ],
    rules: { 'no-restricted-syntax': 'off' },
  },
];
