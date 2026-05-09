/**
 * Pre-resultField (baseline) query-language LP files and helpers to swap a
 * `ClingoContext` between the current QL and the baseline QL.
 *
 * Shared by `bench-main.ts` (measures resultField vs. baseline) and
 * `generate-fixtures.ts` (emits both variants for offline replay).
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ClingoContext } from '@cyberismo/node-clingo';
import { lpFiles } from '@cyberismo/assets';

export interface BaselineFiles {
  queryLanguage: string;
  utils: string;
  card: string;
}

export async function loadBaselineFiles(): Promise<BaselineFiles> {
  const baselineDir = join(
    dirname(fileURLToPath(import.meta.url)),
    '../baselines/pre-resultfield',
  );
  const [queryLanguage, utils, card] = await Promise.all([
    readFile(join(baselineDir, 'queryLanguage.lp'), 'utf-8'),
    readFile(join(baselineDir, 'utils.lp'), 'utf-8'),
    readFile(join(baselineDir, 'card.lp'), 'utf-8'),
  ]);
  return { queryLanguage, utils, card };
}

export function swapToOldQL(ctx: ClingoContext, bf: BaselineFiles): void {
  ctx.setProgram('queryLanguage', bf.queryLanguage, ['all']);
  ctx.setProgram('utils', bf.utils, ['all']);
}

export function restoreCurrentQL(ctx: ClingoContext): void {
  ctx.setProgram('queryLanguage', lpFiles.common.queryLanguage, ['all']);
  ctx.setProgram('utils', lpFiles.common.utils, ['all']);
}
