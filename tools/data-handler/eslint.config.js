// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { NO_SIMPLE_GIT, nodeConfig } from '../../eslint.config.js';

// Layers under src/, top to bottom: api/ (the consumer surface), domain/
// (operations and rules), state/ (the checkout core: I/O plus in-memory
// state), infra/ (plumbing). shared/ (utilities, types, exceptions) sits
// beside them. Imports point down only. `*/**` (not `**`) leaves the folder
// itself unmatched, so an allowlist negation can re-include a file in it.
const API = '**/api/**';
const DOMAIN = '**/domain/*/**';
const STATE = '**/state/**';
const INFRA = '**/infra/**';

const allowed = (allow) => allow.map((path) => `!${path}`);

// One restricted-imports rule: `group` is off limits except the allowlisted
// import paths in `allow`.
function restrict(group, message, allow = []) {
  return {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          { group: [...group, ...allowed(allow)], message },
          NO_SIMPLE_GIT,
        ],
      },
    ],
  };
}

// infra/ is plumbing: it imports nothing above it. No allowlist.
const infraBoundary = restrict(
  [API, DOMAIN, STATE],
  'src/infra/ may not import api/, domain/ or state/ code.',
);

// state/ may not import api/, and imports domain/ only where allowlisted.
function stateBoundary(allow = []) {
  return restrict(
    [API, DOMAIN],
    'src/state/ may not import api/ or domain/ code.',
    allow,
  );
}

// domain/ may not import api/, bar the allowlisted import paths in `allow`.
function domainBoundary(allow = []) {
  return restrict([API], 'src/domain/ may not import api/ code.', allow);
}

// api/ imports a domain only through its door, domain/<x>/index.ts.
const apiBoundary = restrict(
  [DOMAIN, '!**/domain/*/index.js'],
  'src/api/ imports a domain only through domain/<x>/index.ts.',
);

// shared/ and the root-level files: no api/ or domain/ code, and state/ and
// infra/ only as types (utilities take a Checkout parameter).
const sharedBoundary = {
  '@typescript-eslint/no-restricted-imports': [
    'error',
    {
      patterns: [
        {
          group: [API, DOMAIN],
          message:
            'src/shared/ and root-level files may not import api/ or domain/ code.',
        },
        {
          group: [STATE, INFRA],
          allowTypeImports: true,
          message:
            'src/shared/ and root-level files may import state/ and infra/ types only.',
        },
      ],
    },
  ],
};

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
  { files: ['src/infra/**/*.ts'], rules: infraBoundary },
  { files: ['src/state/**/*.ts'], rules: stateBoundary() },
  // Allowlist: the state -> domain edges, each with its ticket.
  // Ticket (to file): inject the report runner into the engine.
  {
    files: ['src/state/engine/calculation-engine.ts'],
    rules: stateBoundary(['**/domain/queries/report.js']),
  },
  // Reason: the checkout reads Validate's process-wide caches and clears them
  // in repopulate() (V-series). The TemplateResource entry is a type import
  // that this rule cannot tell from a value one. Tickets (to file): the
  // Validate redesign; resources-as-data.
  {
    files: ['src/state/checkout/checkout.ts'],
    rules: stateBoundary([
      '**/domain/resources/template-resource.js',
      '**/domain/validation/validate.js',
    ]),
  },
  // Ticket (to file, V-series): the prefix and project-name checks live on
  // Validate; move them out with the validation redesign.
  {
    files: ['src/state/checkout/project-settings.ts'],
    rules: stateBoundary(['**/domain/validation/validate.js']),
  },
  // Reason: the cache constructs the resource classes, which import the
  // checkout back. Ticket (to file): resources-as-data or a resource factory.
  {
    files: ['src/state/resources/resource-cache.ts'],
    rules: stateBoundary(['**/domain/resources/*-resource.js']),
  },
  { files: ['src/domain/**/*.ts'], rules: domainBoundary() },
  // Ticket (to file, V-series): Validate takes the Workspace handle; the
  // validation redesign inverts it.
  {
    files: ['src/domain/validation/validate.ts'],
    rules: domainBoundary(['**/api/workspace.js']),
  },
  { files: ['src/api/**/*.ts'], rules: apiBoundary },
  // index.ts is the package's public surface and re-exports the API.
  {
    files: ['src/shared/**/*.ts', 'src/*.ts'],
    ignores: ['src/index.ts'],
    rules: sharedBoundary,
  },
  { files: ['src/**/*.ts'], rules: NO_RELATIVE_DYNAMIC_IMPORT },
  // The one place simple-git is imported; it imports nothing else.
  {
    files: ['src/infra/git/git-config.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
  // File-wide exemptions, reasons only (tickets to file): resource-object.ts
  // imports Validate lazily to break a cycle (V-series). api/export.ts lazily
  // imports a module it also imports statically, left as-is in a moves-only PR.
  {
    files: ['src/domain/resources/resource-object.ts', 'src/api/export.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },
];
