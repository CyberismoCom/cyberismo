// testing
import { expect, it, describe, beforeAll, afterAll } from 'vitest';

// node
import { access } from 'node:fs/promises';
import { constants as fsConstants, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

// cyberismo
import { Cmd, Commands } from '../src/command-handler.js';
import { copyDir } from '../src/utils/file-utils.js';
import { generateReportContent } from '../src/utils/report.js';

import type { CreateCommandOptions } from '../src/interfaces/command-options.js';

// Create test artifacts in a temp folder.
const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-command-handler-skill-tests');

const minimalPath = join(testDir, 'valid/minimal');

const commandHandler: Commands = new Commands();
const optionsMini: CreateCommandOptions = { projectPath: minimalPath };

// Helper to get current number of skills.
async function skillCount(): Promise<number> {
  const resources = await commandHandler.command(
    Cmd.show,
    ['skills'],
    optionsMini,
  );
  return resources.payload ? (resources.payload as object[]).length : 0;
}

describe('skill command', () => {
  beforeAll(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data', testDir);
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('create skill (success)', async () => {
    const before = await skillCount();
    const result = await commandHandler.command(
      Cmd.create,
      ['skill', 'skill-name'],
      optionsMini,
    );
    expect(result.statusCode).toBe(200);
    expect(before + 1).toBe(await skillCount());

    // Default content files are copied into the skill folder.
    const skillFolder = join(minimalPath, '.cards/local/skills/skill-name');
    await expect(
      access(join(skillFolder, 'skill.md'), fsConstants.F_OK),
    ).resolves.toBeUndefined();
    await expect(
      access(join(skillFolder, 'query.lp'), fsConstants.F_OK),
    ).resolves.toBeUndefined();
  });

  it('create skill with full name (success)', async () => {
    const before = await skillCount();
    const result = await commandHandler.command(
      Cmd.create,
      ['skill', 'mini/skills/another-skill'],
      optionsMini,
    );
    expect(result.statusCode).toBe(200);
    expect(before + 1).toBe(await skillCount());
  });

  it('create skill and validate the project', async () => {
    const result = await commandHandler.command(
      Cmd.create,
      ['skill', 'skill-to-validate'],
      optionsMini,
    );
    expect(result.statusCode).toBe(200);
    const validation = await commandHandler.command(
      Cmd.validate,
      [],
      optionsMini,
    );
    expect(validation.statusCode).toBe(200);
    expect(validation.message).toBe('Project structure validated');
  });

  it('show a single skill', async () => {
    const result = await commandHandler.command(
      Cmd.show,
      ['skill', 'mini/skills/skill-name'],
      optionsMini,
    );
    expect(result.statusCode).toBe(200);
    expect(result.payload).toBeDefined();
  });

  it('try to create skill with same name', async () => {
    await commandHandler.command(
      Cmd.create,
      ['skill', 'duplicate-skill'],
      optionsMini,
    );
    const result = await commandHandler.command(
      Cmd.create,
      ['skill', 'duplicate-skill'],
      optionsMini,
    );
    expect(result.statusCode).toBe(400);
  });

  it('remove skill (success)', async () => {
    await commandHandler.command(
      Cmd.create,
      ['skill', 'skill-to-remove'],
      optionsMini,
    );
    const before = await skillCount();
    const result = await commandHandler.command(
      Cmd.remove,
      ['skill', 'mini/skills/skill-to-remove'],
      optionsMini,
    );
    expect(result.statusCode).toBe(200);
    expect(before - 1).toBe(await skillCount());
  });

  it('renders a content-only skill without running a query', async () => {
    // A skill with an empty query must not invoke the logic program engine.
    const calculate = {
      runLogicProgram: () => {
        throw new Error('logic program should not run for an empty query');
      },
    };
    const rendered = await generateReportContent({
      // Only runLogicProgram is used by generateReportContent.
      calculate: calculate as never,
      contentTemplate: '# {{title}}\n\nApplies to {{cardKey}}.',
      queryTemplate: '',
      options: { title: 'Risk register', cardKey: 'mini_1' },
      context: 'localApp',
    });
    expect(rendered).toContain('# Risk register');
    expect(rendered).toContain('Applies to mini_1.');
  });
});
