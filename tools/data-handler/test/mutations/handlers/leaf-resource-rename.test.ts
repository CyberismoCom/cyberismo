import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../../src/containers/project.js';
import { resourceName } from '../../../src/utils/resource-utils.js';
import { copyDir } from '../../../src/utils/file-utils.js';
import { ResourceMutations } from '../../../src/mutations/resource-mutations.js';

const FIXTURE_PATH = join(
  import.meta.dirname,
  '..',
  '..',
  'test-data',
  'valid',
  'decision-records',
);

interface LeafCase {
  type: 'calculations' | 'reports' | 'graphModels' | 'graphViews' | 'templates';
  label: string;
  oldName: string;
  newIdentifier: string;
  newName: string;
}

const CASES: LeafCase[] = [
  {
    type: 'calculations',
    label: 'Calculation',
    oldName: 'decision/calculations/test',
    newIdentifier: 'test-v2',
    newName: 'decision/calculations/test-v2',
  },
  {
    type: 'reports',
    label: 'Report',
    oldName: 'decision/reports/testReport',
    newIdentifier: 'testReportV2',
    newName: 'decision/reports/testReportV2',
  },
  {
    type: 'graphModels',
    label: 'Graph model',
    oldName: 'decision/graphModels/test',
    newIdentifier: 'test-v2',
    newName: 'decision/graphModels/test-v2',
  },
  {
    type: 'graphViews',
    label: 'Graph view',
    oldName: 'decision/graphViews/test',
    newIdentifier: 'test-v2',
    newName: 'decision/graphViews/test-v2',
  },
  {
    type: 'templates',
    label: 'Template',
    oldName: 'decision/templates/decision',
    newIdentifier: 'decision-v2',
    newName: 'decision/templates/decision-v2',
  },
];

describe.each(CASES)(
  'LeafResourceRenameHandler ($type)',
  ({ type, oldName, newIdentifier, newName }) => {
    let project: Project;
    const tmpDir = join(import.meta.dirname, `tmp-${type}-rename`);

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

    it('apply renames the resource', async () => {
      const mutations = new ResourceMutations(project);
      await mutations.apply({
        kind: 'rename',
        target: resourceName(oldName),
        newIdentifier,
      });

      expect(project.resources.exists(oldName)).toBe(false);
      expect(project.resources.exists(newName)).toBe(true);
    });

    it('apply throws when the resource does not exist', async () => {
      const mutations = new ResourceMutations(project);
      await expect(
        mutations.apply({
          kind: 'rename',
          target: resourceName(`decision/${type}/does-not-exist`),
          newIdentifier: 'whatever',
        }),
      ).rejects.toThrow();
    });
  },
);

// Report-specific: the cascade in ReportResource.rename rewrites card content
// references to the old report name.
describe('LeafResourceRenameHandler (reports) card content cascade', () => {
  let project: Project;
  const tmpDir = join(import.meta.dirname, 'tmp-reports-rename-cascade');

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

  it('apply rewrites card content references', async () => {
    const oldName = 'decision/reports/testReport';
    const newName = 'decision/reports/testReportV2';
    const cardContentPath = join(
      project.paths.cardRootFolder,
      'decision_5',
      'index.adoc',
    );
    // Sanity: the fixture card references the old report name to start with.
    expect(await readFile(cardContentPath, 'utf-8')).toContain(oldName);

    const mutations = new ResourceMutations(project);
    await mutations.apply({
      kind: 'rename',
      target: resourceName(oldName),
      newIdentifier: 'testReportV2',
    });

    expect(project.resources.exists(oldName)).toBe(false);
    expect(project.resources.exists(newName)).toBe(true);

    const after = await readFile(cardContentPath, 'utf-8');
    expect(after).toContain(newName);
    expect(after).not.toContain(`"${oldName}"`);
  });
});

