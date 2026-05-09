import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { CommandManager } from '@cyberismo/data-handler';
import { lpFiles } from '@cyberismo/assets';
import Handlebars from 'handlebars';
import { scaleProject, fastScaleProject } from '../src/card-scaler.js';

const execFileAsync = promisify(execFile);

async function gringoAvailable(): Promise<boolean> {
  try {
    await execFileAsync('gringo', ['--version']);
    return true;
  } catch {
    return false;
  }
}

const hasGringo = await gringoAvailable();

if (!hasGringo) {
  console.warn(
    '[fast-scale.test] gringo not available on PATH — skipping suite',
  );
}

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

interface ProjectCase {
  name: string;
  sourcePath: string;
  template: string;
  /** target card count for the test scale */
  target: number;
}

const CASES: ProjectCase[] = [
  {
    name: 'cyberismo-docs',
    sourcePath: resolve(REPO_ROOT, 'cyberismo-docs'),
    template: 'base/templates/page',
    target: 200,
  },
  {
    name: 'module-eu-cra',
    sourcePath: resolve(REPO_ROOT, 'module-eu-cra'),
    // 41 cards / instance — 250 ≈ 6 instances + a partial 7th, still room.
    template: 'secdeva/templates/project',
    target: 250,
  },
];

function cardTypeDistribution(
  cards: Array<{ metadata?: { cardType?: string } }>,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const c of cards) {
    const ct = c.metadata?.cardType ?? '<no-type>';
    counts.set(ct, (counts.get(ct) ?? 0) + 1);
  }
  return counts;
}

describe.skipIf(!hasGringo)('fastScaleProject', () => {
  for (const c of CASES) {
    describe(c.name, () => {
      let slowDir: string | undefined;
      let fastDir: string | undefined;
      let slowCards: Array<{ key: string; metadata?: { cardType?: string } }> =
        [];
      let fastCards: Array<{ key: string; metadata?: { cardType?: string } }> =
        [];
      let cardsPerInstance = 0;
      let answerCount = 0;

      beforeAll(async () => {
        // Slow path
        slowDir = await scaleProject(c.sourcePath, c.target, c.template);
        let mgr = await CommandManager.getInstance(slowDir);
        slowCards = mgr.project
          .cards(undefined, { metadata: true })
          .map((x) => ({
            key: x.key,
            metadata: x.metadata,
          }));
        mgr.project.dispose();

        // Fast path
        fastDir = await fastScaleProject(c.sourcePath, c.target, c.template);
        mgr = await CommandManager.getInstance(fastDir);
        const ctx = mgr.project.calculationEngine.context;
        fastCards = mgr.project
          .cards(undefined, { metadata: true })
          .map((x) => ({
            key: x.key,
            metadata: x.metadata,
          }));
        // Build tree query program and solve once for structural validity.
        const treeQuery = Handlebars.compile(lpFiles.queries.tree)({});
        const result = await ctx.solve(treeQuery, ['all']);
        answerCount = result.answers?.length ?? 0;
        mgr.project.dispose();

        // cardsPerInstance: 1 for the page template, 41 for secdeva/project.
        cardsPerInstance = c.template === 'secdeva/templates/project' ? 41 : 1;
      }, 600_000);

      afterAll(async () => {
        if (slowDir) await rm(slowDir, { recursive: true, force: true });
        if (fastDir) await rm(fastDir, { recursive: true, force: true });
      });

      it('reaches the target card count', () => {
        expect(slowCards.length).toBeGreaterThanOrEqual(c.target);
        expect(fastCards.length).toBeGreaterThanOrEqual(c.target);
      });

      it('matches slow-path cardType distribution within tolerance', () => {
        const slowDist = cardTypeDistribution(slowCards);
        const fastDist = cardTypeDistribution(fastCards);

        const allTypes = new Set<string>([
          ...slowDist.keys(),
          ...fastDist.keys(),
        ]);
        for (const t of allTypes) {
          const s = slowDist.get(t) ?? 0;
          const f = fastDist.get(t) ?? 0;
          expect(
            Math.abs(s - f),
            `cardType '${t}': slow=${s} fast=${f} (tolerance ${cardsPerInstance})`,
          ).toBeLessThanOrEqual(cardsPerInstance);
        }
      });

      it('fast-path project produces at least one Clingo answer set for the tree query', () => {
        expect(answerCount).toBeGreaterThanOrEqual(1);
      });
    });
  }
});
