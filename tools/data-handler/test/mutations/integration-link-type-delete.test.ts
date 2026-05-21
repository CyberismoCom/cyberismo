// tools/data-handler/test/mutations/integration-link-type-delete.test.ts

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../src/containers/project.js';
import { ResourceMutations } from '../../src/mutations/plan.js';
import { ConfigurationLogger } from '../../src/utils/configuration-logger.js';
import { copyDir } from '../../src/utils/file-utils.js';
import { resourceName } from '../../src/utils/resource-utils.js';

const FIXTURE_PATH = join(
  import.meta.dirname,
  '..',
  'test-data',
  'valid',
  'decision-records',
);
const tmpDir = join(import.meta.dirname, 'tmp-integration-link-type-delete');

describe('LinkType delete end-to-end', () => {
  let project: Project;
  let projectPath: string;

  beforeAll(async () => {
    projectPath = join(tmpDir, `proj-${Date.now()}`);
    await mkdir(projectPath, { recursive: true });
    await copyDir(FIXTURE_PATH, projectPath);

    // Seed a card link that uses the fixture's 'test' link type so the
    // cascade has something to strip.
    const decision5Path = join(
      projectPath,
      'cardRoot',
      'decision_5',
      'index.json',
    );
    const decision5 = JSON.parse(await readFile(decision5Path, 'utf-8'));
    decision5.links = [
      { linkType: 'decision/linkTypes/test', cardKey: 'decision_6' },
    ];
    await writeFile(decision5Path, JSON.stringify(decision5, null, 4));

    project = new Project(projectPath);
    await project.populateCaches();
  });
  afterAll(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('plan → apply → log entry; links stripped from cards', async () => {
    const linkTypeName = `${project.projectPrefix}/linkTypes/test`;
    const mutations = new ResourceMutations(project);
    const input = {
      kind: 'delete' as const,
      target: resourceName(linkTypeName),
    };
    const plan = await mutations.plan(input);
    expect(plan.isBreaking).toBe(true);
    const linksBefore = project
      .cards(undefined)
      .reduce(
        (n, c) =>
          n +
          (c.metadata?.links?.filter((l) => l.linkType === linkTypeName)
            .length ?? 0),
        0,
      );
    expect(plan.preview.affectedLinkCount).toBe(linksBefore);

    await mutations.apply(input, { fingerprint: plan.fingerprint });

    // Cards no longer reference the deleted link type.
    for (const c of project.cards(undefined)) {
      expect(
        c.metadata?.links?.some((l) => l.linkType === linkTypeName),
      ).not.toBe(true);
    }
    expect(project.resources.exists(linkTypeName)).toBe(false);

    const entries = await ConfigurationLogger.entries(project.basePath);
    const deleteEntries = entries.filter(
      (e) => e.kind === 'resource_delete' && e.target === linkTypeName,
    );
    expect(deleteEntries).toHaveLength(1);
  });
});
