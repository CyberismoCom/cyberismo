import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { access, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../../src/containers/project.js';
import { ProjectRenameHandler } from '../../../src/mutations/handlers/project-rename.js';
import { dispatch } from '../../../src/mutations/dispatcher.js';
import { copyDir } from '../../../src/utils/file-utils.js';
import { resourceName } from '../../../src/utils/resource-utils.js';
import { ResourceMutations } from '../../../src/mutations/resource-mutations.js';

const FIXTURE_PATH = join(
  import.meta.dirname,
  '..',
  '..',
  'test-data',
  'valid',
  'decision-records',
);
const tmpDir = join(import.meta.dirname, 'tmp-project-rename');

describe('ProjectRenameHandler', () => {
  let project: Project;

  beforeEach(async () => {
    const projectPath = join(tmpDir, `proj-${Date.now()}-${Math.random()}`);
    await mkdir(projectPath, { recursive: true });
    await copyDir(FIXTURE_PATH, projectPath);
    project = new Project(projectPath);
    await project.populateCaches();
  });
  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('routes only project_rename inputs to this handler', () => {
    const projectRename = dispatch({
      project,
      input: { kind: 'project_rename', newPrefix: 'renamed' },
    });
    expect(projectRename.handler).toBeInstanceOf(ProjectRenameHandler);

    const resourceRename = dispatch({
      project,
      input: {
        kind: 'rename' as const,
        target: resourceName(`${project.projectPrefix}/cardTypes/decision`),
        newIdentifier: 'choice',
      },
    });
    expect(resourceRename.handler).not.toBeInstanceOf(ProjectRenameHandler);
  });

  it('is registered as breaking', () => {
    const { breaking } = dispatch({
      project,
      input: { kind: 'project_rename', newPrefix: 'renamed' },
    });
    expect(breaking).toBe(true);
  });

  it('apply rewrites cardType references in every card', async () => {
    const oldPrefix = project.projectPrefix;
    const newPrefix = 'renamed';
    const mutations = new ResourceMutations(project);

    await mutations.apply({ kind: 'project_rename', newPrefix });

    expect(project.projectPrefix).toBe(newPrefix);

    for (const card of project.cards(undefined)) {
      // Cards that referenced cardTypes under oldPrefix must now reference newPrefix.
      if (card.metadata?.cardType?.startsWith(`${oldPrefix}/`)) {
        expect.fail(`card '${card.key}' still references old prefix`);
      }
    }
  });

  it('apply rewrites resource references in card content adoc files', async () => {
    const oldPrefix = project.projectPrefix;
    const newPrefix = 'renamed';
    const mutations = new ResourceMutations(project);

    await mutations.apply({ kind: 'project_rename', newPrefix });

    for (const card of project.cards(undefined)) {
      const adoc = join(card.path, 'index.adoc');
      let content: string;
      try {
        content = await readFile(adoc, 'utf-8');
      } catch {
        continue;
      }
      // No remaining "<oldPrefix>/<resourceType>/" substring (the strict
      // cascade pattern that updateFiles uses).
      for (const type of [
        'calculations',
        'cardTypes',
        'fieldTypes',
        'linkTypes',
        'reports',
        'templates',
        'workflows',
      ]) {
        expect(content).not.toContain(`${oldPrefix}/${type}/`);
      }
    }
  });

  it('apply rewrites internal references of card types and link types', async () => {
    const newPrefix = 'renamed';
    const mutations = new ResourceMutations(project);

    await mutations.apply({ kind: 'project_rename', newPrefix });

    const cardType = project.resources
      .byType(`${newPrefix}/cardTypes/decision`, 'cardTypes')
      .show();
    expect(cardType.workflow).toBe(`${newPrefix}/workflows/decision`);
    for (const field of cardType.customFields) {
      expect(field.name.startsWith(`${newPrefix}/fieldTypes/`)).toBe(true);
    }

    const linkType = project.resources
      .byType(`${newPrefix}/linkTypes/testTypes`, 'linkTypes')
      .show();
    expect(linkType.sourceCardTypes).toEqual([
      `${newPrefix}/cardTypes/decision`,
    ]);
    expect(linkType.destinationCardTypes).toEqual([
      `${newPrefix}/cardTypes/simplepage`,
    ]);
  });

  it('apply renames cards whose key starts with the old prefix', async () => {
    const oldPrefix = project.projectPrefix;
    const newPrefix = 'renamed';
    const mutations = new ResourceMutations(project);

    await mutations.apply({ kind: 'project_rename', newPrefix });

    for (const card of project.cards(undefined)) {
      expect(card.key.startsWith(`${oldPrefix}_`)).toBe(false);
    }
  });

  it('throws when renaming to the current prefix', async () => {
    const mutations = new ResourceMutations(project);
    const current = project.projectPrefix;
    await expect(
      mutations.apply({ kind: 'project_rename', newPrefix: current }),
    ).rejects.toThrow(`Project prefix is already '${current}'`);
  });

  it('foreign module prefix rename cascades into local references only', async () => {
    const cardPath = join(project.paths.cardRootFolder, 'decision_5');
    await writeFile(
      join(cardPath, 'index.json'),
      JSON.stringify(
        {
          cardType: 'mod/cardTypes/page',
          title: 'Module-typed card',
          workflowState: 'Created',
          rank: '0|a',
          lastUpdated: '2026-03-17T11:11:39.624Z',
          links: [],
        },
        null,
        4,
      ),
    );
    await writeFile(
      join(cardPath, 'index.adoc'),
      'See mod_1 and mod/workflows/flow for details.\n' +
        'Graphs: mod/graphModels/x and mod/graphViews/y.\n',
    );
    project = new Project(project.basePath);
    await project.populateCaches();

    const mutations = new ResourceMutations(project);
    await mutations.apply(
      { kind: 'project_rename', newPrefix: 'newmod', oldPrefix: 'mod' },
      { kind: 'replay', modulePrefix: 'newmod' },
    );

    const metadata = JSON.parse(
      await readFile(join(cardPath, 'index.json'), 'utf-8'),
    );
    expect(metadata.cardType).toBe('newmod/cardTypes/page');

    const content = await readFile(join(cardPath, 'index.adoc'), 'utf-8');
    expect(content).toContain('newmod_1');
    expect(content).toContain('newmod/workflows/flow');
    expect(content).toContain('newmod/graphModels/x');
    expect(content).toContain('newmod/graphViews/y');
    expect(content).not.toMatch(/(?<!new)mod_1/);
    expect(content).not.toMatch(/(?<!new)mod\/workflows/);
    expect(content).not.toMatch(/(?<!new)mod\/graph/);

    // The consumer project itself must not be renamed.
    const config = JSON.parse(
      await readFile(project.paths.configurationFile, 'utf-8'),
    );
    expect(config.cardKeyPrefix).toBe('decision');

    // Local resource files keep their names.
    await expect(
      access(join(project.paths.resourcesFolder, 'workflows', 'decision.json')),
    ).resolves.toBeUndefined();
  });

  it('replay without oldPrefix rejects and changes nothing', async () => {
    const cardPath = join(project.paths.cardRootFolder, 'decision_5');
    await writeFile(
      join(cardPath, 'index.adoc'),
      'See mod_1 and mod/workflows/flow for details.\n',
    );
    project = new Project(project.basePath);
    await project.populateCaches();

    const mutations = new ResourceMutations(project);
    await expect(
      mutations.apply(
        { kind: 'project_rename', newPrefix: 'newmod' },
        { kind: 'replay', modulePrefix: 'newmod' },
      ),
    ).rejects.toThrow(/requires oldPrefix/);

    const content = await readFile(join(cardPath, 'index.adoc'), 'utf-8');
    expect(content).toBe('See mod_1 and mod/workflows/flow for details.\n');
    const config = JSON.parse(
      await readFile(project.paths.configurationFile, 'utf-8'),
    );
    expect(config.cardKeyPrefix).toBe('decision');
  });

  it('throws for an invalid prefix', async () => {
    const mutations = new ResourceMutations(project);
    // Underscore is not a valid prefix character (setCardPrefix rejects it).
    await expect(
      mutations.apply({ kind: 'project_rename', newPrefix: 'bad_prefix' }),
    ).rejects.toThrow();
  });
});
