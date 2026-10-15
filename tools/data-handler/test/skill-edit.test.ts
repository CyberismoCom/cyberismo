import { expect, it, describe, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

import { type Workspace } from '../src/api/workspace/workspace.js';
import { copyDir } from '../src/shared/utils/file-utils.js';
import { resourceName } from '../src/shared/utils/resource-utils.js';

import type { Operation, Skill } from '@cyberismo/model';
import { openTestWorkspace } from './helpers/open-test-workspace.js';
import { Validate } from '../src/domain/commands/validate.js';
import { checkoutOf } from '../src/infra/internal.js';

const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-skill-edit-tests');
const projectPath = join(testDir, 'valid/decision-records');

const SKILL = 'decision/skills/riskRegister';

describe('edit skill', () => {
  let ws: Workspace;

  beforeEach(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data/', testDir);
    ws = await openTestWorkspace(projectPath, {
      autoSaveConfiguration: false,
    });
    await ws.resources.create(SKILL, 'skills', {});
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  // Reads the stored metadata back through the same path the app uses.
  async function relatedTools(): Promise<string[]> {
    const skill = (await ws.resources.show(SKILL)) as Skill;
    return skill.relatedTools;
  }

  async function edit(operation: Operation<string>) {
    await ws.changes.apply({
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
    const errors = await Validate.getInstance().validate(projectPath, () =>
      checkoutOf(ws),
    );
    expect(errors).toBe('');
  });

  it('still rejects a property the skill does not own', async () => {
    const skill = checkoutOf(ws).resources.byType(SKILL, 'skills');
    await expect(
      skill.update({ key: 'notASkillProperty' }, { name: 'add', target: 'x' }),
    ).rejects.toThrow(
      /Unknown property 'notASkillProperty' for folder resource/,
    );
  });
});
