import { expect, it, describe, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

import { CommandManager } from '../src/command-manager.js';
import { copyDir } from '../src/utils/file-utils.js';
import { resourceName } from '../src/utils/resource-utils.js';

import type { Operation } from '../src/resources/resource-object.js';
import type { Skill } from '../src/interfaces/resource-interfaces.js';

const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-skill-edit-tests');
const projectPath = join(testDir, 'valid/decision-records');

const SKILL = 'decision/skills/riskRegister';

describe('edit skill', () => {
  let commands: CommandManager;

  beforeEach(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data/', testDir);
    commands = new CommandManager(projectPath, {
      autoSaveConfiguration: false,
    });
    await commands.initialize();
    await commands.createCmd.createSkill(SKILL);
  });

  afterEach(() => {
    commands.project.dispose();
    rmSync(testDir, { recursive: true, force: true });
  });

  // Reads the stored metadata back through the same path the app uses.
  async function relatedTools(): Promise<string[]> {
    const skill = (await commands.showCmd.showResource(SKILL)) as Skill;
    return skill.relatedTools;
  }

  async function edit(operation: Operation<string>) {
    await commands.updateCmd.apply({
      kind: 'edit',
      target: resourceName(SKILL),
      updateKey: { key: 'relatedTools' },
      operation,
    });
  }

  it('starts with an empty relatedTools list', async () => {
    expect(await relatedTools()).toEqual([]);
  });

  it('adds related tools', async () => {
    await edit({ name: 'add', target: 'query_cards' });
    await edit({ name: 'add', target: 'update_card' });
    expect(await relatedTools()).toEqual(['query_cards', 'update_card']);
  });

  it('rejects adding a tool that is already listed', async () => {
    await edit({ name: 'add', target: 'query_cards' });
    await expect(edit({ name: 'add', target: 'query_cards' })).rejects.toThrow(
      /already exists/,
    );
    expect(await relatedTools()).toEqual(['query_cards']);
  });

  it('changes a related tool', async () => {
    await edit({ name: 'add', target: 'query_cards' });
    await edit({ name: 'change', target: 'query_cards', to: 'create_card' });
    expect(await relatedTools()).toEqual(['create_card']);
  });

  it('removes a related tool', async () => {
    await edit({ name: 'add', target: 'query_cards' });
    await edit({ name: 'add', target: 'update_card' });
    await edit({ name: 'remove', target: 'query_cards' });
    expect(await relatedTools()).toEqual(['update_card']);
  });

  it('keeps the project valid after editing relatedTools', async () => {
    await edit({ name: 'add', target: 'query_cards' });
    const errors = await commands.validateCmd.validate(
      projectPath,
      () => commands.project,
    );
    expect(errors).toBe('');
  });

  it('still rejects a property the skill does not own', async () => {
    const skill = commands.project.resources.byType(SKILL, 'skills');
    await expect(
      skill.update({ key: 'notASkillProperty' }, { name: 'add', target: 'x' }),
    ).rejects.toThrow(
      /Unknown property 'notASkillProperty' for folder resource/,
    );
  });
});
