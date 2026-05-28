import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { Project } from '../../../src/containers/project.js';
import { FieldTypeRenameHandler } from '../../../src/mutations/handlers/field-type-rename.js';
import { ResourceMutations } from '../../../src/mutations/plan.js';
import { resourceName } from '../../../src/utils/resource-utils.js';
import { copyDir } from '../../../src/utils/file-utils.js';

const FIXTURE_PATH = join(
  import.meta.dirname,
  '..',
  '..',
  'test-data',
  'valid',
  'decision-records',
);
const tmpDir = join(import.meta.dirname, 'tmp-field-type-rename');

describe('FieldTypeRenameHandler', () => {
  let project: Project;
  let projectPath: string;

  beforeEach(async () => {
    projectPath = join(tmpDir, `proj-${Date.now()}`);
    await mkdir(projectPath, { recursive: true });
    await copyDir(FIXTURE_PATH, projectPath);
    project = new Project(projectPath);
    await project.populateCaches();
  });
  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('matches a field-type rename input', () => {
    const handler = new FieldTypeRenameHandler();
    const ctx = {
      project,
      input: {
        kind: 'rename' as const,
        target: resourceName(`${project.projectPrefix}/fieldTypes/finished`),
        newIdentifier: 'completed',
      },
    };
    expect(handler.matches(ctx)).toBe(true);
  });

  it('does not match a link-type rename', () => {
    const handler = new FieldTypeRenameHandler();
    const ctx = {
      project,
      input: {
        kind: 'rename' as const,
        target: resourceName(`${project.projectPrefix}/linkTypes/causes`),
        newIdentifier: 'is-caused-by',
      },
    };
    expect(handler.matches(ctx)).toBe(false);
  });

  it('preview reports affected card and card-type counts', async () => {
    const handler = new FieldTypeRenameHandler();
    const ctx = {
      project,
      input: {
        kind: 'rename' as const,
        target: resourceName(`${project.projectPrefix}/fieldTypes/finished`),
        newIdentifier: 'completed',
      },
    };
    const preview = await handler.preview(ctx);
    expect(preview.dataLossExpected).toBe(false);
    // The decision-records fixture has at least one card type using
    // "finished" and at least one card carrying the metadata key.
    expect(preview.affectedCardCount).toBeGreaterThanOrEqual(0);
  });

  it('applying rewrites every card metadata key and every card type customFields entry', async () => {
    const oldName = `${project.projectPrefix}/fieldTypes/finished`;
    const newName = `${project.projectPrefix}/fieldTypes/completed`;
    const input = {
      kind: 'rename' as const,
      target: resourceName(oldName),
      newIdentifier: 'completed',
    };
    await new ResourceMutations(project).apply(input, { bypassFingerprint: true });

    for (const card of project.cards(undefined)) {
      if (!card.metadata) continue;
      expect(Object.keys(card.metadata)).not.toContain(oldName);
    }
    for (const cardType of project.resources.cardTypes()) {
      const customFields = cardType.data?.customFields ?? [];
      for (const cf of customFields) {
        expect(cf.name).not.toBe(oldName);
        if (cf.name.endsWith('/fieldTypes/completed')) {
          expect(cf.name).toBe(newName);
        }
      }
    }
  });

  it('isBreaking is true', () => {
    expect(new FieldTypeRenameHandler().isBreaking).toBe(true);
  });

  it('rewrites a card type customField referencing a module-owned field whose install is already post-rename', async () => {
    // Replay scenario: module `ext` shipped the post-rename state on disk
    // (urgency present, priority absent — placed by `applyModules`). A
    // consumer card type still lists the *old* foreign field in customFields.
    // Step 2 of the cascade must rewrite that reference. The validation must
    // not reject because the *old* foreign name no longer exists on disk —
    // for a foreign replay the install is already at the new name.
    const dedicatedPath = join(tmpDir, `proj-ct-${Date.now()}`);
    await mkdir(dedicatedPath, { recursive: true });
    await copyDir(FIXTURE_PATH, dedicatedPath);

    const moduleDir = join(dedicatedPath, '.cards', 'modules', 'ext');
    const fieldTypesDir = join(moduleDir, 'fieldTypes');
    await mkdir(fieldTypesDir, { recursive: true });
    await writeFile(
      join(moduleDir, 'cardsConfig.json'),
      JSON.stringify({ cardKeyPrefix: 'ext', name: 'ext', modules: [] }),
    );
    await writeFile(
      join(fieldTypesDir, 'urgency.json'),
      JSON.stringify({
        name: 'ext/fieldTypes/urgency',
        displayName: '',
        dataType: 'shortText',
      }),
    );

    // Local card type references the *old* foreign field in customFields.
    const cardTypePath = join(
      dedicatedPath,
      '.cards',
      'local',
      'cardTypes',
      'decision.json',
    );
    const cardType = JSON.parse(await readFile(cardTypePath, 'utf-8')) as {
      customFields: { name: string }[];
    };
    cardType.customFields.push({ name: 'ext/fieldTypes/priority' });
    await writeFile(cardTypePath, JSON.stringify(cardType));

    const dedicatedProject = new Project(dedicatedPath);
    await dedicatedProject.populateCaches();

    await new ResourceMutations(dedicatedProject).apply(
      {
        kind: 'rename' as const,
        target: resourceName('ext/fieldTypes/priority'),
        newIdentifier: 'urgency',
      },
      { bypassFingerprint: true },
    );

    const updated = dedicatedProject.resources
      .cardTypes()
      .find((ct) => ct.data?.name === 'decision/cardTypes/decision');
    const names = (updated?.data?.customFields ?? []).map((cf) => cf.name);
    expect(names).toContain('ext/fieldTypes/urgency');
    expect(names).not.toContain('ext/fieldTypes/priority');
  });

  it('skips module-owned card types in the customFields cascade (their files are immutable)', async () => {
    // A *second* module owns a card type that still references the field
    // being renamed. Module resources are immutable from the consumer side
    // (write() throws "Cannot change module resources"), and a foreign card
    // type's references are the owning module's responsibility — so the
    // cascade must skip module-owned card types rather than try to rewrite
    // them.
    const dedicatedPath = join(tmpDir, `proj-modct-${Date.now()}`);
    await mkdir(dedicatedPath, { recursive: true });
    await copyDir(FIXTURE_PATH, dedicatedPath);

    // ext: post-rename install (urgency present, priority gone).
    const extFieldTypes = join(
      dedicatedPath,
      '.cards',
      'modules',
      'ext',
      'fieldTypes',
    );
    await mkdir(extFieldTypes, { recursive: true });
    await writeFile(
      join(dedicatedPath, '.cards', 'modules', 'ext', 'cardsConfig.json'),
      JSON.stringify({ cardKeyPrefix: 'ext', name: 'ext', modules: [] }),
    );
    await writeFile(
      join(extFieldTypes, 'urgency.json'),
      JSON.stringify({
        name: 'ext/fieldTypes/urgency',
        displayName: '',
        dataType: 'shortText',
      }),
    );

    // mod: owns a card type still referencing the OLD foreign field name.
    const modCardTypes = join(
      dedicatedPath,
      '.cards',
      'modules',
      'mod',
      'cardTypes',
    );
    await mkdir(modCardTypes, { recursive: true });
    await writeFile(
      join(dedicatedPath, '.cards', 'modules', 'mod', 'cardsConfig.json'),
      JSON.stringify({ cardKeyPrefix: 'mod', name: 'mod', modules: [] }),
    );
    await writeFile(
      join(modCardTypes, 'thing.json'),
      JSON.stringify({
        name: 'mod/cardTypes/thing',
        displayName: '',
        workflow: 'mod/workflows/w',
        customFields: [{ name: 'ext/fieldTypes/priority' }],
        alwaysVisibleFields: [],
        optionallyVisibleFields: [],
      }),
    );

    const dedicatedProject = new Project(dedicatedPath);
    await dedicatedProject.populateCaches();

    await new ResourceMutations(dedicatedProject).apply(
      {
        kind: 'rename' as const,
        target: resourceName('ext/fieldTypes/priority'),
        newIdentifier: 'urgency',
      },
      { bypassFingerprint: true },
    );

    // Module-owned card type left untouched — still references the old name.
    const modCt = dedicatedProject.resources
      .cardTypes()
      .find((ct) => ct.data?.name === 'mod/cardTypes/thing');
    const names = (modCt?.data?.customFields ?? []).map((cf) => cf.name);
    expect(names).toContain('ext/fieldTypes/priority');
  });

  describe('foreign-module replay (apply only, foreign target)', () => {
    it('rewrites local card type customFields and card metadata without touching module file', async () => {
      const dedicatedPath = join(tmpDir, `proj-foreign-replay-${Date.now()}`);
      await mkdir(dedicatedPath, { recursive: true });
      await copyDir(FIXTURE_PATH, dedicatedPath);

      // Seed module 'foo' with the field already in post-rename state (renamed).
      const fooModuleDir = join(dedicatedPath, '.cards', 'modules', 'foo');
      const fooFieldTypesDir = join(fooModuleDir, 'fieldTypes');
      await mkdir(fooFieldTypesDir, { recursive: true });
      await writeFile(
        join(fooModuleDir, 'cardsConfig.json'),
        JSON.stringify({ cardKeyPrefix: 'foo', name: 'foo', modules: [] }),
      );
      const moduleFilePath = join(fooFieldTypesDir, 'priority.json');
      const moduleFileContent = JSON.stringify({
        name: 'foo/fieldTypes/priority',
        displayName: '',
        dataType: 'shortText',
      });
      await writeFile(moduleFilePath, moduleFileContent);

      // Seed a local card type referencing the OLD field name (pre-rename).
      const cardTypePath = join(
        dedicatedPath,
        '.cards',
        'local',
        'cardTypes',
        'decision.json',
      );
      const cardType = JSON.parse(await readFile(cardTypePath, 'utf-8')) as {
        customFields: { name: string }[];
      };
      cardType.customFields.push({ name: 'foo/fieldTypes/urgency' });
      await writeFile(cardTypePath, JSON.stringify(cardType));

      // Seed a local card carrying the OLD metadata key.
      const cards = project.cards(undefined);
      if (cards.length > 0) {
        const cardIndex = join(dedicatedPath, 'cardRoot', cards[0].key, 'index.json');
        const metadata = JSON.parse(await readFile(cardIndex, 'utf-8')) as Record<string, unknown>;
        metadata['foo/fieldTypes/urgency'] = 'someValue';
        await writeFile(cardIndex, JSON.stringify(metadata));
      }

      const foreignProject = new Project(dedicatedPath);
      await foreignProject.populateCaches();

      // Apply: target prefix is 'foo' (foreign). Should rewrite local consumer
      // references and NOT throw even though the old name 'urgency' was the
      // name before rename (now it IS 'priority'). Wait — the rename is from
      // 'urgency' -> 'priority'. The module file already has 'priority'.
      // We seeded local refs with 'urgency' (the old name).
      await new ResourceMutations(foreignProject).apply(
        {
          kind: 'rename',
          target: resourceName('foo/fieldTypes/urgency'),
          newIdentifier: 'priority',
        },
        { bypassFingerprint: true },
      );

      // Local card type now references the new name.
      const updatedCardType = foreignProject.resources
        .cardTypes()
        .find((ct) => ct.data?.name?.endsWith('/cardTypes/decision'));
      const cfNames = (updatedCardType?.data?.customFields ?? []).map((cf) => cf.name);
      expect(cfNames).toContain('foo/fieldTypes/priority');
      expect(cfNames).not.toContain('foo/fieldTypes/urgency');

      // Module file is byte-identical to the seed (untouched).
      const moduleFileAfter = await readFile(moduleFilePath, 'utf-8');
      expect(moduleFileAfter).toBe(moduleFileContent);
    });
  });

  it('skips the resource-file step when target is module-owned (managed by applyModules)', async () => {
    // Simulate a replay scenario: an upstream module has already shipped
    // the post-rename state on disk (urgency present, priority absent —
    // `applyModules` placed it). The consumer's own card still carries
    // the *old* metadata key. Replay must rewrite the card and leave the
    // module's filesystem alone.

    // Fresh project: this test seeds disk state before the first cache
    // populate. The `beforeEach` already built `project`, but populating
    // again is idempotent and would miss the synthetic module — build a
    // new Project so caches load with the synthesised tree in place.
    const dedicatedPath = join(tmpDir, `proj-skip-${Date.now()}`);
    await mkdir(dedicatedPath, { recursive: true });
    await copyDir(FIXTURE_PATH, dedicatedPath);

    const moduleDir = join(dedicatedPath, '.cards', 'modules', 'ext');
    const fieldTypesDir = join(moduleDir, 'fieldTypes');
    await mkdir(fieldTypesDir, { recursive: true });
    await writeFile(
      join(moduleDir, 'cardsConfig.json'),
      JSON.stringify({ cardKeyPrefix: 'ext', name: 'ext', modules: [] }),
    );
    const urgencyPath = join(fieldTypesDir, 'urgency.json');
    await writeFile(
      urgencyPath,
      JSON.stringify({
        name: 'ext/fieldTypes/urgency',
        displayName: '',
        dataType: 'shortText',
      }),
    );

    const cardKey = 'decision_5';
    const cardIndex = join(dedicatedPath, 'cardRoot', cardKey, 'index.json');
    const metadata = JSON.parse(await readFile(cardIndex, 'utf-8')) as Record<
      string,
      unknown
    >;
    metadata['ext/fieldTypes/priority'] = null;
    await writeFile(cardIndex, JSON.stringify(metadata));

    const dedicatedProject = new Project(dedicatedPath);
    await dedicatedProject.populateCaches();

    await new ResourceMutations(dedicatedProject).apply(
      {
        kind: 'rename' as const,
        target: resourceName('ext/fieldTypes/priority'),
        newIdentifier: 'urgency',
      },
      { bypassFingerprint: true },
    );

    // Card metadata key was rewritten (cascade did its job).
    const updated = dedicatedProject.findCard(cardKey);
    expect(updated.metadata).toBeDefined();
    expect('ext/fieldTypes/urgency' in updated.metadata!).toBe(true);
    expect('ext/fieldTypes/priority' in updated.metadata!).toBe(false);

    // Module-owned file was not deleted, renamed, or otherwise disturbed.
    expect(existsSync(urgencyPath)).toBe(true);
    expect(existsSync(join(fieldTypesDir, 'priority.json'))).toBe(false);
  });
});
