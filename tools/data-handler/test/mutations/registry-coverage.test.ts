/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026

  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';

// Importing the registry (and, transitively, the dispatcher) runs the
// duplicate-route guard in dispatcher.ts at module load. If two ROUTES rows
// resolved to the same key string, this import would throw.
import { ROUTES } from '../../src/mutations/registry.js';
import '../../src/mutations/dispatcher.js';

// Resource types whose schema-backed editable keys must each be routable.
// Maps the routing `type` (plural, as used in resource names) to the schema
// file base name (singular) under tools/assets/src/schema/resources/.
const RESOURCE_SCHEMAS: Record<string, string> = {
  cardTypes: 'cardTypeSchema.json',
  fieldTypes: 'fieldTypeSchema.json',
  workflows: 'workflowSchema.json',
  linkTypes: 'linkTypeSchema.json',
  templates: 'templateSchema.json',
  calculations: 'calculationSchema.json',
  reports: 'reportSchema.json',
  graphModels: 'graphModelSchema.json',
  graphViews: 'graphViewSchema.json',
  skills: 'skillSchema.json',
};

// Edit keys that are intentionally NOT schema `properties`. `content` is a
// composite key folder resources (calculations, reports, graphModels,
// graphViews) use to edit their on-disk content files (via updateKey.subKey);
// it never appears in the resource's JSON schema. Routed to the plain handler,
// exactly as the former catch-all edit handler did.
const NON_SCHEMA_EDIT_KEYS = new Set(['content']);

const require = createRequire(import.meta.url);
const schemaDir = join(
  dirname(require.resolve('@cyberismo/assets/package.json')),
  'src',
  'schema',
  'resources',
);

function schemaPropertyKeys(schemaFile: string): string[] {
  const schema = JSON.parse(
    readFileSync(join(schemaDir, schemaFile), 'utf-8'),
  ) as { properties?: Record<string, unknown> };
  return Object.keys(schema.properties ?? {}).filter((k) => k !== 'name');
}

// Editable keys reachable through the ROUTES table, grouped by resource type.
// A key is reachable when it has any edit row (specific or wildcard).
function routableEditKeys(): Map<string, Set<string>> {
  const byType = new Map<string, Set<string>>();
  for (const { route } of ROUTES) {
    if (route.kind !== 'edit' || !route.type || !route.key) continue;
    if (!byType.has(route.type)) byType.set(route.type, new Set());
    byType.get(route.type)!.add(route.key);
  }
  return byType;
}

describe('mutation route registry coverage', () => {
  it('builds the dispatch MAP without duplicate routes', () => {
    // Reaching this line means the import above did not throw.
    expect(ROUTES.length).toBeGreaterThan(0);
  });

  it('routes every schema-backed editable key for every resource type', () => {
    const routable = routableEditKeys();
    const uncovered: string[] = [];

    for (const [type, schemaFile] of Object.entries(RESOURCE_SCHEMAS)) {
      const keys = schemaPropertyKeys(schemaFile);
      const reachable = routable.get(type) ?? new Set<string>();
      for (const key of keys) {
        if (!reachable.has(key)) uncovered.push(`${type}/${key}`);
      }
    }

    expect(
      uncovered,
      `Schema keys with no ROUTES edit row (specific or wildcard):\n  ${uncovered.join('\n  ')}`,
    ).toEqual([]);
  });

  it('has no phantom edit rows pointing at non-existent schema keys', () => {
    const schemaKeysByType = new Map<string, Set<string>>();
    for (const [type, schemaFile] of Object.entries(RESOURCE_SCHEMAS)) {
      schemaKeysByType.set(type, new Set(schemaPropertyKeys(schemaFile)));
    }

    const phantom: string[] = [];
    for (const { route } of ROUTES) {
      if (route.kind !== 'edit' || !route.type || !route.key) continue;
      const schemaKeys = schemaKeysByType.get(route.type);
      // Types not under coverage (none today) are ignored here, not flagged.
      if (!schemaKeys) continue;
      if (NON_SCHEMA_EDIT_KEYS.has(route.key)) continue;
      if (!schemaKeys.has(route.key)) {
        phantom.push(`${route.type}/${route.key}`);
      }
    }

    expect(
      phantom,
      `ROUTES edit rows referencing keys absent from the schema:\n  ${phantom.join('\n  ')}`,
    ).toEqual([]);
  });
});
