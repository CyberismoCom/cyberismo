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
  ModuleReplayConflictError,
  ModuleReplayFailedError,
  executeModuleReplays,
  planModuleReplays,
} from '../../../src/mutations/replay/replay.js';
import { formatSealFileName } from '../../../src/mutations/replay/seal-files.js';
import { toVersion } from '../../../src/modules/types.js';

import type { ConfigurationLogEntry } from '../../../src/utils/configuration-logger.js';
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

function logLine(
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

/** The released log-entry shape ResourceMutations.recordLogEntry writes. */
function renameEntry(prefix: string, oldId: string, newId: string): string {
  const oldName = `${prefix}/fieldTypes/${oldId}`;
  const newName = `${prefix}/fieldTypes/${newId}`;
  return logLine('resource_rename', oldName, {
    type: 'fieldTypes',
    operation: { name: 'change', target: oldName, to: newName },
  });
}

interface SealSpec {
  from: string;
  to: string;
  lines: string[];
}

function writeSeals(folder: string, seals: SealSpec[]): void {
  mkdirSync(folder, { recursive: true });
  for (const seal of seals) {
    writeFileSync(
      join(folder, formatSealFileName(seal.from, seal.to)),
      seal.lines.join('\n') + '\n',
    );
  }
}

function writeFieldTypes(folder: string, prefix: string, ids: string[]): void {
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
  const dir = join(projectPath, '.cards', 'modules', spec.prefix);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'cardsConfig.json'),
    JSON.stringify({
      cardKeyPrefix: spec.prefix,
      name: spec.prefix,
      modules: [],
    }),
  );
  writeSeals(join(dir, 'migrations'), spec.seals ?? []);
  writeFieldTypes(join(dir, 'fieldTypes'), spec.prefix, spec.fieldTypes ?? []);
  return {
    project: projectPath,
    name: spec.prefix,
    source: { location: spec.location },
    version: toVersion(spec.version),
    path: dir,
    declaredDependencies: [],
  };
}

