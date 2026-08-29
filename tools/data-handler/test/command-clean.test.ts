// testing
import { expect, it, describe, beforeAll, afterAll, vi } from 'vitest';
import { join } from 'node:path';
import { mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';

import { copyDir } from '../src/utils/file-utils.js';
import { CommandManager } from '../src/command-manager.js';
import { Cmd, Commands } from '../src/command-handler.js';
import { Clean } from '../src/commands/clean.js';

const GHOST = 'decision/fieldTypes/ghost';
const OBSOLETED_BY = 'decision/fieldTypes/obsoletedBy';

describe('clean command', () => {
  const baseDir = import.meta.dirname;
  const testDir = join(baseDir, 'tmp-clean-tests');
  const decisionRecordsPath = join(testDir, 'valid/decision-records');
  let commands: CommandManager;
  let cleanCmd: Clean;

  beforeAll(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data/', testDir);
    commands = new CommandManager(decisionRecordsPath, {});
    await commands.initialize();
    cleanCmd = commands.cleanCmd;
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  // Cleaning is destructive, so tests that need the fixture's own dormant data
  // (its null placeholders) run against their own project copy.
  async function freshProject(
    testDirName: string,
    prepare?: (projectPath: string) => void,
  ) {
    const freshTestDir = join(baseDir, testDirName);
    mkdirSync(freshTestDir, { recursive: true });
    await copyDir('test/test-data/', freshTestDir);
    const projectPath = join(freshTestDir, 'valid/decision-records');
    prepare?.(projectPath);

    const freshCommands = new CommandManager(projectPath, {});
    await freshCommands.initialize();
    return { freshTestDir, freshCommands };
  }

  async function storeValue(
    manager: CommandManager,
    cardKey: string,
    field: string,
    value: string,
  ) {
    const card = await manager.project.findCard(cardKey);
    card.metadata![field] = value;
    await manager.project.updateCardMetadata(card, card.metadata!);
  }

  it('dry-run reports null-valued custom fields without writing', async () => {
    const { freshTestDir, freshCommands } =
      await freshProject('tmp-clean-dry-run');
    try {
      const card = await freshCommands.project.findCard('decision_6');
      const file = join(card.path, 'index.json');
      const before = readFileSync(file, 'utf-8');

      const result = await freshCommands.cleanCmd.clean(true);

      expect(result.dryRun).toBe(true);
      expect(result.findings.some((f) => f.reason === 'null-value')).toBe(true);
      expect(readFileSync(file, 'utf-8')).toBe(before);
    } finally {
      rmSync(freshTestDir, { recursive: true, force: true });
    }
  });

  it('removes null-valued custom fields', async () => {
    const { freshTestDir, freshCommands } =
      await freshProject('tmp-clean-nulls');
    try {
      const result = await freshCommands.cleanCmd.clean(false);

      expect(result.findings.length).toBeGreaterThan(0);
      for (const card of await freshCommands.project.cardTree.cards()) {
        const nulls = Object.entries(card.metadata!).filter(
          ([key, value]) => value === null && key.includes('/'),
        );
        expect(nulls).toEqual([]);
      }
    } finally {
      rmSync(freshTestDir, { recursive: true, force: true });
    }
  });

  it('removes keys the card type does not declare', async () => {
    await storeValue(commands, 'decision_6', GHOST, 'stale');

    const result = await cleanCmd.clean(false);

    expect(result.findings).toContainEqual({
      cardKey: 'decision_6',
      field: GHOST,
      reason: 'undeclared',
    });
    expect(
      (await commands.project.findCard('decision_6')).metadata!,
    ).not.toHaveProperty([GHOST]);
  });

  it('removes stored values on calculated fields without override', async () => {
    await storeValue(commands, 'decision_6', OBSOLETED_BY, 'stale');

    const result = await cleanCmd.clean(false);

    expect(result.findings).toContainEqual({
      cardKey: 'decision_6',
      field: OBSOLETED_BY,
      reason: 'calculated-locked',
    });
    expect(
      (await commands.project.findCard('decision_6')).metadata!,
    ).not.toHaveProperty([OBSOLETED_BY]);
  });

  it('keeps a calculated field value when the card type enables override', async () => {
    const { freshTestDir, freshCommands } = await freshProject(
      'tmp-clean-override',
      (projectPath) => {
        const cardTypePath = join(
          projectPath,
          '.cards/local/cardTypes/decision.json',
        );
        const cardType = JSON.parse(readFileSync(cardTypePath, 'utf-8'));
        const field = cardType.customFields.find(
          (f: { name: string }) => f.name === OBSOLETED_BY,
        );
        expect(field).toBeDefined();
        field.enableOverride = true;
        writeFileSync(cardTypePath, JSON.stringify(cardType));
      },
    );
    try {
      await storeValue(freshCommands, 'decision_6', OBSOLETED_BY, 'decision_5');
      // A sibling removal proves the card really was visited and written.
      await storeValue(freshCommands, 'decision_6', GHOST, 'stale');

      const result = await freshCommands.cleanCmd.clean(false);

      expect(result.skippedCards).not.toContain('decision_6');
      expect(result.findings).toContainEqual({
        cardKey: 'decision_6',
        field: GHOST,
        reason: 'undeclared',
      });
      expect(result.findings.every((f) => f.field !== OBSOLETED_BY)).toBe(true);

      const cleaned = await freshCommands.project.findCard('decision_6');
      expect(cleaned.metadata!).not.toHaveProperty([GHOST]);
      expect(cleaned.metadata![OBSOLETED_BY]).toBe('decision_5');
    } finally {
      rmSync(freshTestDir, { recursive: true, force: true });
    }
  });

  it('a dry run takes the read lock, not the write lock', async () => {
    const { freshTestDir, freshCommands } =
      await freshProject('tmp-clean-lock');
    try {
      // The write lock's after-write hooks commit and recalculate; a dry run
      // changes nothing and must not trigger either.
      const afterWrite = vi.fn().mockResolvedValue(undefined);
      freshCommands.project.lock.onAfterWrite(afterWrite);

      await freshCommands.cleanCmd.clean(true);
      expect(afterWrite).not.toHaveBeenCalled();

      // A read lock is reentrant from a read context; a write lock throws.
      const nested = await freshCommands.project.lock.read(() =>
        freshCommands.cleanCmd.clean(true),
      );
      expect(nested.findings.length).toBeGreaterThan(0);
      expect(afterWrite).not.toHaveBeenCalled();

      await freshCommands.cleanCmd.clean(false);
      expect(afterWrite).toHaveBeenCalled();
    } finally {
      rmSync(freshTestDir, { recursive: true, force: true });
    }
  });

  it('skips cards whose card type cannot be resolved', async () => {
    const { freshTestDir, freshCommands } = await freshProject(
      'tmp-clean-skipped',
      (projectPath) => {
        const cardFile = join(
          projectPath,
          'cardRoot/decision_5/c/decision_6/index.json',
        );
        const metadata = JSON.parse(readFileSync(cardFile, 'utf-8'));
        metadata.cardType = 'decision/cardTypes/gone';
        writeFileSync(cardFile, JSON.stringify(metadata, null, 4));
      },
    );
    try {
      const cardFile = join(
        (await freshCommands.project.findCard('decision_6')).path,
        'index.json',
      );
      const before = readFileSync(cardFile, 'utf-8');

      const result = await freshCommands.cleanCmd.clean(false);

      expect(result.skippedCards).toContain('decision_6');
      expect(result.findings.every((f) => f.cardKey !== 'decision_6')).toBe(
        true,
      );
      expect(readFileSync(cardFile, 'utf-8')).toBe(before);
    } finally {
      rmSync(freshTestDir, { recursive: true, force: true });
    }
  });

  it('a card that cannot be written does not stop the run', async () => {
    const { freshTestDir, freshCommands } = await freshProject(
      'tmp-clean-write-failure',
    );
    try {
      const failingFile = join(
        (await freshCommands.project.findCard('decision_6')).path,
        'index.json',
      );
      const before = readFileSync(failingFile, 'utf-8');
      const templateCard = (
        await freshCommands.project
          .templateTree('decision/templates/decision')
          .cards()
      ).at(0)!;
      const templateFile = join(templateCard.path, 'index.json');

      // Project cards are visited first, and decision_6 is the only one with
      // removals, so the single rejection lands on it.
      const failingWrite = vi
        .spyOn(freshCommands.project, 'updateCardMetadata')
        .mockRejectedValueOnce(new Error('write failed'));
      const result = await freshCommands.cleanCmd.clean(false);
      failingWrite.mockRestore();

      expect(result.failedCards).toEqual(['decision_6']);
      expect(readFileSync(failingFile, 'utf-8')).toBe(before);

      // The run continued: the template card after it was still cleaned.
      expect(result.findings.some((f) => f.cardKey === templateCard.key)).toBe(
        true,
      );
      expect(readFileSync(templateFile, 'utf-8')).not.toContain('null');
    } finally {
      rmSync(freshTestDir, { recursive: true, force: true });
    }
  });

  it('never touches module cards', async () => {
    const moduleTestDir = join(baseDir, 'tmp-clean-module');
    mkdirSync(moduleTestDir, { recursive: true });
    await copyDir('test/test-data/', moduleTestDir);
    const importing = new CommandManager(
      join(moduleTestDir, 'valid/minimal'),
      {},
    );
    await importing.initialize();
    try {
      // The imported project's template card carries null placeholders.
      await importing.importCmd.importModule(
        join(moduleTestDir, 'valid/decision-records'),
      );
      const moduleCards = (await importing.project.allTemplateCards()).filter(
        (card) => card.path.includes(join('.cards', 'modules')),
      );
      expect(moduleCards.length).toBeGreaterThan(0);
      const moduleFiles = moduleCards.map((card) =>
        join(card.path, 'index.json'),
      );
      const before = moduleFiles.map((file) => readFileSync(file, 'utf-8'));
      expect(before.some((content) => content.includes('null'))).toBe(true);

      const result = await importing.cleanCmd.clean(false);

      const moduleKeys = moduleCards.map((card) => card.key);
      expect(
        result.findings.every((f) => !moduleKeys.includes(f.cardKey)),
      ).toBe(true);
      expect(moduleFiles.map((file) => readFileSync(file, 'utf-8'))).toEqual(
        before,
      );
    } finally {
      rmSync(moduleTestDir, { recursive: true, force: true });
    }
  });

  it('cleans local template cards too', async () => {
    const templateCard = (
      await commands.project.templateTree('decision/templates/decision').cards()
    ).at(0)!;
    await storeValue(commands, templateCard.key, GHOST, 'stale');

    const result = await cleanCmd.clean(false);

    expect(result.findings).toContainEqual({
      cardKey: templateCard.key,
      field: GHOST,
      reason: 'undeclared',
    });
    expect(
      (await commands.project.findCard(templateCard.key)).metadata!,
    ).not.toHaveProperty([GHOST]);
  });

  it('never touches predefined fields', async () => {
    await cleanCmd.clean(false);

    const card = await commands.project.findCard('decision_6');
    expect(card.metadata!.title).toBeDefined();
    expect(card.metadata!.cardType).toBe('decision/cardTypes/decision');
    expect(card.metadata!.workflowState).toBeDefined();
  });

  it('cardType filter scopes the scan', async () => {
    await storeValue(commands, 'decision_5', GHOST, 'stale');
    await storeValue(commands, 'decision_6', GHOST, 'stale');

    const result = await cleanCmd.clean(true, 'decision/cardTypes/simplepage');

    expect(result.findings).toContainEqual({
      cardKey: 'decision_5',
      field: GHOST,
      reason: 'undeclared',
    });
    expect(result.findings.every((f) => f.cardKey !== 'decision_6')).toBe(true);
    for (const finding of result.findings) {
      const card = await commands.project.findCard(finding.cardKey);
      expect(card.metadata!.cardType).toBe('decision/cardTypes/simplepage');
    }
  });
});

describe('clean recommendation', () => {
  const baseDir = import.meta.dirname;
  const DECISION = 'decision/cardTypes/decision';
  const RECOMMENDATION = "'cyberismo clean' to remove them";
  const COUNTS =
    /this project has \d+ dormant field value\(s\) on \d+ card\(s\)/i;

  // Each test gets its own project folder: the CommandManager instance the
  // handler uses is keyed by project path, so a reused path would be served
  // from a stale in-memory project.
  async function handlerProject(testDirName: string) {
    const testDir = join(baseDir, testDirName);
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data/', testDir);
    return {
      testDir,
      handler: new Commands(),
      options: { projectPath: join(testDir, 'valid/decision-records') },
    };
  }

  it('recommends clean after removing a custom field from a card type', async () => {
    const { testDir, handler, options } = await handlerProject(
      'tmp-clean-recommend-remove',
    );
    try {
      const result = await handler.command(
        Cmd.update,
        [
          DECISION,
          'remove',
          'customFields',
          JSON.stringify({ name: 'decision/fieldTypes/responsible' }),
          '',
        ],
        options,
      );

      expect(result.statusCode).toBe(200);
      // The note travels beside 'message' so the CLI keeps printing its own
      // success line.
      expect(result.message).toBeUndefined();
      expect(result.note).toMatch(COUNTS);
      expect(result.note).toContain(RECOMMENDATION);
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('recommends clean after making a custom field calculated', async () => {
    const { testDir, handler, options } = await handlerProject(
      'tmp-clean-recommend-change',
    );
    try {
      // decision_6 stores a value for this field; once the field is calculated
      // without an override, that stored value is dormant.
      const result = await handler.command(
        Cmd.update,
        [
          DECISION,
          'change',
          'customFields',
          JSON.stringify({ name: 'decision/fieldTypes/numberOfCommits' }),
          JSON.stringify({
            name: 'decision/fieldTypes/numberOfCommits',
            isCalculated: true,
          }),
        ],
        options,
      );

      expect(result.statusCode).toBe(200);
      expect(result.message).toBeUndefined();
      expect(result.note).toMatch(COUNTS);
      expect(result.note).toContain(RECOMMENDATION);
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('does not recommend clean after adding a custom field', async () => {
    const { testDir, handler, options } = await handlerProject(
      'tmp-clean-recommend-add',
    );
    try {
      const created = await handler.command(
        Cmd.create,
        ['fieldType', 'extra', 'shortText'],
        options,
      );
      expect(created.statusCode).toBe(200);

      // The card type's cards do hold dormant values, so a scan would report
      // findings — an 'add' must not run one.
      const result = await handler.command(
        Cmd.update,
        [
          DECISION,
          'add',
          'customFields',
          JSON.stringify({ name: 'decision/fieldTypes/extra' }),
          '',
        ],
        options,
      );

      expect(result.statusCode).toBe(200);
      expect(result.note).toBeUndefined();
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('does not recommend clean when no card of the card type has dormant data', async () => {
    const { testDir, handler, options } = await handlerProject(
      'tmp-clean-recommend-unused-card-type',
    );
    try {
      await handler.command(
        Cmd.create,
        ['fieldType', 'extra', 'shortText'],
        options,
      );
      await handler.command(
        Cmd.create,
        ['cardType', 'unused', 'decision/workflows/decision'],
        options,
      );
      const added = await handler.command(
        Cmd.update,
        [
          'decision/cardTypes/unused',
          'add',
          'customFields',
          JSON.stringify({ name: 'decision/fieldTypes/extra' }),
          '',
        ],
        options,
      );
      expect(added.statusCode).toBe(200);

      const result = await handler.command(
        Cmd.update,
        [
          'decision/cardTypes/unused',
          'remove',
          'customFields',
          JSON.stringify({ name: 'decision/fieldTypes/extra' }),
          '',
        ],
        options,
      );

      expect(result.statusCode).toBe(200);
      expect(result.note).toBeUndefined();
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('recommends clean after a module import and after a module update', async () => {
    const { testDir, handler, options } = await handlerProject(
      'tmp-clean-recommend-modules',
    );
    try {
      // The project's own cards already hold dormant values, so both module
      // operations have something to report.
      const imported = await handler.command(
        Cmd.import,
        ['module', join(testDir, 'valid/minimal')],
        options,
      );
      expect(imported.statusCode).toBe(200);
      expect(imported.note).toContain(RECOMMENDATION);

      const updated = await handler.command(Cmd.updateModules, [], options);
      expect(updated.statusCode).toBe(200);
      expect(updated.note).toContain(RECOMMENDATION);
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('recommends clean after deleting a field type', async () => {
    const { testDir, handler, options } = await handlerProject(
      'tmp-clean-recommend-delete-field-type',
    );
    try {
      // Card types stop declaring the field, so the values its cards stored are
      // left dormant rather than deleted.
      const result = await handler.command(
        Cmd.remove,
        ['fieldType', 'decision/fieldTypes/responsible'],
        options,
      );

      expect(result.statusCode).toBe(200);
      expect(result.note).toMatch(COUNTS);
      expect(result.note).toContain(RECOMMENDATION);
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('does not scan after removing something that leaves no values behind', async () => {
    const { testDir, handler, options } = await handlerProject(
      'tmp-clean-recommend-delete-other',
    );
    try {
      const scan = vi.spyOn(Clean.prototype, 'clean');
      const result = await handler.command(
        Cmd.remove,
        ['label', 'decision_5', 'test'],
        options,
      );

      expect(result.statusCode).toBe(200);
      expect(result.note).toBeUndefined();
      expect(scan).not.toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('a failing scan does not fail the operation', async () => {
    const { testDir, handler, options } = await handlerProject(
      'tmp-clean-recommend-scan-failure',
    );
    try {
      const failingScan = vi
        .spyOn(Clean.prototype, 'clean')
        .mockRejectedValue(new Error('scan failed'));

      const result = await handler.command(
        Cmd.update,
        [
          DECISION,
          'remove',
          'customFields',
          JSON.stringify({ name: 'decision/fieldTypes/responsible' }),
          '',
        ],
        options,
      );

      expect(failingScan).toHaveBeenCalled();
      expect(result.statusCode).toBe(200);
      expect(result.note).toBeUndefined();
    } finally {
      vi.restoreAllMocks();
      rmSync(testDir, { recursive: true, force: true });
    }
  });
});
