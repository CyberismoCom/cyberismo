// tools/data-handler/test/mutations/integration-template-rename.test.ts

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdir, rm, readFile } from 'node:fs/promises';
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
const tmpDir = join(import.meta.dirname, 'tmp-integration-template-rename');

describe('Template rename end-to-end', () => {
  let project: Project;
  let projectPath: string;

  beforeAll(async () => {
    projectPath = join(tmpDir, `proj-${Date.now()}`);
    await mkdir(projectPath, { recursive: true });
    await copyDir(FIXTURE_PATH, projectPath);
    project = new Project(projectPath);
    await project.populateCaches();
  });
  afterAll(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('plan → apply → log entry; references rewritten', async () => {
    const templates = project.resources.templates();
    if (templates.length === 0) return;
    const template = templates[0];
    const oldName = template.data!.name;
    const newIdent = `${template.resourceName.identifier}-renamed`;

    const mutations = new ResourceMutations(project);
    const input = {
      kind: 'rename' as const,
      target: resourceName(oldName),
      newIdentifier: newIdent,
    };
    const plan = await mutations.plan(input);
    expect(plan.isBreaking).toBe(true);

    await mutations.apply(input, { fingerprint: plan.fingerprint });

    // No card content still references the old template name.
    for (const card of project.cards(undefined)) {
      const adoc = join(card.path, 'index.adoc');
      let content: string;
      try {
        content = await readFile(adoc, 'utf-8');
      } catch {
        continue;
      }
      expect(content).not.toContain(oldName);
    }

    const entries = await ConfigurationLogger.entries(project.basePath);
    expect(
      entries.some(
        (e) => e.kind === 'resource_rename' && e.target === oldName,
      ),
    ).toBe(true);
  });
});
