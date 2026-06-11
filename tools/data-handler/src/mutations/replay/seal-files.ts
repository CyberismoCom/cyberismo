/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026

  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { readdir } from 'node:fs/promises';
import semver from 'semver';

/** A sealed migration log: covers breaking changes in (from, to]. */
export interface SealFile {
  from: string;
  to: string;
  fileName: string;
}

// Old-format migrationLog_<version>.jsonl names predate replay and must not
// match; requiring two segments (and valid semver below) excludes them.
const SEAL_NAME = /^migrationLog_(.+)_(.+)\.jsonl$/;

export function parseSealFileName(fileName: string): SealFile | undefined {
  const match = SEAL_NAME.exec(fileName);
  if (!match) return undefined;
  const [, from, to] = match;
  if (semver.valid(from) === null || semver.valid(to) === null) {
    return undefined;
  }
  return { from, to, fileName };
}

export function formatSealFileName(from: string, to: string): string {
  return `migrationLog_${from}_${to}.jsonl`;
}

/** New-format seals in a migrations folder, ascending by `to`. Missing folder → []. */
export async function listSealFiles(
  migrationsFolder: string,
): Promise<SealFile[]> {
  let names: string[];
  try {
    names = await readdir(migrationsFolder);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  return names
    .map(parseSealFileName)
    .filter((seal): seal is SealFile => seal !== undefined)
    .sort((a, b) => semver.compare(a.to, b.to));
}

/** Highest sealed `to` version, or 0.0.0 when nothing is sealed. */
export async function lastSealedVersion(
  migrationsFolder: string,
): Promise<string> {
  const seals = await listSealFiles(migrationsFolder);
  return seals.at(-1)?.to ?? '0.0.0';
}