function stageModule(
  spec: ModuleSpec & { parent?: InstallationRef },
): ResolvedModule {
  const stagedPath = join(stagedRoot, spec.prefix);
  writeSeals(
    join(stagedPath, '.cards', 'local', 'migrations'),
    spec.seals ?? [],
  );
  writeFieldTypes(
    join(stagedPath, '.cards', 'local', 'fieldTypes'),
    spec.prefix,
    spec.fieldTypes ?? [],
  );
  return {
    declaration: {
      project: projectPath,
      name: spec.prefix,
      source: { location: spec.location },
      ...(spec.parent ? { parent: spec.parent } : {}),
    },
    remoteUrl: spec.location,
    version: toVersion(spec.version),
    stagedPath,
  };
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

function writeLocalCardType(identifier: string, fieldRefs: string[]): void {
  writeFileSync(
    join(projectPath, '.cards', 'local', 'cardTypes', `${identifier}.json`),
    JSON.stringify({
      name: `decision/cardTypes/${identifier}`,
      displayName: identifier,
      workflow: 'decision/workflows/decision',
      customFields: fieldRefs.map((name) => ({ name })),
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
    // A null value: rewriting the card's content regenerates its clingo
    // facts, and fact generation resolves the field type behind every
    // NON-null custom metadata key — which would fail for a key whose
    // field type was renamed away (pinned separately below).
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

    // FieldTypeRenameHandler's cascade rewrites content-file refs, card
    // content and local card-type customFields — it does NOT rewrite card
    // metadata keys (only the project_rename cascade touches those), so the
    // stale key survives the replay.
    const metadata = JSON.parse(
      readFileSync(join(cardDir, 'index.json'), 'utf8'),
    );
    expect(metadata).toHaveProperty('mod/fieldTypes/severity');
    expect(metadata).not.toHaveProperty('mod/fieldTypes/priority');

    // Replayed entries are never recorded in the consumer's own log.
    expect(existsSync(consumerMigrationLogDir)).toBe(false);

    // The replay cascades into the consumer only; the module's already
    // updated files are not touched again.
    expect(snapshotTree(installed.path)).toEqual(moduleTreeBefore);
  });

  // KNOWN GAP: the rename cascade cannot rewrite a LOCAL card type's
  // customFields reference to a module field type. updateCardTypes goes
  // through CardTypeResource.update, whose validateFieldType requires the
  // OLD name to still exist — but after the module update the old field
  // type's file is gone, so the replay fails. (Even with the old file
  // present, ArrayHandler.handleChange would replace the `{name}` object
  // with a bare string, which the card-type schema rejects.) When the
  // cascade learns to rewrite customFields, flip this test to assert the
  // card type ends up referencing 'mod/fieldTypes/priority'.
  it('a local card type referencing the renamed field type currently fails the replay', async () => {
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
    writeLocalCardType('modref', ['mod/fieldTypes/severity']);

    const project = await loadProject();
    const steps = await planModuleReplays([resolved], [installed]);
    const error = await executeModuleReplays(project, steps).catch((e) => e);

    expect(error).toBeInstanceOf(ModuleReplayFailedError);
    expect(error.modulePrefix).toBe('mod');
    expect(error.sealFileName).toBe(formatSealFileName('0.0.0', '2.0.0'));
    expect(error.sequence).toBe(1);
    expect(error.message).toContain('does not exist in the project');

    const cardType = JSON.parse(
      readFileSync(
        join(projectPath, '.cards', 'local', 'cardTypes', 'modref.json'),
        'utf8',
      ),
    );
    expect(cardType.customFields).toEqual([
      { name: 'mod/fieldTypes/severity' },
    ]);
  });

  // KNOWN GAP: the cascade does not rewrite card metadata keys, and a stale
  // key is not merely cosmetic. Rewriting the card's content (the adoc
  // mentions the old name) regenerates the card's clingo facts, and fact
  // generation resolves the field type behind every non-null custom metadata
  // key — the renamed-away field type no longer exists, so the replay fails.
  it('a card whose metadata carries a value for the renamed field type currently fails the replay', async () => {
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
    const error = await executeModuleReplays(project, steps).catch((e) => e);

    expect(error).toBeInstanceOf(ModuleReplayFailedError);
    expect(error.modulePrefix).toBe('mod');
    expect(error.sealFileName).toBe(formatSealFileName('0.0.0', '2.0.0'));
    expect(error.sequence).toBe(1);
    expect(error.message).toContain(
      "FieldType 'mod/fieldTypes/severity' does not exist",
    );
  });

  it('a non-linear installed chain is refused and the project is untouched', async () => {
    const installed = installModule({
      prefix: 'mod',
      location: 'file:/modules/mod',
      version: '2.7.0',
      seals: [
        {
          from: '2.0.0',
          to: '2.6.0',
          lines: [renameEntry('mod', 'old', 'mid')],
        },
        {
          from: '2.6.0',
          to: '2.7.0',
          lines: [renameEntry('mod', 'mid', 'late')],
        },
      ],
      fieldTypes: ['late'],
    });
    // The target tree carries 2.6.0 -> 3.0.0 instead of the installed
    // 2.6.0 -> 2.7.0 seal: the consumer's history is not a prefix of the
    // target's, so replaying would apply changes twice or not at all.
    const resolved = stageModule({
      prefix: 'mod',
      location: 'file:/modules/mod',
      version: '3.0.0',
      seals: [
        {
          from: '2.0.0',
          to: '2.6.0',
          lines: [renameEntry('mod', 'old', 'mid')],
        },
        {
          from: '2.6.0',
          to: '3.0.0',
          lines: [renameEntry('mod', 'mid', 'final')],
        },
      ],
      fieldTypes: ['final'],
    });
    seedCardContent(['mod/fieldTypes/late']);
    seedCalculationContent(['mod/fieldTypes/late']);

    const projectBefore = snapshotTree(projectPath);
    const error = await planModuleReplays([resolved], [installed]).catch(
      (e) => e,
    );

    expect(error).toBeInstanceOf(ModuleReplayConflictError);
    expect(error.conflicts).toEqual([
      {
        modulePrefix: 'mod',
        kind: 'non_linear',
        detail: expect.stringContaining(formatSealFileName('2.6.0', '2.7.0')),
      },
    ]);
    expect(error.message).toContain('No files were changed.');
    expect(snapshotTree(projectPath)).toEqual(projectBefore);
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
