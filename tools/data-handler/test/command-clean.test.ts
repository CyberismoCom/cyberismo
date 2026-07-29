// testing
import { expect, it, describe, beforeAll, afterAll, vi } from 'vitest';
import { join } from 'node:path';
import { mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';

import { copyDir } from '../src/utils/file-utils.js';
import { CommandManager } from '../src/command-manager.js';
import type { Clean } from '../src/commands/clean.js';

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
    commands = new CommandManager(decisionRecordsPath, {
      autoSaveConfiguration: false,
    });
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

    const freshCommands = new CommandManager(projectPath, {
      autoSaveConfiguration: false,
    });
    await freshCommands.initialize();
    return { freshTestDir, freshCommands };
  }

  async function storeValue(
    manager: CommandManager,
    cardKey: string,
    field: string,
    value: string,
  ) {
    const card = manager.project.findCard(cardKey);
    card.metadata![field] = value;
    await manager.project.updateCardMetadata(card, card.metadata!);
  }

  it('dry-run reports null-valued custom fields without writing', async () => {
    const { freshTestDir, freshCommands } =
      await freshProject('tmp-clean-dry-run');
    try {
      const card = freshCommands.project.findCard('decision_6');
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
      for (const card of freshCommands.project.cards()) {
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
      commands.project.findCard('decision_6').metadata!,
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
      commands.project.findCard('decision_6').metadata!,
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

      const cleaned = freshCommands.project.findCard('decision_6');
      expect(cleaned.metadata!).not.toHaveProperty([GHOST]);
      expect(cleaned.metadata![OBSOLETED_BY]).toBe('decision_5');
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
        freshCommands.project.findCard('decision_6').path,
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
        freshCommands.project.findCard('decision_6').path,
        'index.json',
      );
      const before = readFileSync(failingFile, 'utf-8');
      const templateCard = freshCommands.project
        .templateCards('decision/templates/decision')
        .at(0)!;
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
    const importing = new CommandManager(join(moduleTestDir, 'valid/minimal'), {
      autoSaveConfiguration: false,
    });
    await importing.initialize();
    try {
      // The imported project's template card carries null placeholders.
      await importing.importCmd.importModule(
        join(moduleTestDir, 'valid/decision-records'),
      );
      const moduleCards = importing.project
        .allTemplateCards()
        .filter((card) => card.path.includes(join('.cards', 'modules')));
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
    const templateCard = commands.project
      .templateCards('decision/templates/decision')
      .at(0)!;
    await storeValue(commands, templateCard.key, GHOST, 'stale');

    const result = await cleanCmd.clean(false);

    expect(result.findings).toContainEqual({
      cardKey: templateCard.key,
      field: GHOST,
      reason: 'undeclared',
    });
    expect(
      commands.project.findCard(templateCard.key).metadata!,
    ).not.toHaveProperty([GHOST]);
  });

  it('never touches predefined fields', async () => {
    await cleanCmd.clean(false);

    const card = commands.project.findCard('decision_6');
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
      const card = commands.project.findCard(finding.cardKey);
      expect(card.metadata!.cardType).toBe('decision/cardTypes/simplepage');
    }
  });
});
