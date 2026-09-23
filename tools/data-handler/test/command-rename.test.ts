// testing
import { expect, it, describe, beforeEach, afterEach } from 'vitest';

// node
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// cyberismo
import { copyDir } from '../src/utils/file-utils.js';
import { Cmd, Commands } from '../src/command-handler.js';
import { ConfigurationLogger } from '../src/utils/configuration-logger.js';
import { errorFunction } from '../src/utils/error-utils.js';

// Create test artifacts in a temp folder.
const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-command-handler-rename-tests');

const decisionRecordsPath = join(testDir, 'valid/decision-records');
const commandHandler: Commands = new Commands();
const options = { projectPath: decisionRecordsPath };
const minimalPath = join(testDir, 'valid/minimal');
const optionsMini = { projectPath: minimalPath };

describe('rename command', () => {
  beforeEach(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data', testDir);
  });

  afterEach(() => {
    rmSync(testDir, { force: true, recursive: true });
  });

  it('rename project (success)', async () => {
    const newName = 'decrec';
    let result = await commandHandler.command(Cmd.rename, [newName], options);
    expect(result.statusCode).toBe(200);
    result = await commandHandler.command(Cmd.validate, [], options);
    expect(result.statusCode).toBe(200);
  });
  it('rename project - no cards at all (success)', async () => {
    const newName = 'empty';
    const result = await commandHandler.command(
      Cmd.rename,
      [newName],
      optionsMini,
    );
    expect(result.statusCode).toBe(200);
  });
  it('try to rename project - invalid "to" ', async () => {
    const newName = 'decrec_2';
    const result = await commandHandler.command(Cmd.rename, [newName], options);
    expect(result.statusCode).toBe(400);
  });
});

describe('rename attempts - test data is not cleaned', () => {
  it('try to rename project - path missing or invalid', async () => {
    const invalidProject = { projectPath: 'idontexist' };
    const newName = 'decrec';
    const result = await commandHandler.command(
      Cmd.rename,
      [newName],
      invalidProject,
    );
    expect(result.statusCode).toBe(400);
  });
  it('try to rename project - "to" missing', async () => {
    const newName = '';
    await commandHandler
      .command(Cmd.rename, [newName], options)
      .catch((error) =>
        expect(errorFunction(error)).toBe(
          "Input validation error: empty 'to' is not allowed",
        ),
      );
  });
});

// The CommandManager is a process-wide singleton keyed by project path, so
// these tests each work on their own copy rather than sharing one.
describe('rename is an authoring helper, not a migratable change', () => {
  const renameDir = join(baseDir, 'tmp-command-handler-rename-helper-tests');
  let projectPath: string;

  beforeEach(async () => {
    projectPath = join(renameDir, `proj-${Date.now()}-${Math.random()}`);
    mkdirSync(projectPath, { recursive: true });
    await copyDir('test/test-data/valid/decision-records', projectPath);
  });
  afterEach(() => {
    rmSync(renameDir, { force: true, recursive: true });
  });

  it('renames attachments whose file name carries the old prefix', async () => {
    await writeFile(
      join(projectPath, 'cardRoot', 'decision_5', 'a', 'decision.png'),
      'fake-image',
    );

    const result = await new Commands().command(Cmd.rename, ['decrec'], {
      projectPath,
    });
    expect(result.statusCode).toBe(200);

    const attachments = join(projectPath, 'cardRoot', 'decrec_5', 'a');
    expect(existsSync(join(attachments, 'decrec.png'))).toBe(true);
    expect(existsSync(join(attachments, 'decision.png'))).toBe(false);
  });

  it('records no configuration log entry', async () => {
    // The prefix is the project's identity: a rename is an authoring helper,
    // not a change a consumer can migrate, so nothing is logged for replay.
    const before = await ConfigurationLogger.entries(projectPath);

    const result = await new Commands().command(Cmd.rename, ['decrec'], {
      projectPath,
    });
    expect(result.statusCode).toBe(200);

    expect(await ConfigurationLogger.entries(projectPath)).toEqual(before);
  });

  it('refuses once the project has published a version', async () => {
    const configPath = join(projectPath, '.cards', 'local', 'cardsConfig.json');
    const config = JSON.parse(await readFile(configPath, 'utf-8'));
    await writeFile(
      configPath,
      JSON.stringify({ ...config, version: '1.2.0' }, null, 2),
    );

    const result = await new Commands().command(Cmd.rename, ['decrec'], {
      projectPath,
    });
    expect(result.statusCode).toBe(400);
    expect(result.message).toContain('version 1.2.0 was published');
    expect(result.message).toContain("'cyberismo rename decrec --force'");

    // Nothing moved: the original prefix survives on disk.
    expect(existsSync(join(projectPath, 'cardRoot', 'decision_5'))).toBe(true);
    expect(JSON.parse(await readFile(configPath, 'utf-8')).cardKeyPrefix).toBe(
      'decision',
    );
  });

  it('--force renames a published project and says it is now a new module', async () => {
    const configPath = join(projectPath, '.cards', 'local', 'cardsConfig.json');
    const config = JSON.parse(await readFile(configPath, 'utf-8'));
    await writeFile(
      configPath,
      JSON.stringify({ ...config, version: '1.2.0' }, null, 2),
    );
    const before = await ConfigurationLogger.entries(projectPath);

    const result = await new Commands().command(Cmd.rename, ['decrec'], {
      projectPath,
      force: true,
    });
    expect(result.statusCode).toBe(200);
    expect(result.note).toContain('Version 1.2.0 was published');
    expect(result.note).toContain('new module');

    expect(existsSync(join(projectPath, 'cardRoot', 'decrec_5'))).toBe(true);
    const after = JSON.parse(await readFile(configPath, 'utf-8'));
    expect(after.cardKeyPrefix).toBe('decrec');
    // History is kept: the version and the log are the author's record.
    expect(after.version).toBe('1.2.0');
    expect(await ConfigurationLogger.entries(projectPath)).toEqual(before);
  });
});
