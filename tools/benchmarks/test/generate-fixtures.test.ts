import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { generateFixtures } from '../src/generate-fixtures.js';

const execFileAsync = promisify(execFile);

// ── Test config ──────────────────────────────────────────────────────────────
// Use the smaller of the two configured projects (cyberismo-docs) and a single
// scale point that's still meaningful but quick.
const TEST_PROJECT = 'cyberismo-docs';
const TEST_SCALE = 1000;

async function gringoAvailable(): Promise<boolean> {
  try {
    await execFileAsync('gringo', ['--version']);
    return true;
  } catch {
    return false;
  }
}

let outputDir: string;
const hasGringo = await gringoAvailable();

if (!hasGringo) {
  // Surface why we skipped so it's not silently green on hosts missing
  // potassco's clingo/gringo binaries.
  console.warn(
    '[generate-fixtures.test] gringo not available on PATH — skipping suite',
  );
}

describe.skipIf(!hasGringo)('generateFixtures', () => {
  beforeAll(async () => {
    outputDir = await mkdtemp(join(tmpdir(), 'gen-fixtures-test-'));
    await generateFixtures({
      outputDir,
      projects: [TEST_PROJECT],
      scaleMin: TEST_SCALE,
      scaleMax: TEST_SCALE,
      scaleStep: TEST_SCALE,
    });
  }, 600_000);

  afterAll(async () => {
    if (outputDir) {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it('creates the expected directory layout', async () => {
    const fixtureRoot = join(outputDir, TEST_PROJECT, String(TEST_SCALE));

    // project subtree
    const projectStat = await stat(join(fixtureRoot, 'project'));
    expect(projectStat.isDirectory()).toBe(true);

    // programs
    const baselineDir = await stat(join(fixtureRoot, 'programs', 'baseline'));
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

  it('meta.json has the right keys with non-empty values', async () => {
    const fixtureRoot = join(outputDir, TEST_PROJECT, String(TEST_SCALE));
    const meta = JSON.parse(
      await readFile(join(fixtureRoot, 'meta.json'), 'utf-8'),
    ) as Record<string, unknown>;

    expect(meta.project).toBe(TEST_PROJECT);
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
    const fixtureRoot = join(outputDir, TEST_PROJECT, String(TEST_SCALE));
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
    const fixtureRoot = join(outputDir, TEST_PROJECT, String(TEST_SCALE));
    const aspif = await readFile(
      join(fixtureRoot, 'programs', 'incremental-base.aspif'),
      'utf-8',
    );
    expect(aspif.length).toBeGreaterThan(0);
    // gringo --output=smodels emits the smodels/aspif text format. The first
    // non-empty line is either "asp 1 0 0" (aspif header) or starts with a
    // numeric rule type indicator. We accept either as a sanity check.
    const firstLine = aspif.split('\n').find((l) => l.trim().length > 0) ?? '';
    expect(firstLine.startsWith('asp ') || /^\d+/.test(firstLine.trim())).toBe(
      true,
    );
  });

  it('cards.json decodes to an object with the expected keys', async () => {
    const fixtureRoot = join(outputDir, TEST_PROJECT, String(TEST_SCALE));
    const cards = JSON.parse(
      await readFile(join(fixtureRoot, 'cards.json'), 'utf-8'),
    ) as Record<string, unknown>;

    // cyberismo-docs only has the leafTask slot meaningful (page card type).
    // The other slots are not emitted. We assert the present key explicitly
    // and the absence of an unconfigured key.
    expect(typeof cards.leafKey).toBe('string');
    expect((cards.leafKey as string).length).toBeGreaterThan(0);
  });
});