// Graph-model-specific: the cascade must rewrite references to the old name
// inside the graph model's own template file (model.lp), which lives in the
// resource folder. Guards against the cascade falling back to the project-wide
// report handlebar set and never scanning model.lp.
describe('LeafResourceRenameHandler (graphModels) own model.lp cascade', () => {
  let project: Project;
  const tmpDir = join(import.meta.dirname, 'tmp-graphmodels-rename-cascade');
  const oldName = 'decision/graphModels/test';
  const newName = 'decision/graphModels/test-v2';

  beforeEach(async () => {
    const projectPath = join(tmpDir, `proj-${Date.now()}-${Math.random()}`);
    await mkdir(projectPath, { recursive: true });
    await copyDir(FIXTURE_PATH, projectPath);
    // Seed the graph model's own template (model.lp) with a reference to the
    // old name BEFORE the project caches load the content files.
    // Wrap the reference in quotes so the old name is not a substring of the
    // new name (which appends `-v2` to the old identifier).
    const oldModelFile = join(
      projectPath,
      '.cards',
      'local',
      'graphModels',
      'test',
      'model.lp',
    );
    await writeFile(oldModelFile, `% references "${oldName}"\n`, 'utf-8');
    project = new Project(projectPath);
    await project.populateCaches();
  });
  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('apply rewrites references inside the graph model own model.lp', async () => {
    const mutations = new ResourceMutations(project);
    await mutations.apply({
      kind: 'rename',
      target: resourceName(oldName),
      newIdentifier: 'test-v2',
    });

    expect(project.resources.exists(oldName)).toBe(false);
    expect(project.resources.exists(newName)).toBe(true);

    // The model.lp now lives in the renamed folder; its content must reference
    // the new name and no longer the old one.
    const newModelFile = join(
      project.paths.resourcesFolder,
      'graphModels',
      'test-v2',
      'model.lp',
    );
    const after = await readFile(newModelFile, 'utf-8');
    expect(after).toContain(`"${newName}"`);
    expect(after).not.toContain(`"${oldName}"`);
  });
});

// Skill-specific: skills are leaf folder resources too. The fixture has no
// skills, so seed one (metadata + content folder) before the caches load, then
// verify the rename moves both the metadata file and the content folder.
describe('LeafResourceRenameHandler (skills)', () => {
  let project: Project;
  const tmpDir = join(import.meta.dirname, 'tmp-skills-rename');
  const oldName = 'decision/skills/testSkill';
  const newName = 'decision/skills/testSkillV2';

  beforeEach(async () => {
    const projectPath = join(tmpDir, `proj-${Date.now()}-${Math.random()}`);
    await mkdir(projectPath, { recursive: true });
    await copyDir(FIXTURE_PATH, projectPath);

    const skillsFolder = join(projectPath, '.cards', 'local', 'skills');
    await mkdir(join(skillsFolder, 'testSkill'), { recursive: true });
    await writeFile(
      join(skillsFolder, '.schema'),
      JSON.stringify([{ version: 1, id: 'skillSchema' }]),
      'utf-8',
    );
    await writeFile(
      join(skillsFolder, 'testSkill.json'),
      JSON.stringify({
        name: oldName,
        displayName: 'Test skill',
        relatedTools: [],
      }),
      'utf-8',
    );
    await writeFile(
      join(skillsFolder, 'testSkill', 'skill.md'),
      '# Test skill\n',
      'utf-8',
    );
    await writeFile(join(skillsFolder, 'testSkill', 'query.lp'), '', 'utf-8');

    project = new Project(projectPath);
    await project.populateCaches();
  });
  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('apply renames the skill metadata and content folder', async () => {
    const mutations = new ResourceMutations(project);
    await mutations.apply({
      kind: 'rename',
      target: resourceName(oldName),
      newIdentifier: 'testSkillV2',
    });

    expect(project.resources.exists(oldName)).toBe(false);
    expect(project.resources.exists(newName)).toBe(true);

    // The content folder moved with the metadata.
    const newSkillContent = join(
      project.paths.resourcesFolder,
      'skills',
      'testSkillV2',
      'skill.md',
    );
    expect(await readFile(newSkillContent, 'utf-8')).toContain('# Test skill');
  });
});
