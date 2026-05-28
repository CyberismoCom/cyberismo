import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../src/containers/project.js';
import { ResourceMutations } from '../../src/mutations/plan.js';
import { ConfigurationLogger } from '../../src/utils/configuration-logger.js';
import { resourceName } from '../../src/utils/resource-utils.js';
import { copyDir } from '../../src/utils/file-utils.js';

const FIXTURE_PATH = join(
  import.meta.dirname,
  '..',
  '..',
  'test',
  'test-data',
  'valid',
  'decision-records',
);
const tmpDir = join(import.meta.dirname, 'tmp-integration');

describe('mutation engine end-to-end', () => {
  let project: Project;
  let projectPath: string;

  beforeEach(async () => {
    projectPath = join(tmpDir, `proj-${Date.now()}`);
    await mkdir(projectPath, { recursive: true });
    await copyDir(FIXTURE_PATH, projectPath);

    // Seed a card link that uses the 'test' link type so the cascade has
    // something to rewrite.
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

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('plan → apply → log entry', async () => {
    const mutations = new ResourceMutations(project);
    const input = {
      kind: 'rename' as const,
      target: resourceName(`${project.projectPrefix}/linkTypes/test`),
      newIdentifier: 'is-caused-by',
    };

    const plan = await mutations.plan(input);
    expect(plan.isBreaking).toBe(true);
    expect(plan.preview.affectedLinkCount).toBeGreaterThan(0);

    await mutations.apply(input, { fingerprint: plan.fingerprint });

    const entries = await ConfigurationLogger.entries(project.basePath);
    const renameEntry = entries.find((e) => e.kind === 'resource_rename');
    expect(renameEntry).toBeDefined();
    expect(renameEntry!.target).toBe(`${project.projectPrefix}/linkTypes/test`);
  });

  it('refuses stale fingerprint after the project state changes', async () => {
    const mutations = new ResourceMutations(project);
    const input = {
      kind: 'rename' as const,
      target: resourceName(`${project.projectPrefix}/linkTypes/test`),
      newIdentifier: 'is-caused-by',
    };
    const plan = await mutations.plan(input);

    // Mutate one of the affected cards out-of-band.
    const cards = project.cards(undefined);
    if (cards.length > 0 && cards[0].metadata) {
      cards[0].metadata.title = `${cards[0].metadata.title} (changed)`;
      await project.updateCardMetadata(cards[0], cards[0].metadata);
    }

    await expect(
      mutations.apply(input, { fingerprint: plan.fingerprint }),
    ).rejects.toThrow(/stale/i);
  });
});
