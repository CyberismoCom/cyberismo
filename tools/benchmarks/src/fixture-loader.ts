/**
 * Helpers for discovering and loading benchmark fixtures emitted by
 * `generate-fixtures.ts`.
 *
 * Layout (consumed):
 *   <fixturesDir>/<project>/<scale>/
 *     project/                                # CommandManager.getInstance(<this>)
 *     programs/
 *       baseline/<query>.lp
 *       baseline+resultfield/<query>.lp
 *       incremental-base.aspif
 *     queries.json
 *     cards.json
 *     meta.json
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

export interface FixtureCards {
  leafKey?: string;
  phaseKey?: string;
  riskKey?: string;
  riskContent?: string;
  rootKey?: string;
}

export interface FixtureMeta {
  project: string;
  scale: number;
  template: string;
  cardCount: number;
  generatedAt: string;
  gitSha: string | null;
}

export interface FixtureBundle {
  /** Absolute path to `<fixturesDir>/<project>/<scale>/`. */
  root: string;
  /** Absolute path to the self-contained scaled project tree. */
  projectDir: string;
  cards: FixtureCards;
  meta: FixtureMeta;
  /** Compiled query LP strings keyed by name (`tree`, `card-leaf-task`, ...). */
  queries: Record<string, string>;
}

async function isDir(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Returns the project names found directly under `fixturesDir` (lexicographic).
 */
export async function listProjects(fixturesDir: string): Promise<string[]> {
  const entries = await readdir(fixturesDir);
  const out: string[] = [];
  for (const name of entries.sort()) {
    if (await isDir(join(fixturesDir, name))) out.push(name);
  }
  return out;
}

/**
 * Returns the scales (as integers) generated for `project` under
 * `fixturesDir`, sorted ascending.
 */
export async function listScales(
  fixturesDir: string,
  project: string,
): Promise<number[]> {
  const projDir = join(fixturesDir, project);
  const entries = await readdir(projDir);
  const scales: number[] = [];
  for (const name of entries) {
    if (!/^\d+$/.test(name)) continue;
    if (await isDir(join(projDir, name))) scales.push(Number(name));
  }
  return scales.sort((a, b) => a - b);
}

/**
 * Reads the JSON sidecars (`cards.json`, `queries.json`, `meta.json`) for a
 * given fixture point. Does NOT instantiate CommandManager — call sites do that
 * themselves so that they can choose lifetime.
 */
export async function loadFixture(
  fixturesDir: string,
  project: string,
  scale: number,
): Promise<FixtureBundle> {
  const root = join(fixturesDir, project, String(scale));
  const [cardsRaw, queriesRaw, metaRaw] = await Promise.all([
    readFile(join(root, 'cards.json'), 'utf-8'),
    readFile(join(root, 'queries.json'), 'utf-8'),
    readFile(join(root, 'meta.json'), 'utf-8'),
  ]);
  return {
    root,
    projectDir: join(root, 'project'),
    cards: JSON.parse(cardsRaw) as FixtureCards,
    queries: JSON.parse(queriesRaw) as Record<string, string>,
    meta: JSON.parse(metaRaw) as FixtureMeta,
  };
}

/**
 * Returns the absolute path to a baseline / baseline+resultfield LP file for
 * `query` (e.g. `tree`, `card-leaf-task`, `rendering`).
 */
export function programPath(
  bundle: FixtureBundle,
  variant: 'baseline' | 'baseline+resultfield',
  query: string,
): string {
  return join(bundle.root, 'programs', variant, `${query}.lp`);
}

/**
 * Returns the absolute path to the pre-grounded ASPIF base.
 */
export function incrementalAspifPath(bundle: FixtureBundle): string {
  return join(bundle.root, 'programs', 'incremental-base.aspif');
}
