import { nodeConfig } from '../../eslint.config.js';

// Domain folders: infrastructure (src/infra/), utils (src/utils/) and the
// root-level files may not import them. exceptions/ is shared by all.
const DOMAIN = [
  'workspace',
  'project',
  'directory',
  'cards',
  'mutations',
  'resources',
  'queries',
  'export',
  'clean',
  'versions',
  'modules',
  'settings',
  'macros',
  'commands',
];

// The infra boundary, minus the allowlisted import paths in `allow`.
function infraBoundary(allow = []) {
  return {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: [
              ...DOMAIN.map((folder) => `**/${folder}/**`),
              ...allow.map((path) => `!${path}`),
            ],
            message: 'src/infra/ may not import domain code.',
          },
        ],
      },
    ],
  };
}

// The utils boundary: no domain code, and infra only as types (utilities
// take a Checkout parameter). `allow` lists allowlisted import paths.
function utilsBoundary(allow = []) {
  const allowed = allow.map((path) => `!${path}`);
  return {
    '@typescript-eslint/no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: [...DOMAIN.map((folder) => `**/${folder}/**`), ...allowed],
            message:
              'src/utils/ and root-level files may not import domain code.',
          },
          {
            group: ['**/infra/**', ...allowed],
            allowTypeImports: true,
            message:
              'src/utils/ and root-level files may import infra types only.',
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
    rules: infraBoundary(['**/queries/report.js']),
  },
  // Ticket (to file): resources-as-data or a resource factory; the cache
  // constructs the resource classes, which import the checkout back.
  // Ticket (to file, V-series): Validate's process-wide caches, cleared by
  // the checkout's repopulate().
  {
    files: ['src/infra/checkout.ts'],
    rules: infraBoundary([
      '**/resources/template-resource.js',
      '**/commands/validate.js',
    ]),
  },
  // Ticket (to file, V-series): the prefix and project-name checks live on
  // Validate; move them out with the validation redesign.
  {
    files: ['src/infra/project-settings.ts'],
    rules: infraBoundary(['**/commands/validate.js']),
  },
  {
    files: ['src/infra/resource-cache.ts'],
    rules: infraBoundary(['**/resources/**']),
  },
  // index.ts is the package's public surface and re-exports the domain.
  {
    files: ['src/utils/**/*.ts', 'src/*.ts'],
    ignores: ['src/index.ts'],
    rules: utilsBoundary(),
  },
  // Allowlist: the remaining utils -> domain/infra edges, each with its ticket.
  // Ticket (to file): xref resolution reads cards; move it next to the
  // xref macro or pass the card lookup in.
  {
    files: ['src/utils/asciidoc-xref.ts'],
    rules: utilsBoundary(['**/cards/read.js']),
  },
  // Ticket (to file): prefix rename rewrites cards and resources; it is a
  // domain operation, not a utility (move it out of utils/).
  {
    files: ['src/utils/prefix-rename.ts'],
    rules: utilsBoundary([
      '**/cards/attachments.js',
      '**/cards/update.js',
      '**/infra/resources-from.js',
    ]),
  },
];
