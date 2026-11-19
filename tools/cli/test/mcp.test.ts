// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

// `cyberismo mcp`: the built binary serves the MCP server over stdio, as an
// MCP client such as Claude Code starts it.

import { execFile, spawn } from 'node:child_process';
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  buildProject,
  type BuiltProject,
} from '../../data-handler/test/helpers/project-builder.js';

const bin = join(import.meta.dirname, '..', 'bin', 'run');
const run = promisify(execFile);

let project: BuiltProject;
let configDir: string;
let env: Record<string, string>;
let transport: StdioClientTransport;
let client: Client;
let stderr: string;

// The text of a tool result, parsed as JSON.
async function call(name: string, args: Record<string, unknown> = {}) {
  const result = await client.callTool({ name, arguments: args });
  const [content] = result.content as { type: string; text: string }[];
  return { isError: result.isError, data: JSON.parse(content.text) };
}

describe('mcp', () => {
  beforeEach(async () => {
    project = await buildProject({
      git: true,
      templates: [{ name: 'page', cards: [{ title: 'Template page' }] }],
      cards: [{ title: 'Alpha' }],
    });
    // The local user comes from git; pin it, so that the developer's own git
    // configuration does not matter. simple-git drops GIT_CONFIG_* from the
    // environment of git, so the pin is a home folder of its own.
    configDir = await mkdtemp(join(tmpdir(), 'cyberismo-mcp-home-'));
    await writeFile(
      join(configDir, '.gitconfig'),
      '[user]\n\tname = Stdio Tester\n\temail = stdio-tester@example.com\n',
    );
    env = Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] =>
          entry[1] !== undefined &&
          !/^GIT_(AUTHOR|COMMITTER|CONFIG)_/.test(entry[0]),
      ),
    );
    // os.homedir() reads HOME on macOS and Linux, and USERPROFILE on Windows.
    env.HOME = configDir;
    env.USERPROFILE = configDir;
    env.XDG_CONFIG_HOME = configDir;
    env.GIT_CONFIG_NOSYSTEM = '1';
    transport = new StdioClientTransport({
      command: process.execPath,
      args: [bin, 'mcp', '--autocommit'],
      cwd: project.path,
      env,
      stderr: 'pipe',
    });
    stderr = '';
    transport.stderr?.on('data', (chunk) => (stderr += String(chunk)));
    client = new Client({ name: 'test-client', version: '1.0.0' });
    await client.connect(transport);
  }, 60_000);

  afterEach(async () => {
    await client.close();
    await project.cleanup();
    await rm(configDir, { recursive: true, force: true });
  });

  it('lists the project of the folder', async () => {
    const { data } = await call('list_projects');
    expect(data.projects).toEqual([{ prefix: 'test', name: 'test' }]);
  });

  it('runs the tools as the local git user', async () => {
    // A tool fails without an authenticated user, so a write proves that the
    // stdio server names one. With --autocommit, the commit shows which user.
    const { isError, data } = await call('create_card', {
      projectPrefix: 'test',
      template: 'test/templates/page',
    });
    expect(isError).toBeFalsy();
    expect(data.created).toHaveLength(1);
    const listed = await call('list_cards', { projectPrefix: 'test' });
    expect(JSON.stringify(listed.data)).toContain(data.created[0].key);
    const { stdout } = await run('git', ['log', '-1', '--format=%an <%ae>'], {
      cwd: project.path,
      env,
    });
    expect(stdout.trim()).toBe('Stdio Tester <stdio-tester@example.com>');
  });

  it('expands a tilde in the project path', async () => {
    // An MCP client starts the command without a shell, so '~' arrives as it
    // is. Run from another folder, so that only the path finds the project.
    // A junction on Windows needs no extra privileges. Other systems ignore
    // the type.
    await symlink(project.path, join(configDir, 'project'), 'junction');
    const tildeClient = new Client({ name: 'test-client', version: '1.0.0' });
    await tildeClient.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [bin, 'mcp', '-p', '~/project'],
        cwd: configDir,
        env,
      }),
    );
    try {
      const result = await tildeClient.callTool({ name: 'list_projects' });
      const [content] = result.content as { type: string; text: string }[];
      expect(JSON.parse(content.text).projects).toEqual([
        { prefix: 'test', name: 'test' },
      ]);
    } finally {
      await tildeClient.close();
    }
  });

  it('keeps stderr empty for a valid project', async () => {
    await call('list_projects');
    expect(stderr).toBe('');
  });

  it('writes only protocol messages to stdout, and exits when stdin closes', async () => {
    // Without the SDK client: it skips lines that are not JSON, and it also
    // signals the process on close. -w keeps file watchers open.
    const child = spawn(process.execPath, [bin, 'mcp', '-w'], {
      cwd: project.path,
      env,
    });
    let stdout = '';
    child.stdout.on('data', (chunk) => (stdout += String(chunk)));
    const exited = new Promise<number | null>((resolve) =>
      child.on('exit', (code) => resolve(code)),
    );
    const requests = [
      {
        jsonrpc: '2.0',
        id: 0,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0.0' },
        },
      },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'list_projects', arguments: {} },
      },
    ];
    child.stdin.write(requests.map((r) => JSON.stringify(r) + '\n').join(''));
    await expect
      .poll(() => stdout.includes('"id":1'), { timeout: 10_000 })
      .toBe(true);
    child.stdin.end();
    expect(await exited).toBe(0);
    const lines = stdout.trimEnd().split('\n');
    expect(lines.map((line) => JSON.parse(line).id)).toEqual([0, 1]);
  });
});
