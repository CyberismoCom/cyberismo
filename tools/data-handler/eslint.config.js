import { nodeConfig } from '../../eslint.config.js';

// Domain folders: infrastructure (src/infra/) may not import them.
// exceptions/ is shared by both.
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
  'permissions',
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
  {
    files: ['src/infra/resource-cache.ts'],
    rules: infraBoundary(['**/resources/**']),
  },
];
