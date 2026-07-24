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

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { formatSealFileName } from '../../src/mutations/replay/seal-files.js';
import { toVersion } from '../../src/modules/types.js';

import type { ConfigurationLogEntry } from '../../src/utils/configuration-logger.js';
import type {
  InstallationRef,
  ModuleInstallation,
} from '../../src/modules/types.js';
import type { ResolvedModule } from '../../src/modules/resolver.js';

// ---------------------------------------------------------------------------
// Released-format migration log lines and on-disk seal / module fixtures
// shared by the replay unit tests and the module-update integration tests.
// ---------------------------------------------------------------------------

/** A single released-format migration log line, JSON-encoded. */
export function logLine(
  operation: ConfigurationLogEntry['operation'],
  target: string,
  parameters?: Record<string, unknown>,
): string {
  return JSON.stringify({
    timestamp: '2026-01-01T00:00:00.000Z',
    operation,
    target,
    ...(parameters ? { parameters } : {}),
  });
}

/** The released log-entry shape `ResourceMutations.recordLogEntry` writes for
 * a field-type rename. */
export function renameEntry(
  prefix: string,
  oldId: string,
  newId: string,
): string {
  const oldName = `${prefix}/fieldTypes/${oldId}`;
  const newName = `${prefix}/fieldTypes/${newId}`;
  return logLine('resource_rename', oldName, {
    type: 'fieldTypes',
    operation: { name: 'change', target: oldName, to: newName },
  });
}

/** One seal file: its `(from, to]` version bounds and its log lines. */
export interface SealSpec {
  from: string;
  to: string;
  lines: string[];
}

/** Write each seal to `folder`, named by the canonical seal-file convention. */
export function writeSeals(folder: string, seals: SealSpec[]): void {
  mkdirSync(folder, { recursive: true });
  for (const seal of seals) {
    writeFileSync(
      join(folder, formatSealFileName(seal.from, seal.to)),
      seal.lines.join('\n') + '\n',
    );
  }
}

/** Write a `<id>.json` field-type file per identifier under `folder`. */
export function writeFieldTypes(
  folder: string,
  prefix: string,
  ids: string[],
): void {
  mkdirSync(folder, { recursive: true });
  for (const id of ids) {
    writeFileSync(
      join(folder, `${id}.json`),
      JSON.stringify({
        name: `${prefix}/fieldTypes/${id}`,
        displayName: id,
        dataType: 'shortText',
      }),
    );
  }
}

export interface InstalledModuleSpec {
  name: string;
  location: string;
  version?: string;
  /** Project base path recorded on the installation. */
  project: string;
  /** Directory the installed module tree is written to. */
  path: string;
  seals?: SealSpec[];
  /** When present, field-type JSON files are written under `<path>/fieldTypes`. */
  fieldTypes?: string[];
  /** Write a minimal `cardsConfig.json` at the tree root. */
  writeConfig?: boolean;
}

/**
 * Build a {@link ModuleInstallation} and materialise its installed tree on
 * disk: seals under `<path>/migrations`, optional field types, optional
 * `cardsConfig.json`. Integration callers seed the POST-update tree here (the
 * real flow has `applyModules` overwrite the module tree before replay runs)
 * while the returned record still carries the PRE-update version.
 */
export function installedModule(spec: InstalledModuleSpec): ModuleInstallation {
  mkdirSync(spec.path, { recursive: true });
  if (spec.writeConfig) {
    writeFileSync(
      join(spec.path, 'cardsConfig.json'),
      JSON.stringify({
        cardKeyPrefix: spec.name,
        name: spec.name,
        modules: [],
      }),
    );
  }
  writeSeals(join(spec.path, 'migrations'), spec.seals ?? []);
  if (spec.fieldTypes) {
    writeFieldTypes(join(spec.path, 'fieldTypes'), spec.name, spec.fieldTypes);
  }
  return {
    project: spec.project,
    name: spec.name,
    source: { location: spec.location },
    version: spec.version === undefined ? undefined : toVersion(spec.version),
    path: spec.path,
    declaredDependencies: [],
  };
}

export interface ResolvedModuleSpec {
  name: string;
  location: string;
  version?: string;
  project: string;
  /** Staging directory; seals go under `<stagedPath>/.cards/local/migrations`. */
  stagedPath: string;
  seals?: SealSpec[];
  fieldTypes?: string[];
  parent?: InstallationRef;
}

/**
 * Build a {@link ResolvedModule} and materialise its staged tree on disk. Seal
 * CONTENTS are read from the staged tree at plan time, so callers write the
 * target (post-update) seals here.
 */
export function resolvedModule(spec: ResolvedModuleSpec): ResolvedModule {
  const local = join(spec.stagedPath, '.cards', 'local');
  writeSeals(join(local, 'migrations'), spec.seals ?? []);
  if (spec.fieldTypes) {
    writeFieldTypes(join(local, 'fieldTypes'), spec.name, spec.fieldTypes);
  }
  return {
    declaration: {
      project: spec.project,
      name: spec.name,
      source: { location: spec.location },
      ...(spec.parent ? { parent: spec.parent } : {}),
    },
    remoteUrl: spec.location,
    version: spec.version === undefined ? undefined : toVersion(spec.version),
    stagedPath: spec.stagedPath,
  };
}
