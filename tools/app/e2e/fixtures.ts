import { test as base, expect } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { cp, rm } from 'node:fs/promises';
import { join } from 'node:path';

const TMP = join(import.meta.dirname, '..', '..', '..', '.tmp');
const GOLDEN = join(TMP, 'cyberismo-bat.golden');
const BACKEND_ENTRY = join(
  import.meta.dirname,
  '..',
  '..',
  'backend',
  'dist',
  'main.js',
);

type Backend = { baseURL: string; projectPath: string };
type WorkerFixtures = {
  backend: Backend;
  resetProject: () => Promise<void>;
};

async function waitForListening(
  proc: ChildProcess,
  timeoutMs = 60_000,
): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(
        new Error(`Backend did not report listening within ${timeoutMs}ms`),
      );
    }, timeoutMs);
    const onMessage = (m: unknown) => {
      if (
        m &&
        typeof m === 'object' &&
        (m as { type?: unknown }).type === 'listening' &&
        typeof (m as { port?: unknown }).port === 'number'
      ) {
        cleanup();
        resolve((m as { port: number }).port);
      }
    };
    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      cleanup();
      reject(
        new Error(
          `Backend exited before listening (code=${code} signal=${signal})`,
        ),
      );
    };
    function cleanup() {
      clearTimeout(timer);
      proc.off('message', onMessage);
      proc.off('exit', onExit);
    }
    proc.on('message', onMessage);
    proc.once('exit', onExit);
  });
}

export const test = base.extend<{ baseURL: string }, WorkerFixtures>({
  backend: [
    async ({}, use, workerInfo) => {
      const projectPath = join(TMP, `cyberismo-bat-w${workerInfo.workerIndex}`);
      await rm(projectPath, { recursive: true, force: true });
      await cp(GOLDEN, projectPath, { recursive: true });

      const proc: ChildProcess = spawn(process.execPath, [BACKEND_ENTRY], {
        env: {
          ...process.env,
          NODE_ENV: 'test',
          AUTH_MODE: 'mock',
          CYBERISMO_E2E_OSPORT: 'true',
          npm_config_project_path: projectPath,
          CYBERISMO_GOLDEN_PATH: GOLDEN,
        },
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      });
      proc.stdout?.on('data', (b: Buffer) =>
        process.stdout.write(`[w${workerInfo.workerIndex}] ${b}`),
      );
      proc.stderr?.on('data', (b: Buffer) =>
        process.stderr.write(`[w${workerInfo.workerIndex}] ${b}`),
      );

      let port: number;
      try {
        port = await waitForListening(proc);
      } catch (err) {
        proc.kill('SIGTERM');
        throw err;
      }
      const baseURL = `http://127.0.0.1:${port}`;

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
    await use(backend.baseURL);
  },
});

export { expect };
