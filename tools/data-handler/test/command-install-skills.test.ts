import { expect, it, describe, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Cmd, Commands } from '../src/command-handler.js';

const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-install-skills-tests');

const commandHandler = new Commands();

const skillPath = join(
  testDir,
  '.claude/skills/dynamic-skill-discovery/SKILL.md',
);
const mcpPath = join(testDir, '.mcp.json');
const claudeMdPath = join(testDir, 'CLAUDE.md');

async function readMcp(): Promise<{
  mcpServers?: Record<string, { type?: string; url?: string }>;
  [k: string]: unknown;
}> {
  return JSON.parse(await readFile(mcpPath, 'utf-8'));
}

describe('install-skills command', () => {
  beforeEach(() => {
    rmSync(testDir, { recursive: true, force: true });
    mkdirSync(testDir, { recursive: true });
  });
  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('installs the bootstrap skill, MCP config and CLAUDE.md pointer', async () => {
    const result = await commandHandler.command(
      Cmd.installSkills,
      [testDir],
      {},
    );
    expect(result.statusCode).toBe(200);

    const skill = await readFile(skillPath, 'utf-8');
    expect(skill).toContain('name: dynamic-skill-discovery');
    expect(skill).toContain('# Dynamic Skill Discovery');

    const mcp = await readMcp();
    expect(mcp.mcpServers?.cyberismo).toEqual({
      type: 'http',
      url: 'http://localhost:3000/mcp',
    });

    const claudeMd = await readFile(claudeMdPath, 'utf-8');
    expect(claudeMd).toContain('<!-- cyberismo:begin -->');
    expect(claudeMd).toContain('list_skills');
  });

  it('honors a custom --url', async () => {
    await commandHandler.command(Cmd.installSkills, [testDir], {
      url: 'http://localhost:9999/mcp',
    });
    const mcp = await readMcp();
    expect(mcp.mcpServers?.cyberismo?.url).toBe('http://localhost:9999/mcp');
  });

  it('is idempotent — running twice does not duplicate', async () => {
    await commandHandler.command(Cmd.installSkills, [testDir], {});
    await commandHandler.command(Cmd.installSkills, [testDir], {});

    const mcp = await readMcp();
    // exactly one cyberismo server, still valid JSON
    expect(Object.keys(mcp.mcpServers ?? {})).toEqual(['cyberismo']);

    const claudeMd = await readFile(claudeMdPath, 'utf-8');
    const blocks = claudeMd.match(/<!-- cyberismo:begin -->/g) ?? [];
    expect(blocks).toHaveLength(1);
  });

  it('preserves existing .mcp.json servers and CLAUDE.md content', async () => {
    await writeFile(
      mcpPath,
      JSON.stringify({ mcpServers: { other: { type: 'http', url: 'x' } } }),
      'utf-8',
    );
    await writeFile(claudeMdPath, '# My project\n\nMy own notes.\n', 'utf-8');

    await commandHandler.command(Cmd.installSkills, [testDir], {});

    const mcp = await readMcp();
    expect(mcp.mcpServers?.other).toEqual({ type: 'http', url: 'x' });
    expect(mcp.mcpServers?.cyberismo).toBeDefined();

    const claudeMd = await readFile(claudeMdPath, 'utf-8');
    expect(claudeMd).toContain('My own notes.');
    expect(claudeMd).toContain('<!-- cyberismo:begin -->');
  });

  it('rejects an unsupported target', async () => {
    const result = await commandHandler.command(Cmd.installSkills, [testDir], {
      target: 'github',
    });
    expect(result.statusCode).toBe(400);
    expect(result.message).toMatch(/Unsupported target/);
  });

  it('creates the target directory if it does not exist', async () => {
    const nested = join(testDir, 'repo-root');
    const result = await commandHandler.command(
      Cmd.installSkills,
      [nested],
      {},
    );
    expect(result.statusCode).toBe(200);
    const mcp = JSON.parse(await readFile(join(nested, '.mcp.json'), 'utf-8'));
    expect(mcp.mcpServers.cyberismo).toBeDefined();
  });

  it('reports failure when .mcp.json cannot be written', async () => {
    // Make .mcp.json a directory so writeFile fails deterministically (EISDIR),
    // and verify the failure is surfaced instead of reported as success.
    mkdirSync(mcpPath, { recursive: true });
    const result = await commandHandler.command(
      Cmd.installSkills,
      [testDir],
      {},
    );
    expect(result.statusCode).not.toBe(200);
  });
});
