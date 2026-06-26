import { expect, it, describe, beforeAll, afterAll } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { CommandManager } from '../src/command-manager.js';
import { copyDir } from '../src/utils/file-utils.js';

const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-skill-discovery-tests');
const projectPath = join(testDir, 'valid/decision-records');
const skillsFolder = join(projectPath, '.cards/local/skills');
const calcFolder = join(projectPath, '.cards/local/calculations');

async function seedSkill(
  id: string,
  {
    query = '',
    content = `# ${id}\n`,
    category,
    relatedTools = [],
  }: {
    query?: string;
    content?: string;
    category?: string;
    relatedTools?: string[];
  } = {},
) {
  await mkdir(join(skillsFolder, id), { recursive: true });
  await writeFile(
    join(skillsFolder, '.schema'),
    JSON.stringify([{ version: 1, id: 'skillSchema' }]),
    'utf-8',
  );
  await writeFile(
    join(skillsFolder, `${id}.json`),
    JSON.stringify({
      name: `decision/skills/${id}`,
      displayName: id,
      relatedTools,
      ...(category ? { category } : {}),
    }),
    'utf-8',
  );
  await writeFile(join(skillsFolder, id, 'skill.md'), content, 'utf-8');
  await writeFile(join(skillsFolder, id, 'query.lp'), query, 'utf-8');
}

async function seedEnableCalc(lp: string) {
  await mkdir(join(calcFolder, 'enable'), { recursive: true });
  await writeFile(
    join(calcFolder, 'enable.json'),
    JSON.stringify({
      name: 'decision/calculations/enable',
      displayName: 'enable',
      calculation: '',
    }),
    'utf-8',
  );
  await writeFile(join(calcFolder, 'enable', 'calculation.lp'), lp, 'utf-8');
}

describe('skill discovery', () => {
  let commands: CommandManager;

  beforeAll(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data/', testDir);
    await seedSkill('globalSkill', {
      category: 'general',
      relatedTools: ['query_cards', 'update_card'],
      content: '# Global skill\nUse this any time.\n',
    });
    await seedSkill('complianceSkill', {
      category: 'compliance',
      content: '# Compliance skill\n',
    });
    await seedSkill('cardSkill', {
      query: 'result({{cardKey}}).\n',
      content: '# Card skill\nApplies to {{cardKey}}.\n',
    });
    await seedEnableCalc(
      'enableSkill("decision/skills/globalSkill").\n' +
        'enableSkill("decision/skills/complianceSkill").\n' +
        'enableSkill("decision/skills/cardSkill", decision_5).\n',
    );
    commands = await CommandManager.getInstance(projectPath);
  });

  afterAll(() => {
    commands.project.dispose();
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('enabledSkills query round-trip', () => {
    it('returns string skill-name keys (global + all per-card) without a cardKey', async () => {
      const keys = (
        await commands.project.calculationEngine.runQuery('enabledSkills')
      ).map((r) => r.key);
      expect(keys).toContain('decision/skills/globalSkill');
      expect(keys).toContain('decision/skills/cardSkill');
    });

    it('with a non-matching cardKey excludes per-card skills', async () => {
      const keys = (
        await commands.project.calculationEngine.runQuery(
          'enabledSkills',
          'localApp',
          { cardKey: 'decision_1' },
        )
      ).map((r) => r.key);
      expect(keys).toContain('decision/skills/globalSkill');
      expect(keys).not.toContain('decision/skills/cardSkill');
    });
  });

  describe('listSkills', () => {
    it('without a cardKey lists all enabled skills (global + per-card)', async () => {
      const names = (await commands.showCmd.listSkills()).map((s) => s.name);
      expect(names).toEqual([
        'decision/skills/cardSkill',
        'decision/skills/complianceSkill',
        'decision/skills/globalSkill',
      ]);
    });

    it('with a cardKey lists global skills plus that card’s skills', async () => {
      const names = (
        await commands.showCmd.listSkills({ cardKey: 'decision_1' })
      ).map((s) => s.name);
      expect(names).toContain('decision/skills/globalSkill');
      expect(names).toContain('decision/skills/complianceSkill');
      expect(names).not.toContain('decision/skills/cardSkill');
    });

    it('filters by category', async () => {
      const skills = await commands.showCmd.listSkills({
        category: 'compliance',
      });
      expect(skills.map((s) => s.name)).toEqual([
        'decision/skills/complianceSkill',
      ]);
    });

    it('returns the lightweight summary fields', async () => {
      const global = (await commands.showCmd.listSkills()).find(
        (s) => s.name === 'decision/skills/globalSkill',
      );
      expect(global).toMatchObject({
        displayName: 'globalSkill',
        category: 'general',
        relatedTools: ['query_cards', 'update_card'],
        scope: 'global',
      });
      // listing is lightweight — no rendered instructions
      expect(global).not.toHaveProperty('instructions');
    });

    it('marks each skill global or card scope', async () => {
      const byName = new Map(
        (await commands.showCmd.listSkills()).map((s) => [s.name, s.scope]),
      );
      expect(byName.get('decision/skills/globalSkill')).toBe('global');
      expect(byName.get('decision/skills/cardSkill')).toBe('card');
    });
  });

  describe('getSkill', () => {
    it('renders a globally-enabled skill', async () => {
      const result = await commands.showCmd.getSkill(
        'decision/skills/globalSkill',
      );
      expect(result.status).toBe('ok');
      if (result.status !== 'ok') return;
      expect(result.skill.instructions).toContain('Use this any time.');
      expect(result.skill.relatedTools).toEqual(['query_cards', 'update_card']);
    });

    it('renders a per-card skill with the cardKey interpolated', async () => {
      const result = await commands.showCmd.getSkill(
        'decision/skills/cardSkill',
        { cardKey: 'decision_5' },
      );
      expect(result.status).toBe('ok');
      if (result.status !== 'ok') return;
      expect(result.skill.instructions).toContain('Applies to decision_5.');
    });

    it('asks for a cardKey when a per-card skill is requested without one', async () => {
      const result = await commands.showCmd.getSkill(
        'decision/skills/cardSkill',
      );
      expect(result.status).toBe('needs-card');
    });

    it('reports not-enabled for a per-card skill requested with the wrong card', async () => {
      const result = await commands.showCmd.getSkill(
        'decision/skills/cardSkill',
        { cardKey: 'decision_1' },
      );
      expect(result.status).toBe('not-enabled');
    });

    it('reports not-enabled for an unknown skill', async () => {
      const result = await commands.showCmd.getSkill(
        'decision/skills/doesNotExist',
      );
      expect(result.status).toBe('not-enabled');
    });
  });
});
