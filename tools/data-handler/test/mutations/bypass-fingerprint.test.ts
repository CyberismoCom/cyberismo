// tools/data-handler/test/mutations/bypass-fingerprint.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../src/containers/project.js';
import { ResourceMutations } from '../../src/mutations/plan.js';
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
const tmpDir = join(import.meta.dirname, 'tmp-bypass-fingerprint');

/**
 * `bypassFingerprint: true` is the escape hatch the module-update replay
 * uses to apply someone else's breaking change against the consumer without
 * insisting on a fingerprint round-trip. Without the flag, an apply that
 * has cascade effects must carry a valid fingerprint or it is rejected.
 *
 * PR1 only ships LinkType handlers, so this test exercises a LinkType rename;
 * the bypass behaviour is independent of the resource type.
 */
describe('ResourceMutations.apply with bypassFingerprint', () => {
  let project: Project;
  let projectPath: string;

  beforeEach(async () => {
    projectPath = join(tmpDir, `proj-${Date.now()}`);
    await mkdir(projectPath, { recursive: true });
    await copyDir(FIXTURE_PATH, projectPath);

    // Seed a card link that uses the 'test' link type so the cascade has
    // something to rewrite (otherwise affectedLinkCount would be 0 and the
    // fingerprint check would be skipped).
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

  it('rejects a cascade-affecting rename without fingerprint by default', async () => {
    const mutations = new ResourceMutations(project);
    const input = {
      kind: 'rename' as const,
      target: resourceName(`${project.projectPrefix}/linkTypes/test`),
      newIdentifier: 'is-caused-by',
    };
    await expect(mutations.apply(input)).rejects.toThrow(
      /fingerprint required/,
    );
  });

  it('applies the same rename when bypassFingerprint is set', async () => {
    const mutations = new ResourceMutations(project);
    const input = {
      kind: 'rename' as const,
      target: resourceName(`${project.projectPrefix}/linkTypes/test`),
      newIdentifier: 'is-caused-by',
    };
    const result = await mutations.apply(input, { bypassFingerprint: true });
    expect(result).toEqual({ success: true });

    // The cascade still ran: every card link that referenced the old name
    // now points at the new name.
    const cards = project.cards(undefined);
    const oldRef = `${project.projectPrefix}/linkTypes/test`;
    const newRef = `${project.projectPrefix}/linkTypes/is-caused-by`;
    let sawNew = false;
    for (const card of cards) {
      for (const link of card.metadata?.links ?? []) {
        expect(link.linkType).not.toBe(oldRef);
        if (link.linkType === newRef) sawNew = true;
      }
    }
    expect(sawNew).toBe(true);
  });
});
