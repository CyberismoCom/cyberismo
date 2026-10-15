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

import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { mkdtemp, realpath } from 'node:fs/promises';
import type * as fsPromises from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { simpleGit } from 'simple-git';

import { Checkout } from '../../src/state/checkout/checkout.js';
import { Validate } from '../../src/domain/validation/validate.js';
import {
  buildProject,
  type BuiltProject,
  type ProjectSpec,
} from './project-builder.js';
import { allTemplateCards, findCard } from '../../src/domain/cards/read.js';

// Wrapped so a test can see which directory the builder created.
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof fsPromises>();
  return { ...actual, mkdtemp: vi.fn(actual.mkdtemp) };
});

const minimalConfig = join(
  import.meta.dirname,
  '../test-data/valid/minimal/.cards/local/cardsConfig.json',
);

const built: BuiltProject[] = [];
async function build(spec: ProjectSpec = {}) {
  const project = await buildProject(spec);
  built.push(project);
  return project;
}

// Every file under `dir` (except .git) mapped to its contents.
function snapshot(dir: string): Record<string, string> {
  const files: Record<string, string> = {};
  for (const entry of readdirSync(dir, {
    recursive: true,
    withFileTypes: true,
  })) {
    const path = join(entry.parentPath, entry.name);
    const name = relative(dir, path);
    if (entry.isFile() && name.split(sep)[0] !== '.git') {
      files[name] = readFileSync(path, 'utf-8');
    }
  }
  return files;
}

function readJson(path: string) {
  return JSON.parse(readFileSync(path, 'utf-8'));
}

async function validate(path: string): Promise<string> {
  return Validate.getInstance().validate(path, () => new Checkout(path));
}

async function withProject(
  path: string,
  check: (checkout: Checkout) => void,
): Promise<void> {
  const checkout = new Checkout(path);
  await checkout.populateCaches();
  check(checkout);
}

afterEach(async () => {
  await Promise.all(built.splice(0).map((project) => project.cleanup()));
});

