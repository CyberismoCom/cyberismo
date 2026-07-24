import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, relative } from 'node:path';

import { copyDir } from '../../../src/utils/file-utils.js';
import { getTestProject } from '../../helpers/test-utils.js';
import {
  ModuleReplayFailedError,
  executeModuleReplays,
  planModuleReplays,
} from '../../../src/mutations/replay/replay.js';
import { formatSealFileName } from '../../../src/mutations/replay/seal-files.js';
import {
  installedModule,
  logLine,
  renameEntry,
  resolvedModule,
} from '../../helpers/replay-fixtures.js';

import type { SealSpec } from '../../helpers/replay-fixtures.js';
import type {
  InstallationRef,
  ModuleInstallation,
} from '../../../src/modules/types.js';
import type { ResolvedModule } from '../../../src/modules/resolver.js';

const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-replay-integration');
const projectPath = join(testDir, 'valid', 'decision-records');
const stagedRoot = join(testDir, 'staged');

const cardDir = join(projectPath, 'cardRoot', 'decision_5');
const calculationFile = join(
  projectPath,
  '.cards',
  'local',
  'calculations',
  'test',
  'calculation.lp',
);
const consumerMigrationLogDir = join(
  projectPath,
  '.cards',
  'local',
  'migrations',
);

interface ModuleSpec {
  prefix: string;
  location: string;
  version: string;
  seals?: SealSpec[];
  /** Field type identifiers present in the tree (post-update contents). */
  fieldTypes?: string[];
}

/**
 * Seed `.cards/modules/<prefix>/` with the POST-update module files: in the
 * real flow `applyModules` has already overwritten the module tree by the
 * time `executeModuleReplays` runs. The returned installation record still
 * carries the PRE-update version, exactly like the `installedBefore` list
 * captured ahead of the apply. `seals` are the installed (pre-update) seals
 * used by the linearity check.
 */
function installModule(spec: ModuleSpec): ModuleInstallation {
  return installedModule({
    name: spec.prefix,
    location: spec.location,
    version: spec.version,
    project: projectPath,
    path: join(projectPath, '.cards', 'modules', spec.prefix),
    seals: spec.seals,
    fieldTypes: spec.fieldTypes ?? [],
    writeConfig: true,
  });
}

function stageModule(
  spec: ModuleSpec & { parent?: InstallationRef },
): ResolvedModule {
  return resolvedModule({
    name: spec.prefix,
    location: spec.location,
    version: spec.version,
    project: projectPath,
    stagedPath: join(stagedRoot, spec.prefix),
    seals: spec.seals,
    fieldTypes: spec.fieldTypes ?? [],
    parent: spec.parent,
  });
}

function seedCardMetadataKey(key: string, value: unknown): void {
  const file = join(cardDir, 'index.json');
  const metadata = JSON.parse(readFileSync(file, 'utf8'));
  metadata[key] = value;
  writeFileSync(file, JSON.stringify(metadata, null, 4));
}

function seedCardContent(refs: string[]): void {
  writeFileSync(
    join(cardDir, 'index.adoc'),
    '= Decision Records\n\n' +
      refs.map((ref) => `This card relies on ${ref}.`).join('\n') +
      '\n',
  );
}

function seedCalculationContent(refs: string[]): void {
  writeFileSync(
    calculationFile,
    refs.map((ref) => `% references ${ref}`).join('\n') + '\nfact(1).\n',
  );
}

function writeLocalCardType(
  identifier: string,
  customFields: Record<string, unknown>[],
): void {
  writeFileSync(
    join(projectPath, '.cards', 'local', 'cardTypes', `${identifier}.json`),
    JSON.stringify({
      name: `decision/cardTypes/${identifier}`,
      displayName: identifier,
      workflow: 'decision/workflows/decision',
      customFields,
      alwaysVisibleFields: [],
      optionallyVisibleFields: [],
    }),
  );
}

