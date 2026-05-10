import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { generateFixtures } from '../src/generate-fixtures.js';

const execFileAsync = promisify(execFile);

// ── Test config ──────────────────────────────────────────────────────────────
// Each entry is exercised at a single, modest scale point. Per-project
// `expectedCards` describes which cards.json keys (and corresponding per-card
// LP files) MUST be present for that project — the union of slots configured
// in `PROJECTS` for that project.
const TEST_SCALE = 1000;

interface ProjectExpectation {
  project: string;
  /**
   * Card-slot keys expected in `cards.json` for this project. Each maps to a
   * per-card LP filename under `programs/{baseline,baseline+resultfield}/`.
   */
  expectedCards: ReadonlyArray<{ jsonKey: string; lpFile: string }>;
}

const PROJECT_EXPECTATIONS: readonly ProjectExpectation[] = [
  {
    project: 'cyberismo-docs',
    // cyberismo-docs is content-only — only the leafTask slot is configured.
    expectedCards: [{ jsonKey: 'leafKey', lpFile: 'card-leaf-task' }],
  },
  {
    project: 'module-eu-cra',
    // module-eu-cra has all four slots configured (matches bench-main.ts).
    expectedCards: [
      { jsonKey: 'leafKey', lpFile: 'card-leaf-task' },
      { jsonKey: 'phaseKey', lpFile: 'card-phase' },
      { jsonKey: 'riskKey', lpFile: 'card-risk' },
      { jsonKey: 'rootKey', lpFile: 'card-root' },
    ],
  },
];

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
  // Surface why we skipped so it's not silently green on hosts missing
  // potassco's clingo/gringo binaries.
  console.warn(
    '[generate-fixtures.test] gringo not available on PATH — skipping suite',
  );
}

