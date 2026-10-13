// testing
import { expect, it, describe, beforeAll, afterAll, vi } from 'vitest';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  appendFileSync,
  mkdirSync,
  rmSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';

import { copyDir } from '../src/utils/file-utils.js';
import { type Workspace } from '../src/workspace/workspace.js';
import { Cmd, Commands } from '../src/command-handler.js';
import type { Clean } from '../src/clean/clean.js';
import { Checkout } from '../src/containers/project.js';
import { openTestWorkspace } from './helpers/open-test-workspace.js';
import { updateCardMetadata } from '../src/cards/update.js';
import { allTemplateCards, findCard } from '../src/cards/read.js';
import { buildProject } from './helpers/project-builder.js';

const GHOST = 'decision/fieldTypes/ghost';
const OBSOLETED_BY = 'decision/fieldTypes/obsoletedBy';

describe('clean command', () => {
  const baseDir = import.meta.dirname;
  const testDir = join(baseDir, 'tmp-clean-tests');
  const decisionRecordsPath = join(testDir, 'valid/decision-records');
  let ws: Workspace;
  let clean: Clean;

  beforeAll(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data/', testDir);
    ws = await openTestWorkspace(decisionRecordsPath, {});
    clean = ws.clean;
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

    const freshCommands = await openTestWorkspace(projectPath, {});
    return { freshTestDir, freshCommands };
  }

  async function storeValue(
    manager: Workspace,
    cardKey: string,
    field: string,
    value: string,
  ) {
    const card = findCard(manager.checkout, cardKey);
    card.metadata![field] = value;
    await updateCardMetadata(manager.checkout, card, card.metadata!);
  }

  it('dry-run reports null-valued custom fields without writing', async () => {
    const { freshTestDir, freshCommands } =
      await freshProject('tmp-clean-dry-run');
    try {
      const card = findCard(freshCommands.checkout, 'decision_6');
      const file = join(card.path, 'index.json');
      const before = readFileSync(file, 'utf-8');

      const result = await freshCommands.clean.run(true);

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
      const result = await freshCommands.clean.run(false);

      expect(result.findings.length).toBeGreaterThan(0);
      for (const card of freshCommands.checkout.cardTree.cards()) {
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
    await storeValue(ws, 'decision_6', GHOST, 'stale');

    const result = await clean.run(false);

    expect(result.findings).toContainEqual({
      cardKey: 'decision_6',
      field: GHOST,
      reason: 'undeclared',
    });
    expect(findCard(ws.checkout, 'decision_6').metadata!).not.toHaveProperty([
      GHOST,
    ]);
  });

  it('removes stored values on calculated fields without override', async () => {
    await storeValue(ws, 'decision_6', OBSOLETED_BY, 'stale');

    const result = await clean.run(false);

    expect(result.findings).toContainEqual({
      cardKey: 'decision_6',
      field: OBSOLETED_BY,
      reason: 'calculated-locked',
    });
    expect(findCard(ws.checkout, 'decision_6').metadata!).not.toHaveProperty([
      OBSOLETED_BY,
    ]);
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

      const result = await freshCommands.clean.run(false);

      expect(result.skippedCards).not.toContain('decision_6');
      expect(result.findings).toContainEqual({
        cardKey: 'decision_6',
        field: GHOST,
        reason: 'undeclared',
      });
      expect(result.findings.every((f) => f.field !== OBSOLETED_BY)).toBe(true);

      const cleaned = findCard(freshCommands.checkout, 'decision_6');
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
      freshCommands.checkout.lock.onAfterWrite(afterWrite);

      await freshCommands.clean.run(true);
      expect(afterWrite).not.toHaveBeenCalled();

      // A read lock is reentrant from a read context; a write lock throws.
      const nested = await freshCommands.checkout.lock.read(() =>
        freshCommands.clean.run(true),
      );
      expect(nested.findings.length).toBeGreaterThan(0);
      expect(afterWrite).not.toHaveBeenCalled();

      await freshCommands.clean.run(false);
      expect(afterWrite).toHaveBeenCalled();
    } finally {
      rmSync(freshTestDir, { recursive: true, force: true });
    }
  });

  it('a dry run under autocommit leaves HEAD and a dirty cardRoot alone', async () => {
    const project = await buildProject({
      git: true,
      cards: [{ title: 'Alpha' }],
    });
    const handle = await openTestWorkspace(project.path, { autocommit: true });
    const git = (...args: string[]) =>
      execFileSync('git', args, { cwd: project.path, encoding: 'utf8' });
    try {
      const card = findCard(handle.checkout, project.keys[0]);
      appendFileSync(
        join(card.path, Checkout.cardContentFile),
        '\nAn uncommitted edit.\n',
      );
      const head = git('rev-parse', 'HEAD');
      const status = git('status', '--porcelain');
      expect(status).not.toBe('');

      await handle.clean.run(true);

      expect(git('rev-parse', 'HEAD')).toBe(head);
      expect(git('status', '--porcelain')).toBe(status);
    } finally {
      handle.checkout.dispose();
      await project.cleanup();
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
        findCard(freshCommands.checkout, 'decision_6').path,
        'index.json',
      );
      const before = readFileSync(cardFile, 'utf-8');

      const result = await freshCommands.clean.run(false);

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
        findCard(freshCommands.checkout, 'decision_6').path,
        'index.json',
      );
      const before = readFileSync(failingFile, 'utf-8');
      const templateCard = freshCommands.checkout
        .templateTree('decision/templates/decision')
        .cards()
        .at(0)!;
      const templateFile = join(templateCard.path, 'index.json');

      // Project cards are visited first, and decision_6 is the only one with
      // removals, so the single rejection lands on it.
      chmodSync(failingFile, 0o444);
      let result: Awaited<ReturnType<Clean['run']>>;
      try {
        result = await freshCommands.clean.run(false);
      } finally {
        chmodSync(failingFile, 0o644);
      }

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
    const importing = await openTestWorkspace(
      join(moduleTestDir, 'valid/minimal'),
      {},
    );
    try {
      // The imported project's template card carries null placeholders.
      await importing.modulesCmd.install(
        join(moduleTestDir, 'valid/decision-records'),
      );
      const moduleCards = allTemplateCards(importing.checkout).filter((card) =>
        card.path.includes(join('.cards', 'modules')),
      );
      expect(moduleCards.length).toBeGreaterThan(0);
      const moduleFiles = moduleCards.map((card) =>
        join(card.path, 'index.json'),
      );
      const before = moduleFiles.map((file) => readFileSync(file, 'utf-8'));
      expect(before.some((content) => content.includes('null'))).toBe(true);

      const result = await importing.clean.run(false);

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
    const templateCard = ws.checkout
      .templateTree('decision/templates/decision')
      .cards()
      .at(0)!;
    await storeValue(ws, templateCard.key, GHOST, 'stale');

    const result = await clean.run(false);

    expect(result.findings).toContainEqual({
      cardKey: templateCard.key,
      field: GHOST,
      reason: 'undeclared',
    });
    expect(
      findCard(ws.checkout, templateCard.key).metadata!,
    ).not.toHaveProperty([GHOST]);
  });

  it('never touches predefined fields', async () => {
    await clean.run(false);

    const card = findCard(ws.checkout, 'decision_6');
    expect(card.metadata!.title).toBeDefined();
    expect(card.metadata!.cardType).toBe('decision/cardTypes/decision');
    expect(card.metadata!.workflowState).toBeDefined();
  });

  it('cardType filter scopes the scan', async () => {
    await storeValue(ws, 'decision_5', GHOST, 'stale');
    await storeValue(ws, 'decision_6', GHOST, 'stale');

    const result = await clean.run(true, 'decision/cardTypes/simplepage');

    expect(result.findings).toContainEqual({
      cardKey: 'decision_5',
      field: GHOST,
      reason: 'undeclared',
    });
    expect(result.findings.every((f) => f.cardKey !== 'decision_6')).toBe(true);
    for (const finding of result.findings) {
      const card = findCard(ws.checkout, finding.cardKey);
      expect(card.metadata!.cardType).toBe('decision/cardTypes/simplepage');
    }
  });
});

describe('clean recommendation', () => {
  const baseDir = import.meta.dirname;
  const RECOMMENDATION = "'cyberismo clean' to remove them";

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
});