/** Relative path → file content for every file under `dir`. */
function snapshotTree(dir: string): Map<string, string> {
  const snapshot = new Map<string, string>();
  const entries = readdirSync(dir, { recursive: true, withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const path = join(entry.parentPath, entry.name);
    snapshot.set(relative(dir, path), readFileSync(path, 'utf8'));
  }
  return snapshot;
}

async function loadProject() {
  const project = getTestProject(projectPath);
  await project.populateCaches();
  return project;
}

describe('module replay end to end', () => {
  beforeEach(async () => {
    rmSync(testDir, { recursive: true, force: true });
    mkdirSync(stagedRoot, { recursive: true });
    await copyDir(
      join(baseDir, '..', '..', 'test-data', 'valid', 'decision-records'),
      projectPath,
    );
  });
  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('replays a sealed field-type rename into the consumer', async () => {
    const installed = installModule({
      prefix: 'mod',
      location: 'file:/modules/mod',
      version: '1.0.0',
      // Post-update tree: the old field type is gone, only the new one
      // remains (applyModules already swapped the files in the real flow).
      fieldTypes: ['priority'],
    });
    const resolved = stageModule({
      prefix: 'mod',
      location: 'file:/modules/mod',
      version: '2.0.0',
      seals: [
        {
          from: '0.0.0',
          to: '2.0.0',
          lines: [renameEntry('mod', 'severity', 'priority')],
        },
      ],
      fieldTypes: ['priority'],
    });
    // A null value under the old key; the non-null case (which additionally
    // exercises clingo fact regeneration resolving the new field type) is
    // covered separately below.
    seedCardMetadataKey('mod/fieldTypes/severity', null);
    seedCardContent(['mod/fieldTypes/severity']);
    seedCalculationContent(['mod/fieldTypes/severity']);

    const project = await loadProject();
    const steps = await planModuleReplays([resolved], [installed]);

    expect(steps).toHaveLength(1);
    expect(steps[0].modulePrefix).toBe('mod');
    expect(steps[0].fromVersion).toBe('1.0.0');
    expect(steps[0].toVersion).toBe('2.0.0');
    expect(steps[0].seals).toHaveLength(1);
    expect(steps[0].seals[0].entries).toHaveLength(1);

    const moduleTreeBefore = snapshotTree(installed.path);
    await executeModuleReplays(project, steps);

    // Card content and folder-resource content files are rewritten on disk.
    const adoc = readFileSync(join(cardDir, 'index.adoc'), 'utf8');
    expect(adoc).toContain('mod/fieldTypes/priority');
    expect(adoc).not.toContain('mod/fieldTypes/severity');
    const calculation = readFileSync(calculationFile, 'utf8');
    expect(calculation).toContain('mod/fieldTypes/priority');
    expect(calculation).not.toContain('mod/fieldTypes/severity');

    // The cascade renames the card's metadata key, preserving the value.
    const metadata = JSON.parse(
      readFileSync(join(cardDir, 'index.json'), 'utf8'),
    );
    expect(metadata).not.toHaveProperty('mod/fieldTypes/severity');
    expect(metadata).toHaveProperty('mod/fieldTypes/priority', null);

    // Replayed entries are never recorded in the consumer's own log.
    expect(existsSync(consumerMigrationLogDir)).toBe(false);

    // The replay cascades into the consumer only; the module's already
    // updated files are not touched again.
    expect(snapshotTree(installed.path)).toEqual(moduleTreeBefore);
  });

  it('rewrites a local card type referencing the renamed field type', async () => {
    const installed = installModule({
      prefix: 'mod',
      location: 'file:/modules/mod',
      version: '1.0.0',
      fieldTypes: ['priority'],
    });
    const resolved = stageModule({
      prefix: 'mod',
      location: 'file:/modules/mod',
      version: '2.0.0',
      seals: [
        {
          from: '0.0.0',
          to: '2.0.0',
          lines: [renameEntry('mod', 'severity', 'priority')],
        },
      ],
      fieldTypes: ['priority'],
    });
    writeLocalCardType('modref', [
      {
        name: 'mod/fieldTypes/severity',
        displayName: 'Severity',
        isCalculated: true,
      },
    ]);

    const project = await loadProject();
    const steps = await planModuleReplays([resolved], [installed]);
    await executeModuleReplays(project, steps);

    // The customFields entry keeps its shape — only the name is rewritten,
    // sibling properties survive.
    const cardType = JSON.parse(
      readFileSync(
        join(projectPath, '.cards', 'local', 'cardTypes', 'modref.json'),
        'utf8',
      ),
    );
    expect(cardType.customFields).toEqual([
      {
        name: 'mod/fieldTypes/priority',
        displayName: 'Severity',
        isCalculated: true,
      },
    ]);
  });

  // The non-null value matters: rewriting the card's content regenerates its
  // clingo facts, and fact generation resolves the field type behind every
  // non-null custom metadata key — so the cascade must have renamed the key
  // before the content rewrite for the replay to succeed.
  it('renames a card metadata key with a non-null value for the renamed field type', async () => {
    const installed = installModule({
      prefix: 'mod',
      location: 'file:/modules/mod',
      version: '1.0.0',
      fieldTypes: ['priority'],
    });
    const resolved = stageModule({
      prefix: 'mod',
      location: 'file:/modules/mod',
      version: '2.0.0',
      seals: [
        {
          from: '0.0.0',
          to: '2.0.0',
          lines: [renameEntry('mod', 'severity', 'priority')],
        },
      ],
      fieldTypes: ['priority'],
    });
    seedCardMetadataKey('mod/fieldTypes/severity', 'high');
    seedCardContent(['mod/fieldTypes/severity']);

    const project = await loadProject();
    const steps = await planModuleReplays([resolved], [installed]);
    await executeModuleReplays(project, steps);

    const metadata = JSON.parse(
      readFileSync(join(cardDir, 'index.json'), 'utf8'),
    );
    expect(metadata).not.toHaveProperty('mod/fieldTypes/severity');
    expect(metadata).toHaveProperty('mod/fieldTypes/priority', 'high');

    // The content rewrite — and the clingo fact regeneration it triggers —
    // completed against the new field type name.
    const adoc = readFileSync(join(cardDir, 'index.adoc'), 'utf8');
    expect(adoc).toContain('mod/fieldTypes/priority');
    expect(adoc).not.toContain('mod/fieldTypes/severity');
  });

  it('replays two modules with skewed versions, dependencies first', async () => {
    const installedAlpha = installModule({
      prefix: 'alpha',
      location: 'file:/modules/alpha',
      version: '2.0.0',
      fieldTypes: ['effort'],
    });
    const resolvedAlpha = stageModule({
      prefix: 'alpha',
      location: 'file:/modules/alpha',
      version: '2.9.0',
      seals: [
        {
          from: '2.0.0',
          to: '2.9.0',
          lines: [renameEntry('alpha', 'cost', 'effort')],
        },
      ],
      fieldTypes: ['effort'],
    });
    const installedBeta = installModule({
      prefix: 'beta',
      location: 'file:/modules/beta',
      version: '2.1.0',
      fieldTypes: ['impact'],
    });
    const resolvedBeta = stageModule({
      prefix: 'beta',
      location: 'file:/modules/beta',
      version: '2.7.0',
      seals: [
        {
          from: '2.1.0',
          to: '2.7.0',
          lines: [renameEntry('beta', 'risk', 'impact')],
        },
      ],
      fieldTypes: ['impact'],
      parent: { project: projectPath, name: 'alpha' },
    });
    seedCardContent(['alpha/fieldTypes/cost', 'beta/fieldTypes/risk']);
    seedCalculationContent(['alpha/fieldTypes/cost', 'beta/fieldTypes/risk']);

    const project = await loadProject();
    // The resolver yields roots before their transitive dependencies.
    const steps = await planModuleReplays(
      [resolvedAlpha, resolvedBeta],
      [installedAlpha, installedBeta],
    );

    expect(steps.map((s) => s.modulePrefix)).toEqual(['beta', 'alpha']);
    expect(steps.map((s) => [s.fromVersion, s.toVersion])).toEqual([
      ['2.1.0', '2.7.0'],
      ['2.0.0', '2.9.0'],
    ]);

    await executeModuleReplays(project, steps);

    for (const content of [
      readFileSync(join(cardDir, 'index.adoc'), 'utf8'),
      readFileSync(calculationFile, 'utf8'),
    ]) {
      expect(content).toContain('alpha/fieldTypes/effort');
      expect(content).toContain('beta/fieldTypes/impact');
      expect(content).not.toContain('alpha/fieldTypes/cost');
      expect(content).not.toContain('beta/fieldTypes/risk');
    }
  });

  it('a mid-chain failure names the module, seal and entry, leaving earlier seals applied', async () => {
    const installed = installModule({
      prefix: 'mod',
      location: 'file:/modules/mod',
      version: '0.0.0',
      fieldTypes: ['two', 'four'],
    });
    // Seal-content shape checks pass at plan time (known operation, string
    // target), but the second entry of the second seal has no
    // parameters.operation.to, so entryToMutationInput throws at EXECUTE
    // time — after the first seal and the second seal's first entry applied.
    const malformedRename = logLine('resource_rename', 'mod/fieldTypes/five', {
      type: 'fieldTypes',
      operation: { name: 'change', target: 'mod/fieldTypes/five' },
    });
    const resolved = stageModule({
      prefix: 'mod',
      location: 'file:/modules/mod',
      version: '2.0.0',
      seals: [
        {
          from: '0.0.0',
          to: '1.0.0',
          lines: [renameEntry('mod', 'one', 'two')],
        },
        {
          from: '1.0.0',
          to: '2.0.0',
          lines: [renameEntry('mod', 'three', 'four'), malformedRename],
        },
      ],
      fieldTypes: ['two', 'four'],
    });
    seedCardContent(['mod/fieldTypes/one', 'mod/fieldTypes/three']);

    const project = await loadProject();
    const steps = await planModuleReplays([resolved], [installed]);
    expect(steps[0].seals).toHaveLength(2);

    const error = await executeModuleReplays(project, steps).catch((e) => e);

    expect(error).toBeInstanceOf(ModuleReplayFailedError);
    expect(error.modulePrefix).toBe('mod');
    expect(error.sealFileName).toBe(formatSealFileName('1.0.0', '2.0.0'));
    expect(error.sequence).toBe(2);
    expect(error.message).toContain("module 'mod'");
    expect(error.message).toContain(formatSealFileName('1.0.0', '2.0.0'));
    expect(error.message).toContain('entry 2');
    expect(error.message).toContain('missing operation.to');

    // Everything before the failing entry already landed on disk.
    const adoc = readFileSync(join(cardDir, 'index.adoc'), 'utf8');
    expect(adoc).toContain('mod/fieldTypes/two');
    expect(adoc).toContain('mod/fieldTypes/four');
  });

  it('chained renames replay existence-blind across intermediate names', async () => {
    const installed = installModule({
      prefix: 'mod',
      location: 'file:/modules/mod',
      version: '1.0.0',
      // Neither 'a' nor the intermediate 'b' exists anywhere on disk.
      fieldTypes: ['c'],
    });
    const resolved = stageModule({
      prefix: 'mod',
      location: 'file:/modules/mod',
      version: '1.2.0',
      seals: [
        {
          from: '1.0.0',
          to: '1.1.0',
          lines: [renameEntry('mod', 'a', 'b')],
        },
        {
          from: '1.1.0',
          to: '1.2.0',
          lines: [renameEntry('mod', 'b', 'c')],
        },
      ],
      fieldTypes: ['c'],
    });
    seedCardContent(['mod/fieldTypes/a']);
    seedCalculationContent(['mod/fieldTypes/a']);

    const project = await loadProject();
    const steps = await planModuleReplays([resolved], [installed]);
    expect(steps[0].seals.map((s) => s.seal.fileName)).toEqual([
      formatSealFileName('1.0.0', '1.1.0'),
      formatSealFileName('1.1.0', '1.2.0'),
    ]);

    await executeModuleReplays(project, steps);

    for (const content of [
      readFileSync(join(cardDir, 'index.adoc'), 'utf8'),
      readFileSync(calculationFile, 'utf8'),
    ]) {
      expect(content).toContain('mod/fieldTypes/c');
      expect(content).not.toContain('mod/fieldTypes/a');
      expect(content).not.toContain('mod/fieldTypes/b');
    }
  });
});
