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
    commands = new CommandManager(decisionRecordsPath, {
      autoSaveConfiguration: false,
    });
    await commands.initialize();
    editCmd = commands.editCmd;
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('edit card content (success)', async () => {
    const cards = commands.project.cards();
    const firstCard = cards.at(0) as Card;

    // Modify content
    await editCmd.editCardContent(firstCard.key, 'whoopie');

    // Fetch the changed card again
    const changedCard = commands.project.findCard(firstCard.key);
    expect(changedCard.content).toBe('whoopie');
    expect(changedCard.metadata!.lastUpdated).not.toBe(
      firstCard.metadata!.lastUpdated,
    );
  });
  it('edit card content - template card', async () => {
    const templateCards = commands.project.templateCards(
      'decision/templates/decision',
    );
    const firstCard = templateCards.at(0) as Card;

    await editCmd.editCardContent(firstCard.key, 'whoopie');
    const changedCard = commands.project.findCard(firstCard.key);
    expect(changedCard.content).toBe('whoopie');
  });

  it('edit card content - no content', async () => {
    const cards = commands.project.cards();
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
    const cards = commands.project.cards();
    const firstCard = cards.at(0) as Card;
    expect(() => editCmd.editCard(firstCard.key + 1)).throws(CardNotFoundError);
  });
  it('edit card metadata (success)', async () => {
    const cards = commands.project.cards();
    const firstCard = cards.at(0) as Card;

    // Modify metadata - title
    await expect(
      editCmd.editCardMetadata(firstCard.key, 'title', 'new name'),
    ).resolves.not.toThrow();

    // Fetch the changed card again
    const changedCard = commands.project.findCard(firstCard.key);
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
    const freshCommands = new CommandManager(freshDecisionRecordsPath, {
      autoSaveConfiguration: false,
    });
    await freshCommands.initialize();
    const freshEditCmd = freshCommands.editCmd;

    const templateCards = freshCommands.project.templateCards(
      'decision/templates/decision',
    );
    const firstCard = templateCards.at(0) as Card;

    await freshEditCmd.editCardMetadata(firstCard.key, 'title', 'new name');

    const changedCard = freshCommands.project.findCard(firstCard.key);
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
      { autoSaveConfiguration: false },
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
    const cards = commands.project.cards();
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
    ).rejects.toThrow(/calculated field/);
  });

  it('editing a calculated field with override enabled persists the override', async () => {
    const freshTestDir = join(baseDir, 'tmp-edit-override-test');
    mkdirSync(freshTestDir, { recursive: true });
    try {
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

      const freshCommands = new CommandManager(projectPath, {
        autoSaveConfiguration: false,
      });
      await freshCommands.initialize();

      await expect(
        freshCommands.editCmd.editCardMetadata(
          'decision_6',
          'decision/fieldTypes/obsoletedBy',
          'decision_999',
        ),
      ).resolves.not.toThrow();

      const changed = freshCommands.project.findCard('decision_6');
      expect(changed.metadata!['decision/fieldTypes/obsoletedBy']).toBe(
        'decision_999',
      );

      // Clearing the override (saving null) also works.
      await expect(
        freshCommands.editCmd.editCardMetadata(
          'decision_6',
          'decision/fieldTypes/obsoletedBy',
          null,
        ),
      ).resolves.not.toThrow();
    } finally {
      rmSync(freshTestDir, { recursive: true, force: true });
    }
  });
});
