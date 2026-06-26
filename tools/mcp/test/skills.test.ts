/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026

  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.

  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { beforeAll, afterAll, describe, expect, test } from 'vitest';
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { CommandManager } from '@cyberismo/data-handler';
import { createMcpServer, singleProjectProvider } from '../src/server.js';
import { testDataPath } from './test-utils.js';

const baseDir = import.meta.dirname;
const projectPath = join(baseDir, 'tmp-skills-mcp');
const skillsFolder = join(projectPath, '.cards/local/skills');
const calcFolder = join(projectPath, '.cards/local/calculations');

let commands: CommandManager;
let client: Client;

type TextContent = { type: string; text: string };
const parse = (result: Record<string, unknown>) =>
  JSON.parse((result.content as TextContent[])[0].text);

async function seedSkill(
  id: string,
  { query = '', content = `# ${id}\n`, relatedTools = [] as string[] } = {},
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
    }),
    'utf-8',
  );
  await writeFile(join(skillsFolder, id, 'skill.md'), content, 'utf-8');
  await writeFile(join(skillsFolder, id, 'query.lp'), query, 'utf-8');
}

beforeAll(async () => {
  process.argv = [];
  await rm(projectPath, { recursive: true, force: true });
  await cp(testDataPath, projectPath, { recursive: true });

  await seedSkill('globalSkill', {
    relatedTools: ['query_cards'],
    content: '# Global skill\nUse this any time.\n',
  });
  await seedSkill('cardSkill', {
    query: 'result({{cardKey}}).\n',
    content: '# Card skill\nApplies to {{cardKey}}.\n',
  });
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
  await writeFile(
    join(calcFolder, 'enable', 'calculation.lp'),
    'enableSkill("decision/skills/globalSkill").\n' +
      'enableSkill("decision/skills/cardSkill", decision_5).\n',
    'utf-8',
  );

  commands = await CommandManager.getInstance(projectPath);
  const server = createMcpServer(singleProjectProvider(commands));
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  client = new Client({ name: 'test-client', version: '1.0.0' });
  await client.connect(clientTransport);
});

afterAll(async () => {
  await client.close();
  commands.project.dispose();
  await rm(projectPath, { recursive: true, force: true });
});

describe('skill discovery MCP tools', () => {
  test('list_skills returns enabled skills', async () => {
    const result = await client.callTool({
      name: 'list_skills',
      arguments: { projectPrefix: 'decision' },
    });
    expect(result.isError).toBeFalsy();
    const parsed = parse(result);
    const names = parsed.skills.map((s: { name: string }) => s.name);
    expect(names).toContain('decision/skills/globalSkill');
    expect(names).toContain('decision/skills/cardSkill');
    const global = parsed.skills.find(
      (s: { name: string }) => s.name === 'decision/skills/globalSkill',
    );
    expect(global.relatedTools).toEqual(['query_cards']);
    expect(global.scope).toBe('global');
    const card = parsed.skills.find(
      (s: { name: string }) => s.name === 'decision/skills/cardSkill',
    );
    expect(card.scope).toBe('card');
  });

  test('list_skills with cardKey excludes other cards’ skills', async () => {
    const result = await client.callTool({
      name: 'list_skills',
      arguments: { projectPrefix: 'decision', cardKey: 'decision_1' },
    });
    const names = parse(result).skills.map((s: { name: string }) => s.name);
    expect(names).toContain('decision/skills/globalSkill');
    expect(names).not.toContain('decision/skills/cardSkill');
  });

  test('get_skill renders a globally-enabled skill', async () => {
    const result = await client.callTool({
      name: 'get_skill',
      arguments: {
        projectPrefix: 'decision',
        name: 'decision/skills/globalSkill',
      },
    });
    expect(result.isError).toBeFalsy();
    const parsed = parse(result);
    expect(parsed.skill.instructions).toContain('Use this any time.');
  });

  test('get_skill renders a per-card skill with the cardKey', async () => {
    const result = await client.callTool({
      name: 'get_skill',
      arguments: {
        projectPrefix: 'decision',
        name: 'decision/skills/cardSkill',
        cardKey: 'decision_5',
      },
    });
    const parsed = parse(result);
    expect(parsed.skill.instructions).toContain('Applies to decision_5.');
  });

  test('get_skill asks for a cardKey for a per-card skill', async () => {
    const result = await client.callTool({
      name: 'get_skill',
      arguments: {
        projectPrefix: 'decision',
        name: 'decision/skills/cardSkill',
      },
    });
    expect(result.isError).toBeFalsy();
    const parsed = parse(result);
    expect(parsed.enabled).toBe(true);
    expect(parsed.message).toMatch(/cardKey/);
  });

  test('get_skill reports a not-enabled skill without erroring', async () => {
    const result = await client.callTool({
      name: 'get_skill',
      arguments: { projectPrefix: 'decision', name: 'decision/skills/nope' },
    });
    expect(result.isError).toBeFalsy();
    const parsed = parse(result);
    expect(parsed.enabled).toBe(false);
    expect(parsed.message).toMatch(/not currently enabled/);
  });
});
