import { test as base, expect } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { cp, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TMP = join(__dirname, '..', '..', '..', '.tmp');
const GOLDEN = join(TMP, 'cyberismo-bat.golden');

type Backend = { baseURL: string; projectPath: string };
type WorkerFixtures = {
  backend: Backend;
  resetProject: () => Promise<void>;
};

async function waitForServer(
  baseURL: string,
  timeoutMs = 60_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastErr: unknown;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseURL}/api/projects`, {
        redirect: 'manual',
      });
      // Auth may reject (401) but that proves the server is up.
      if (res.status < 500) return;
      lastErr = new Error(`status ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(
    `Server at ${baseURL} did not become ready within ${timeoutMs}ms (last: ${lastErr})`,
  );
}

async function freePort(start: number): Promise<number> {
  for (let p = start; p < start + 100; p++) {
    const ok = await new Promise<boolean>((resolve) => {
      const srv = net.createServer();
      srv.once('error', () => resolve(false));
      srv.once('listening', () => srv.close(() => resolve(true)));
      srv.listen(p, '127.0.0.1');
    });
    if (ok) return p;
  }
  throw new Error(`No free port found near ${start}`);
}

export const test = base.extend<{ baseURL: string }, WorkerFixtures>({
  backend: [
    async (_fixtures, use, workerInfo) => {
      const projectPath = join(TMP, `cyberismo-bat-w${workerInfo.workerIndex}`);
      await rm(projectPath, { recursive: true, force: true });
      await cp(GOLDEN, projectPath, { recursive: true });

      const port = await freePort(3010 + workerInfo.workerIndex * 10);
      const baseURL = `http://127.0.0.1:${port}`;

      const proc: ChildProcess = spawn(
        'pnpm',
        ['--filter', 'backend', 'start-e2e'],
        {
          env: {
            ...process.env,
            NODE_ENV: 'test',
            AUTH_MODE: 'mock',
            PORT: String(port),
            npm_config_project_path: projectPath,
            CYBERISMO_GOLDEN_PATH: GOLDEN,
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      proc.stdout?.on('data', (b: Buffer) =>
        process.stdout.write(`[w${workerInfo.workerIndex}] ${b}`),
      );
      proc.stderr?.on('data', (b: Buffer) =>
        process.stderr.write(`[w${workerInfo.workerIndex}] ${b}`),
      );

      try {
        await waitForServer(baseURL);
      } catch (err) {
        proc.kill('SIGTERM');
        throw err;
      }

      await use({ baseURL, projectPath });

      proc.kill('SIGTERM');
      await new Promise((r) => setTimeout(r, 200));
      await rm(projectPath, { recursive: true, force: true });
    },
    { scope: 'worker', auto: true },
  ],

  resetProject: [
    async ({ backend }, use) => {
      await use(async () => {
        const res = await fetch(`${backend.baseURL}/api/test/reset`, {
          method: 'POST',
        });
        if (!res.ok) {
          throw new Error(`reset failed: ${res.status} ${await res.text()}`);
        }
      });
    },
    { scope: 'worker' },
  ],

  // Override Playwright's built-in baseURL test fixture so every test's `page`
  // is preconfigured with this worker's backend URL — `await page.goto('/')`
  // hits the right place automatically.
  baseURL: async ({ backend }, use) => {
    await use(backend.baseURL); // eslint-disable-line react-hooks/rules-of-hooks
  },
});

export { expect };