describe.skipIf(!hasGringo)('generateFixtures', () => {
  for (const expectation of PROJECT_EXPECTATIONS) {
    describe(expectation.project, () => {
      let outputDir: string;

      beforeAll(async () => {
        outputDir = await mkdtemp(join(tmpdir(), 'gen-fixtures-test-'));
        await generateFixtures({
          outputDir,
          project: expectation.project,
          scale: TEST_SCALE,
        });
      }, 600_000);

      afterAll(async () => {
        if (outputDir) {
          await rm(outputDir, { recursive: true, force: true });
        }
      });

      it('creates the expected directory layout', async () => {
        const fixtureRoot = join(
          outputDir,
          expectation.project,
          String(TEST_SCALE),
        );

        // project subtree
        const projectStat = await stat(join(fixtureRoot, 'project'));
        expect(projectStat.isDirectory()).toBe(true);

        // programs
        const baselineDir = await stat(
          join(fixtureRoot, 'programs', 'baseline'),
        );
        expect(baselineDir.isDirectory()).toBe(true);

        const baselineRf = await stat(
          join(fixtureRoot, 'programs', 'baseline+resultfield'),
        );
        expect(baselineRf.isDirectory()).toBe(true);

        const aspif = await stat(
          join(fixtureRoot, 'programs', 'incremental-base.aspif'),
        );
        expect(aspif.isFile()).toBe(true);
        expect(aspif.size).toBeGreaterThan(0);

        // metadata files
        const metaStat = await stat(join(fixtureRoot, 'meta.json'));
        expect(metaStat.isFile()).toBe(true);
        const cardsStat = await stat(join(fixtureRoot, 'cards.json'));
        expect(cardsStat.isFile()).toBe(true);
        const queriesStat = await stat(join(fixtureRoot, 'queries.json'));
        expect(queriesStat.isFile()).toBe(true);
      });

      it('emits non-empty LP files for tree and every configured card slot', async () => {
        const fixtureRoot = join(
          outputDir,
          expectation.project,
          String(TEST_SCALE),
        );
        const variants = ['baseline', 'baseline+resultfield'] as const;
        for (const variant of variants) {
          const treeStat = await stat(
            join(fixtureRoot, 'programs', variant, 'tree.lp'),
          );
          expect(treeStat.isFile()).toBe(true);
          expect(treeStat.size).toBeGreaterThan(0);

          for (const { lpFile } of expectation.expectedCards) {
            const lpStat = await stat(
              join(fixtureRoot, 'programs', variant, `${lpFile}.lp`),
            );
            expect(lpStat.isFile()).toBe(true);
            expect(lpStat.size).toBeGreaterThan(0);
          }
        }
      });

      // The rendering reference fixture is only emitted for projects with a
      // riskTask slot configured (matches generate-fixtures.ts and bench-main.ts).
      // Derive presence from `expectedCards` so the expectation stays in sync.
      it('emits rendering.lp under baseline+resultfield iff a riskTask slot exists', async () => {
        const fixtureRoot = join(
          outputDir,
          expectation.project,
          String(TEST_SCALE),
        );
        const renderingLp = join(
          fixtureRoot,
          'programs',
          'baseline+resultfield',
          'rendering.lp',
        );
        const expectsRendering = expectation.expectedCards.some(
          (c) => c.jsonKey === 'riskKey',
        );
        if (expectsRendering) {
          const renderingStat = await stat(renderingLp);
          expect(renderingStat.isFile()).toBe(true);
          expect(renderingStat.size).toBeGreaterThan(0);
        } else {
          await expect(stat(renderingLp)).rejects.toThrow();
        }
      });

      it('meta.json has the right keys with non-empty values', async () => {
        const fixtureRoot = join(
          outputDir,
          expectation.project,
          String(TEST_SCALE),
        );
        const meta = JSON.parse(
          await readFile(join(fixtureRoot, 'meta.json'), 'utf-8'),
        ) as Record<string, unknown>;

        expect(meta.project).toBe(expectation.project);
        expect(meta.scale).toBe(TEST_SCALE);
        expect(typeof meta.template).toBe('string');
        expect((meta.template as string).length).toBeGreaterThan(0);
        expect(typeof meta.cardCount).toBe('number');
        expect(meta.cardCount as number).toBeGreaterThanOrEqual(TEST_SCALE);
        expect(typeof meta.generatedAt).toBe('string');
        expect((meta.generatedAt as string).length).toBeGreaterThan(0);
        // gitSha may be null (not in a git repo, etc.) but should be present
        expect('gitSha' in meta).toBe(true);
      });

      it('baseline and baseline+resultfield tree.lp differ (QL was swapped)', async () => {
        const fixtureRoot = join(
          outputDir,
          expectation.project,
          String(TEST_SCALE),
        );
        const baselineTree = await readFile(
          join(fixtureRoot, 'programs', 'baseline', 'tree.lp'),
          'utf-8',
        );
        const rfTree = await readFile(
          join(fixtureRoot, 'programs', 'baseline+resultfield', 'tree.lp'),
          'utf-8',
        );
        expect(baselineTree.length).toBeGreaterThan(0);
        expect(rfTree.length).toBeGreaterThan(0);
        expect(baselineTree).not.toBe(rfTree);
      });

      it('incremental-base.aspif is non-empty and looks like ASPIF/smodels output', async () => {
        const fixtureRoot = join(
          outputDir,
          expectation.project,
          String(TEST_SCALE),
        );
        const aspif = await readFile(
          join(fixtureRoot, 'programs', 'incremental-base.aspif'),
          'utf-8',
        );
        expect(aspif.length).toBeGreaterThan(0);
        // gringo --output=smodels emits the smodels/aspif text format. The first
        // non-empty line is either "asp 1 0 0" (aspif header) or starts with a
        // numeric rule type indicator. We accept either as a sanity check.
        const firstLine =
          aspif.split('\n').find((l) => l.trim().length > 0) ?? '';
        expect(
          firstLine.startsWith('asp ') || /^\d+/.test(firstLine.trim()),
        ).toBe(true);
      });

      it('cards.json decodes to an object with the expected keys', async () => {
        const fixtureRoot = join(
          outputDir,
          expectation.project,
          String(TEST_SCALE),
        );
        const cards = JSON.parse(
          await readFile(join(fixtureRoot, 'cards.json'), 'utf-8'),
        ) as Record<string, unknown>;

        for (const { jsonKey } of expectation.expectedCards) {
          expect(typeof cards[jsonKey]).toBe('string');
          expect((cards[jsonKey] as string).length).toBeGreaterThan(0);
        }
      });
    });
  }
});
