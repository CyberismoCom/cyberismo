import { expect, it, describe, beforeAll, afterAll } from 'vitest';
import { join } from 'node:path';
import { mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';

import { copyDir } from '../src/shared/utils/file-utils.js';
import { resourceName } from '../src/shared/utils/resource-utils.js';
import { type Workspace } from '../src/api/workspace/workspace.js';
import type { Card } from '@cyberismo/model';
import { openTestWorkspace } from './helpers/open-test-workspace.js';
import { findCard } from '../src/domain/cards/read.js';
import { checkoutOf } from '../src/infra/internal.js';

describe('edit card', () => {
  const baseDir = import.meta.dirname;
  const testDir = join(baseDir, 'tmp-edit-tests');
  const decisionRecordsPath = join(testDir, 'valid/decision-records');
  let ws: Workspace;

  beforeAll(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data/', testDir);
    ws = await openTestWorkspace(decisionRecordsPath, {});
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('edit card content - no content', async () => {
    const cards = checkoutOf(ws).cardTree.cards();
    const firstCard = cards.at(0) as Card;
    await expect(ws.cards.edit(firstCard.key, '')).resolves.not.toThrow();
  });

  it('edit card metadata - template card', async () => {
    // Use a fresh project copy to avoid test isolation issues
    const freshTestDir = join(baseDir, 'tmp-edit-template-test');
    mkdirSync(freshTestDir, { recursive: true });
    await copyDir('test/test-data/', freshTestDir);
    const freshDecisionRecordsPath = join(
      freshTestDir,
      'valid/decision-records',
    );
    const freshCommands = await openTestWorkspace(freshDecisionRecordsPath, {});
    const templateCards = checkoutOf(freshCommands)
      .templateTree('decision/templates/decision')
      .cards();
    const firstCard = templateCards.at(0) as Card;

    await freshCommands.cards.editField(firstCard.key, 'title', 'new name');

    const changedCard = findCard(checkoutOf(freshCommands), firstCard.key);
    expect(changedCard.metadata?.title).to.equal('new name');

    rmSync(freshTestDir, { recursive: true, force: true });
  });
  it('shortText value over the length limit reports the length, not a type error', async () => {
    // Isolated project: this test adds a custom field to a card type.
    const freshTestDir = join(baseDir, 'tmp-edit-shorttext-test');
    mkdirSync(freshTestDir, { recursive: true });
    await copyDir('test/test-data/', freshTestDir);
    const freshCommands = await openTestWorkspace(
      join(freshTestDir, 'valid/decision-records'),
      {},
    );
    await freshCommands.resources.create('myShort', 'fieldTypes', {
      dataType: 'shortText',
    });
    await freshCommands.changes.apply({
      kind: 'edit',
      target: resourceName('decision/cardTypes/decision'),
      updateKey: { key: 'customFields' },
      operation: {
        name: 'add',
        target: { name: 'decision/fieldTypes/myShort' },
      },
    });

    const longValue = 'x'.repeat(120);
    await expect(
      freshCommands.cards.editField(
        'decision_6',
        'decision/fieldTypes/myShort',
        longValue,
      ),
    ).rejects.toThrow(
      /value exceeds the maximum length for 'shortText': 80 characters allowed, but value has 120 characters/,
    );
    await expect(
      freshCommands.cards.editField(
        'decision_6',
        'decision/fieldTypes/myShort',
        longValue,
      ),
    ).rejects.not.toThrow(/but it is 'string'/);

    rmSync(freshTestDir, { recursive: true, force: true });
  });

  // Fresh project where 'decision/fieldTypes/obsoletedBy' allows override.
  async function projectWithOverrideEnabled(testDirName: string) {
    const freshTestDir = join(baseDir, testDirName);
    mkdirSync(freshTestDir, { recursive: true });
    await copyDir('test/test-data/', freshTestDir);
    const projectPath = join(freshTestDir, 'valid/decision-records');

    const cardTypePath = join(
      projectPath,
      '.cards/local/cardTypes/decision.json',
    );
    const cardType = JSON.parse(readFileSync(cardTypePath, 'utf-8'));
    const field = cardType.customFields.find(
      (f: { name: string }) => f.name === 'decision/fieldTypes/obsoletedBy',
    );
    expect(field).toBeDefined();
    field.enableOverride = true;
    writeFileSync(cardTypePath, JSON.stringify(cardType));

    const freshCommands = await openTestWorkspace(projectPath, {});
    return { freshTestDir, freshCommands };
  }

  it('editing a calculated field with override enabled persists the override', async () => {
    const { freshTestDir, freshCommands } = await projectWithOverrideEnabled(
      'tmp-edit-override-test',
    );
    try {
      await expect(
        freshCommands.cards.editField(
          'decision_6',
          'decision/fieldTypes/obsoletedBy',
          'decision_999',
        ),
      ).resolves.not.toThrow();

      const changed = findCard(checkoutOf(freshCommands), 'decision_6');
      expect(changed.metadata!['decision/fieldTypes/obsoletedBy']).toBe(
        'decision_999',
      );

      // Clearing the override (saving null) removes the key entirely.
      await expect(
        freshCommands.cards.editField(
          'decision_6',
          'decision/fieldTypes/obsoletedBy',
          null,
        ),
      ).resolves.not.toThrow();

      const cleared = findCard(checkoutOf(freshCommands), 'decision_6');
      expect(cleared.metadata!).not.toHaveProperty([
        'decision/fieldTypes/obsoletedBy',
      ]);

      const persisted = JSON.parse(
        readFileSync(join(cleared.path, 'index.json'), 'utf-8'),
      );
      expect(persisted).not.toHaveProperty(['decision/fieldTypes/obsoletedBy']);
    } finally {
      rmSync(freshTestDir, { recursive: true, force: true });
    }
  });

  it('editing a calculated field of a template card is rejected too', async () => {
    const templateCards = checkoutOf(ws)
      .templateTree('decision/templates/decision')
      .cards();
    const templateCard = templateCards.at(0) as Card;

    await expect(
      ws.cards.editField(
        templateCard.key,
        'decision/fieldTypes/obsoletedBy',
        'decision_999',
      ),
    ).rejects.toThrow(/Cannot edit calculated field/);
  });

  it('a template card can hold an override, and clearing removes it', async () => {
    const { freshTestDir, freshCommands } = await projectWithOverrideEnabled(
      'tmp-edit-override-template-test',
    );
    try {
      const templateCard = checkoutOf(freshCommands)
        .templateTree('decision/templates/decision')
        .cards()
        .at(0) as Card;

      await expect(
        freshCommands.cards.editField(
          templateCard.key,
          'decision/fieldTypes/obsoletedBy',
          'decision_999',
        ),
      ).resolves.not.toThrow();

      const metadataFile = join(templateCard.path, 'index.json');
      expect(JSON.parse(readFileSync(metadataFile, 'utf-8'))).toHaveProperty(
        ['decision/fieldTypes/obsoletedBy'],
        'decision_999',
      );

      await expect(
        freshCommands.cards.editField(
          templateCard.key,
          'decision/fieldTypes/obsoletedBy',
          null,
        ),
      ).resolves.not.toThrow();

      expect(
        JSON.parse(readFileSync(metadataFile, 'utf-8')),
      ).not.toHaveProperty(['decision/fieldTypes/obsoletedBy']);
    } finally {
      rmSync(freshTestDir, { recursive: true, force: true });
    }
  });

  it('clearing a calculated field with no stored override is a no-op', async () => {
    const { freshTestDir, freshCommands } = await projectWithOverrideEnabled(
      'tmp-edit-override-noop-test',
    );
    try {
      const card = findCard(checkoutOf(freshCommands), 'decision_6');
      const metadataFile = join(card.path, 'index.json');
      const before = readFileSync(metadataFile, 'utf-8');
      expect(JSON.parse(before)).not.toHaveProperty([
        'decision/fieldTypes/obsoletedBy',
      ]);

      await expect(
        freshCommands.cards.editField(
          'decision_6',
          'decision/fieldTypes/obsoletedBy',
          null,
        ),
      ).resolves.not.toThrow();

      expect(readFileSync(metadataFile, 'utf-8')).toBe(before);
    } finally {
      rmSync(freshTestDir, { recursive: true, force: true });
    }
  });

  // Own project copy: these tests clear stored metadata, which must not leak
  // into the suite-wide project. Each test establishes its own precondition, so
  // they do not depend on each other's order either.
  describe('clearing a field', () => {
    const RESPONSIBLE = 'decision/fieldTypes/responsible';
    const clearTestDir = join(baseDir, 'tmp-edit-clear-tests');
    let clearCommands: Workspace;

    beforeAll(async () => {
      mkdirSync(clearTestDir, { recursive: true });
      await copyDir('test/test-data/', clearTestDir);
      clearCommands = await openTestWorkspace(
        join(clearTestDir, 'valid/decision-records'),
        {},
      );
    });

    afterAll(() => {
      rmSync(clearTestDir, { recursive: true, force: true });
    });

    // Gives RESPONSIBLE a real value, so that clearing it removes an actual
    // value rather than null residue.
    async function cardWithResponsibleSet(): Promise<Card> {
      await clearCommands.cards.editField(
        'decision_6',
        RESPONSIBLE,
        'someone@example.com',
      );
      const card = findCard(checkoutOf(clearCommands), 'decision_6');
      expect(card.metadata![RESPONSIBLE]).toBeTruthy();
      return card;
    }

    it('clearing a regular custom field with undefined removes the key too', async () => {
      const card = await cardWithResponsibleSet();

      await clearCommands.cards.editField(card.key, RESPONSIBLE, undefined);

      const changed = findCard(checkoutOf(clearCommands), card.key);
      expect(changed.metadata!).not.toHaveProperty([RESPONSIBLE]);
      const onDisk = readFileSync(join(changed.path, 'index.json'), 'utf-8');
      expect(onDisk).not.toContain(RESPONSIBLE);
    });

    it('writing undefined to a predefined field stores null', async () => {
      await clearCommands.cards.editField(
        'decision_6',
        'title',
        'a real title',
      );

      await clearCommands.cards.editField('decision_6', 'title', undefined);

      const changed = findCard(checkoutOf(clearCommands), 'decision_6');
      expect('title' in changed.metadata!).toBe(true);
      expect(changed.metadata!.title).toBeNull();
      const onDisk = JSON.parse(
        readFileSync(join(changed.path, 'index.json'), 'utf-8'),
      );
      expect(onDisk).toHaveProperty('title', null);
    });
  });
});
