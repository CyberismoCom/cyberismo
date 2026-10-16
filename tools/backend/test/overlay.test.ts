// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import {
  ProjectNotFoundError,
  SYSTEM_ACTOR,
  type ProjectDirectory,
} from '@cyberismo/data-handler';
import {
  isReadOnly,
  setPolicy,
  startPolicyPolling,
  writableProjects,
} from '../src/overlay.js';

describe('isReadOnly', () => {
  beforeEach(() => setPolicy({ readOnly: false, projects: {} }));

  it('is false with no policy', () => {
    expect(isReadOnly('/api/projects/abc/cards')).toBe(false);
  });

  it('applies an instance-wide freeze to every path', () => {
    setPolicy({ readOnly: true, projects: {} });
    expect(isReadOnly('/api/auth/me')).toBe(true);
    expect(isReadOnly('/mcp')).toBe(true);
  });

  it('applies a project freeze only to that project', () => {
    setPolicy({ readOnly: false, projects: { abc: { readOnly: true } } });
    expect(isReadOnly('/api/projects/abc/cards')).toBe(true);
    expect(isReadOnly('/api/projects/abcd/cards')).toBe(false);
    expect(isReadOnly('/api/auth/me')).toBe(false);
  });

  it('reads the prefix from a path with a query string', () => {
    setPolicy({ readOnly: false, projects: { abc: { readOnly: true } } });
    expect(isReadOnly('/api/projects/abc?raw=true')).toBe(true);
  });

  it('decodes an encoded prefix', () => {
    setPolicy({ readOnly: false, projects: { 'a b': { readOnly: true } } });
    expect(isReadOnly('/api/projects/a%20b/cards')).toBe(true);
  });

  it('ignores a project entry that does not say readOnly', () => {
    setPolicy({ readOnly: false, projects: { abc: { readOnly: false } } });
    expect(isReadOnly('/api/projects/abc/cards')).toBe(false);
  });
});

describe('startPolicyPolling', () => {
  let server: Server | undefined;

  afterEach(async () => {
    delete process.env.CYBERISMO_OVERLAY_URL;
    delete process.env.CYBERISMO_OVERLAY_TOKEN;
    setPolicy({ readOnly: false, projects: {} });
    if (server) {
      await new Promise((resolve) => server!.close(resolve));
      server = undefined;
    }
  });

  /** Serve one policy document, and report what it was asked with. */
  async function serve(body: unknown, status = 200) {
    const seen: { token?: string; requests: number } = { requests: 0 };
    server = createServer((req, res) => {
      seen.token = req.headers['x-overlay-token'] as string | undefined;
      seen.requests += 1;
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    });
    const port: number = await new Promise((resolve) => {
      server!.listen(0, '127.0.0.1', () => {
        resolve((server!.address() as { port: number }).port);
      });
    });
    return { port, seen };
  }

  /**
   * The first poll is fired without awaiting, so wait for its effect rather
   * than for a fixed delay: a fixed one is too short on a loaded machine.
   */
  async function until(condition: () => boolean, timeoutMs = 2000) {
    const deadline = Date.now() + timeoutMs;
    while (!condition() && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }

  /** For the cases that assert nothing happened, where there is no condition. */
  const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

  it('does nothing without a URL', async () => {
    startPolicyPolling();
    await settle();
    expect(isReadOnly('/api/auth/me')).toBe(false);
  });

  it('applies a fetched policy and sends the token', async () => {
    const { port, seen } = await serve({
      readOnly: false,
      projects: { abc: { readOnly: true } },
    });
    process.env.CYBERISMO_OVERLAY_URL = `http://127.0.0.1:${port}/internal`;
    process.env.CYBERISMO_OVERLAY_TOKEN = 'secret';

    startPolicyPolling();
    await until(() => isReadOnly('/api/projects/abc/cards'));

    expect(seen.token).toBe('secret');
    expect(isReadOnly('/api/projects/abc/cards')).toBe(true);
  });

  it('keeps the previous policy when the endpoint fails', async () => {
    const { port, seen } = await serve({ error: 'nope' }, 500);
    setPolicy({ readOnly: true, projects: {} });
    process.env.CYBERISMO_OVERLAY_URL = `http://127.0.0.1:${port}/internal`;

    startPolicyPolling();
    await until(() => seen.requests > 0);

    expect(isReadOnly('/api/auth/me')).toBe(true);
  });

  it('ignores a malformed document', async () => {
    const { port, seen } = await serve('not an object');
    process.env.CYBERISMO_OVERLAY_URL = `http://127.0.0.1:${port}/internal`;

    startPolicyPolling();
    await until(() => seen.requests > 0);

    expect(isReadOnly('/api/auth/me')).toBe(false);
  });
});

describe('writableProjects', () => {
  const directory = {
    open: async (prefix: string) => ({ prefix }),
    list: async () => [
      { prefix: 'open', name: 'Open' },
      { prefix: 'frozen', name: 'Frozen' },
    ],
  } as unknown as ProjectDirectory;
  const open = (wrapped: ProjectDirectory, prefix: string) =>
    wrapped.open(prefix, SYSTEM_ACTOR);
  const prefixes = async (wrapped: ProjectDirectory) =>
    (await wrapped.list()).map((p) => p.prefix);

  it('passes everything through when nothing is read-only', async () => {
    setPolicy({ readOnly: false, projects: {} });
    const wrapped = writableProjects(directory);
    await expect(open(wrapped, 'frozen')).resolves.toBeDefined();
    expect(await prefixes(wrapped)).toEqual(['open', 'frozen']);
  });

  it('hides a read-only project', async () => {
    setPolicy({ readOnly: false, projects: { frozen: { readOnly: true } } });
    const wrapped = writableProjects(directory);
    await expect(open(wrapped, 'frozen')).rejects.toThrow(ProjectNotFoundError);
    await expect(open(wrapped, 'open')).resolves.toBeDefined();
    expect(await prefixes(wrapped)).toEqual(['open']);
  });

  it('hides everything when the whole instance is read-only', async () => {
    setPolicy({ readOnly: true, projects: {} });
    const wrapped = writableProjects(directory);
    await expect(open(wrapped, 'open')).rejects.toThrow(ProjectNotFoundError);
    expect(await prefixes(wrapped)).toEqual([]);
  });
});
