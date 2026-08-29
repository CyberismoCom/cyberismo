import { expect, it, describe, beforeAll, afterAll } from 'vitest';
import { join } from 'node:path';
import { mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';

import { copyDir } from '../src/utils/file-utils.js';
import { resourceName } from '../src/utils/resource-utils.js';
import { CommandManager } from '../src/command-manager.js';
import { type Edit } from '../src/commands/index.js';
import { CardNotFoundError } from '../src/exceptions/index.js';
import type { Card } from '../src/index.js';

describe('edit card', () => {
  const baseDir = import.meta.dirname;
  const testDir = join(baseDir, 'tmp-edit-tests');
  const decisionRecordsPath = join(testDir, 'valid/decision-records');
  let commands: CommandManager;
  let editCmd: Edit;

  beforeAll(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data/', testDir);
    commands = new CommandManager(decisionRecordsPath, {});
    await commands.initialize();
    editCmd = commands.editCmd;
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('edit card content (success)', async () => {
    const cards = await commands.project.cardTree.cards();
    const firstCard = cards.at(0) as Card;

    // Modify content
    await editCmd.editCardContent(firstCard.key, 'whoopie');

    // Fetch the changed card again
    const changedCard = await commands.project.findCard(firstCard.key);
    expect(changedCard.content).toBe('whoopie');
    expect(changedCard.metadata!.lastUpdated).not.toBe(
      firstCard.metadata!.lastUpdated,
    );
  });
  it('edit card content - template card', async () => {
    const templateCards = await commands.project
      .templateTree('decision/templates/decision')
      .cards();
    const firstCard = templateCards.at(0) as Card;

    await editCmd.editCardContent(firstCard.key, 'whoopie');
    const changedCard = await commands.project.findCard(firstCard.key);
    expect(changedCard.content).toBe('whoopie');
  });

  it('edit card content - no content', async () => {
    const cards = await commands.project.cardTree.cards();
    const firstCard = cards.at(0) as Card;
    await expect(
      editCmd.editCardContent(firstCard.key, ''),
    ).resolves.not.toThrow();
  });

  it('try to edit card content - card is not in project', async () => {
    await expect(
      editCmd.editCardContent('card-key-does-not-exist', 'whoopie'),
    ).rejects.toThrow();
  });

  it('try to edit card from CLI - no project', async () => {
    const cards = await commands.project.cardTree.cards();
    const firstCard = cards.at(0) as Card;
    expect(() => editCmd.editCard(firstCard.key + 1)).throws(CardNotFoundError);
  });
  it('edit card metadata (success)', async () => {
    const cards = await commands.project.cardTree.cards();
    const firstCard = cards.at(0) as Card;

    // Modify metadata - title
    await expect(
      editCmd.editCardMetadata(firstCard.key, 'title', 'new name'),
    ).resolves.not.toThrow();

    // Fetch the changed card again
    const changedCard = await commands.project.findCard(firstCard.key);
    expect(changedCard.metadata!.title).to.equal('new name');
  });
  it('edit card metadata - template card', async () => {
    // Create a fresh CommandManager instance to avoid test isolation issues
    const freshTestDir = join(baseDir, 'tmp-edit-template-test');
    mkdirSync(freshTestDir, { recursive: true });
    await copyDir('test/test-data/', freshTestDir);
    const freshDecisionRecordsPath = join(
      freshTestDir,
      'valid/decision-records',
    );
    const freshCommands = new CommandManager(freshDecisionRecordsPath, {});
    await freshCommands.initialize();
    const freshEditCmd = freshCommands.editCmd;

    const templateCards = await freshCommands.project
      .templateTree('decision/templates/decision')
      .cards();
    const firstCard = templateCards.at(0) as Card;

    await freshEditCmd.editCardMetadata(firstCard.key, 'title', 'new name');

    const changedCard = await freshCommands.project.findCard(firstCard.key);
    expect(changedCard.metadata?.title).to.equal('new name');

    rmSync(freshTestDir, { recursive: true, force: true });
  });
  it('shortText value over the length limit reports the length, not a type error', async () => {
    // Isolated project: this test adds a custom field to a card type.
    const freshTestDir = join(baseDir, 'tmp-edit-shorttext-test');
    mkdirSync(freshTestDir, { recursive: true });
    await copyDir('test/test-data/', freshTestDir);
    const freshCommands = new CommandManager(
      join(freshTestDir, 'valid/decision-records'),
      {},
    );
    await freshCommands.initialize();

    await freshCommands.createCmd.createFieldType('myShort', 'shortText');
    await freshCommands.updateCmd.apply({
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
      freshCommands.editCmd.editCardMetadata(
        'decision_6',
        'decision/fieldTypes/myShort',
        longValue,
      ),
    ).rejects.toThrow(
      /value exceeds the maximum length for 'shortText': 80 characters allowed, but value has 120 characters/,
    );
    await expect(
      freshCommands.editCmd.editCardMetadata(
        'decision_6',
        'decision/fieldTypes/myShort',
        longValue,
      ),
    ).rejects.not.toThrow(/but it is 'string'/);

    rmSync(freshTestDir, { recursive: true, force: true });
  });
  it('try to edit card metadata - incorrect field name', async () => {
    const cards = await commands.project.cardTree.cards();
    const firstCard = cards.at(0) as Card;
    await expect(
      editCmd.editCardMetadata(firstCard.key, '', ''),
    ).rejects.toThrow();
  });

  it('try to edit card metadata - card is not in project', async () => {
    const EditCmd = commands.editCmd;
    await expect(
      EditCmd.editCardMetadata('card-key-does-not-exist', 'whoopie', 'whoopie'),
    ).rejects.toThrow();
  });

  it('editing a calculated field without override is rejected', async () => {
    await expect(
      editCmd.editCardMetadata(
        'decision_6',
        'decision/fieldTypes/obsoletedBy',
        'decision_999',
      ),
    ).rejects.toThrow(/Cannot edit calculated field/);
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

    const freshCommands = new CommandManager(projectPath, {});
    await freshCommands.initialize();
    return { freshTestDir, freshCommands };
  }

  it('editing a calculated field with override enabled persists the override', async () => {
    const { freshTestDir, freshCommands } = await projectWithOverrideEnabled(
      'tmp-edit-override-test',
    );
    try {
      await expect(
        freshCommands.editCmd.editCardMetadata(
          'decision_6',
          'decision/fieldTypes/obsoletedBy',
          'decision_999',
        ),
      ).resolves.not.toThrow();

      const changed = await freshCommands.project.findCard('decision_6');
      expect(changed.metadata!['decision/fieldTypes/obsoletedBy']).toBe(
        'decision_999',
      );

      // Clearing the override (saving null) removes the key entirely.
      await expect(
        freshCommands.editCmd.editCardMetadata(
          'decision_6',
          'decision/fieldTypes/obsoletedBy',
          null,
        ),
      ).resolves.not.toThrow();

      const cleared = await freshCommands.project.findCard('decision_6');
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
    const templateCards = await commands.project
      .templateTree('decision/templates/decision')
      .cards();
    const templateCard = templateCards.at(0) as Card;

    await expect(
      editCmd.editCardMetadata(
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
      const templateCard = (
        await freshCommands.project
          .templateTree('decision/templates/decision')
          .cards()
      ).at(0) as Card;

      await expect(
        freshCommands.editCmd.editCardMetadata(
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
        freshCommands.editCmd.editCardMetadata(
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

  it('clearing is allowed even when the field does not enable override', async () => {
    // A value stored before the card type changed is a validation error, so
    // removing it has to stay possible even though setting one is rejected.
    const freshTestDir = join(baseDir, 'tmp-edit-clear-locked-test');
    mkdirSync(freshTestDir, { recursive: true });
    await copyDir('test/test-data/', freshTestDir);
    const projectPath = join(freshTestDir, 'valid/decision-records');
    const metadataFile = join(
      projectPath,
      'cardRoot/decision_5/c/decision_6/index.json',
    );
    const metadata = JSON.parse(readFileSync(metadataFile, 'utf-8'));
    metadata['decision/fieldTypes/obsoletedBy'] = 'decision_999';
    writeFileSync(metadataFile, JSON.stringify(metadata));

    const freshCommands = new CommandManager(projectPath, {});
    await freshCommands.initialize();

    try {
      await expect(
        freshCommands.editCmd.editCardMetadata(
          'decision_6',
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
      const card = await freshCommands.project.findCard('decision_6');
      const metadataFile = join(card.path, 'index.json');
      const before = readFileSync(metadataFile, 'utf-8');
      expect(JSON.parse(before)).not.toHaveProperty([
        'decision/fieldTypes/obsoletedBy',
      ]);

      await expect(
        freshCommands.editCmd.editCardMetadata(
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
    let clearCommands: CommandManager;

    beforeAll(async () => {
      mkdirSync(clearTestDir, { recursive: true });
      await copyDir('test/test-data/', clearTestDir);
      clearCommands = new CommandManager(
        join(clearTestDir, 'valid/decision-records'),
        {},
      );
      await clearCommands.initialize();
    });

    afterAll(() => {
      rmSync(clearTestDir, { recursive: true, force: true });
    });

    // Gives RESPONSIBLE a real value, so that clearing it removes an actual
    // value rather than null residue.
    async function cardWithResponsibleSet(): Promise<Card> {
      await clearCommands.editCmd.editCardMetadata(
        'decision_6',
        RESPONSIBLE,
        'someone@example.com',
      );
      const card = await clearCommands.project.findCard('decision_6');
      expect(card.metadata![RESPONSIBLE]).toBeTruthy();
      return card;
    }

    it('clearing a regular custom field removes the key from index.json', async () => {
      const card = await cardWithResponsibleSet();
      const keysBefore = Object.keys(card.metadata!).sort();

      await clearCommands.editCmd.editCardMetadata(card.key, RESPONSIBLE, null);

      const changed = await clearCommands.project.findCard(card.key);
      expect(changed.metadata!).not.toHaveProperty([RESPONSIBLE]);
      const onDisk = readFileSync(join(changed.path, 'index.json'), 'utf-8');
      expect(onDisk).not.toContain(RESPONSIBLE);

      // Only the cleared key is gone; its siblings survive.
      expect(Object.keys(changed.metadata!).sort()).toEqual(
        keysBefore.filter((key) => key !== RESPONSIBLE),
      );
    });

    it('clearing a regular custom field with undefined removes the key too', async () => {
      const card = await cardWithResponsibleSet();

      await clearCommands.editCmd.editCardMetadata(
        card.key,
        RESPONSIBLE,
        undefined,
      );

      const changed = await clearCommands.project.findCard(card.key);
      expect(changed.metadata!).not.toHaveProperty([RESPONSIBLE]);
      const onDisk = readFileSync(join(changed.path, 'index.json'), 'utf-8');
      expect(onDisk).not.toContain(RESPONSIBLE);
    });

    it('clearing a predefined field does not delete the key', async () => {
      await clearCommands.editCmd.editCardMetadata(
        'decision_6',
        'title',
        'a real title',
      );

      // Key deletion covers custom fields; predefined fields are out of scope.
      await clearCommands.editCmd.editCardMetadata('decision_6', 'title', null);

      const changed = await clearCommands.project.findCard('decision_6');
      expect('title' in changed.metadata!).toBe(true);
      expect(changed.metadata!.title).toBeNull();
      const onDisk = JSON.parse(
        readFileSync(join(changed.path, 'index.json'), 'utf-8'),
      );
      expect(onDisk).toHaveProperty('title', null);
    });

    it('writing undefined to a predefined field stores null', async () => {
      await clearCommands.editCmd.editCardMetadata(
        'decision_6',
        'title',
        'a real title',
      );

      await clearCommands.editCmd.editCardMetadata(
        'decision_6',
        'title',
        undefined,
      );

      const changed = await clearCommands.project.findCard('decision_6');
      expect('title' in changed.metadata!).toBe(true);
      expect(changed.metadata!.title).toBeNull();
      const onDisk = JSON.parse(
        readFileSync(join(changed.path, 'index.json'), 'utf-8'),
      );
      expect(onDisk).toHaveProperty('title', null);
    });
  });
});