describe('buildProject', () => {
  it('builds a valid default project at the current schema version under os.tmpdir()', async () => {
    const { path, keys } = await build();

    expect(path.startsWith(tmpdir())).toBe(true);
    expect(keys).toEqual([]);
    const config = readJson(join(path, '.cards/local/cardsConfig.json'));
    expect(config.cardKeyPrefix).toBe('test');
    expect(config.schemaVersion).toBe(readJson(minimalConfig).schemaVersion);
    expect(existsSync(join(path, '.git'))).toBe(false);
    expect(await validate(path)).toBe('');
  });

  it('writes workflows and card types, and cards take their initial state', async () => {
    const { path, keys } = await build({
      prefix: 'flow',
      name: 'Flow project',
      workflows: [
        {
          name: 'review',
          states: [
            { name: 'Draft', category: 'initial' },
            { name: 'Approved', category: 'closed' },
          ],
          // Create lands past states[0], so the initial state is its target.
          transitions: [{ name: 'Create', fromState: [], toState: 'Approved' }],
        },
      ],
      cardTypes: [{ name: 'decision', workflow: 'review' }],
      cards: [{}, { workflowState: 'Draft' }],
    });

    expect(await validate(path)).toBe('');
    expect(readJson(join(path, '.cards/local/cardsConfig.json')).name).toBe(
      'Flow project',
    );
    await withProject(path, (checkout) => {
      expect(
        checkout.resources.byType('flow/cardTypes/decision', 'cardTypes').show()
          .workflow,
      ).toBe('flow/workflows/review');
      expect(
        keys.map((key) => findCard(checkout, key).metadata?.workflowState),
      ).toEqual(['Approved', 'Draft']);
    });
  });

  it('writes nested cards with keys from the project prefix', async () => {
    const { path, keys } = await build({
      prefix: 'nest',
      cards: [
        {
          title: 'Parent',
          labels: ['a'],
          content: 'Hello',
          children: [{}, {}],
        },
        { title: 'Sibling' },
      ],
    });

    expect(keys).toHaveLength(4);
    for (const key of keys) expect(key).toMatch(/^nest_[0-9a-z]{8}$/);
    expect(await validate(path)).toBe('');
    const [parent, child1, child2, sibling] = keys;
    await withProject(path, (checkout) => {
      const card = findCard(checkout, parent);
      expect(card.metadata?.title).toBe('Parent');
      expect(card.metadata?.labels).toEqual(['a']);
      expect(card.content).toBe('Hello');
      expect(card.children).toEqual([child1, child2]);
      expect(findCard(checkout, sibling).parent).toBe('root');
    });
  });

  it('writes field types and custom fields, and cards carry field values', async () => {
    const { path, keys } = await build({
      fieldTypes: [{ name: 'size', dataType: 'integer' }],
      cardTypes: [{ name: 'page', customFields: [{ name: 'size' }] }],
      cards: [{ fields: { 'test/fieldTypes/size': 3 } }],
    });

    expect(await validate(path)).toBe('');
    await withProject(path, (checkout) => {
      expect(
        findCard(checkout, keys[0]).metadata?.['test/fieldTypes/size'],
      ).toBe(3);
    });
  });

  it('declares hubs in the project configuration', async () => {
    const hubs = [{ location: 'https://hub.example.com/', displayName: 'Hub' }];
    const { path } = await build({ hubs });

    expect(
      JSON.parse(
        readFileSync(join(path, '.cards/local/cardsConfig.json'), 'utf-8'),
      ).hubs,
    ).toEqual(hubs);
  });

  it('writes the values of an enum field type', async () => {
    const { path, keys } = await build({
      fieldTypes: [
        { name: 'level', dataType: 'enum', enumValues: ['low', 'high'] },
      ],
      cardTypes: [{ name: 'page', customFields: [{ name: 'level' }] }],
      cards: [{ fields: { 'test/fieldTypes/level': 'high' } }],
    });

    expect(await validate(path)).toBe('');
    await withProject(path, (checkout) => {
      expect(
        checkout.resources.byType('test/fieldTypes/level', 'fieldTypes').data
          ?.enumValues,
      ).toEqual([{ enumValue: 'low' }, { enumValue: 'high' }]);
      expect(
        findCard(checkout, keys[0]).metadata?.['test/fieldTypes/level'],
      ).toBe('high');
    });
  });

  it('writes link types and the links between cards', async () => {
    const { path, keys } = await build({
      linkTypes: [{ name: 'rel', enableLinkDescription: true }],
      cards: [
        { links: [{ linkType: 'rel', to: 1, linkDescription: 'd' }] },
        {},
      ],
    });

    expect(await validate(path)).toBe('');
    await withProject(path, (checkout) => {
      expect(findCard(checkout, keys[0]).metadata?.links).toEqual([
        {
          linkType: 'test/linkTypes/rel',
          cardKey: keys[1],
          linkDescription: 'd',
        },
      ]);
    });
  });

  it('writes templates with their cards', async () => {
    const { path, keys, templateKeys } = await build({
      templates: [{ name: 'tpl', cards: [{ children: [{}] }] }],
    });

    expect(keys).toEqual([]);
    expect(templateKeys['test/templates/tpl']).toHaveLength(2);

    expect(await validate(path)).toBe('');
    await withProject(path, (checkout) => {
      expect(
        allTemplateCards(checkout)
          .map((card) => card.key)
          .sort(),
      ).toEqual([...templateKeys['test/templates/tpl']].sort());
      expect(existsSync(join(path, '.cards/local/templates/tpl.json'))).toBe(
        true,
      );
    });
  });

  it('installs modules whose resources the project can use', async () => {
    const { path, keys, templateKeys } = await build({
      modules: [
        {
          prefix: 'mod',
          workflows: [{ name: 'flow' }],
          cardTypes: [{ name: 'item' }],
          templates: [{ name: 'modtpl', cards: [{}] }],
        },
      ],
      cards: [{ cardType: 'mod/cardTypes/item' }],
    });

    expect(await validate(path)).toBe('');
    const config = readJson(join(path, '.cards/local/cardsConfig.json'));
    expect(config.modules).toEqual([{ name: 'mod', location: 'file:../mod' }]);
    const [projectCard] = keys;
    const [moduleCard] = templateKeys['mod/templates/modtpl'];
    expect(projectCard).toMatch(/^test_/);
    expect(moduleCard).toMatch(/^mod_/);
    await withProject(path, (checkout) => {
      expect(checkout.allModulePrefixes()).toEqual(['test', 'mod']);
      expect(findCard(checkout, projectCard).metadata?.workflowState).toBe(
        'Open',
      );
      expect(allTemplateCards(checkout).map((card) => card.key)).toEqual([
        moduleCard,
      ]);
    });
  });

  it('appends calculations that validation evaluates', async () => {
    const valid = await build({
      calculations: { denials: 'denied(a).\nhook(b).\n' },
    });
    expect(
      readFileSync(
        join(valid.path, '.cards/local/calculations/denials/calculation.lp'),
        'utf-8',
      ),
    ).toBe('denied(a).\nhook(b).\n');
    expect(await validate(valid.path)).toBe('');

    // A broken program is reported, so the calculation is really picked up.
    const broken = await build({ calculations: { broken: 'denied(a' } });
    expect(await validate(broken.path)).toContain('test/calculations/broken');
  });

  it('initialises its own git repository with one clean commit', async () => {
    const { path } = await build({ git: true, cards: [{}] });

    const git = simpleGit(path);
    expect(
      await realpath((await git.revparse(['--show-toplevel'])).trim()),
    ).toBe(await realpath(path));
    expect((await git.log()).total).toBe(1);
    expect((await git.status()).isClean()).toBe(true);
    expect(await validate(path)).toBe('');
  });

  it('gives the same keys and bytes for the same spec and seed', async () => {
    const spec: ProjectSpec = {
      seed: 42,
      git: true,
      cards: [{ children: [{}] }, {}],
      templates: [{ name: 'tpl', cards: [{}] }],
    };
    const first = await build(spec);
    const second = await build(spec);
    const other = await build({ ...spec, seed: 43 });

    expect(second.keys).toEqual(first.keys);
    expect(second.templateKeys).toEqual(first.templateKeys);
    expect(snapshot(second.path)).toEqual(snapshot(first.path));
    expect(other.keys).not.toEqual(first.keys);
  });

  it.each<[string, ProjectSpec, string]>([
    [
      'a module card type without a workflow',
      { modules: [{ prefix: 'mod', cardTypes: [{ name: 'x' }] }] },
      'module mod: card type x needs a workflow',
    ],
    [
      'a card of an undefined card type',
      { cards: [{ cardType: 'nope' }] },
      'card type test/cardTypes/nope is not defined yet',
    ],
    [
      'a module template card without a card type',
      {
        modules: [{ prefix: 'mod', templates: [{ name: 't', cards: [{}] }] }],
      },
      'module mod: card',
    ],
    [
      'a card whose workflow is undefined',
      { cardTypes: [{ name: 'x', workflow: 'ghost' }], cards: [{}] },
      'workflow test/workflows/ghost is not defined yet',
    ],
  ])('rejects %s and removes the directory', async (_name, spec, message) => {
    const created = vi.mocked(mkdtemp).mock.results.length;
    await expect(buildProject(spec)).rejects.toThrow(message);
    const path = await vi.mocked(mkdtemp).mock.results[created].value;
    expect(existsSync(path)).toBe(false);
  });

  it('cleanup removes the project', async () => {
    const { path, cleanup } = await buildProject();
    await cleanup();
    expect(existsSync(path)).toBe(false);
  });
});
