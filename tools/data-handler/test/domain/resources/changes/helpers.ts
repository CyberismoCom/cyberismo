import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Checkout } from '../../../../src/infra/checkout.js';
import { copyDir } from '../../../../src/shared/utils/file-utils.js';

// Reuse the existing decision-records fixture.
const FIXTURE_PATH = join(
  import.meta.dirname,
  '..',
  '..',
  '..',
  'test-data',
  'valid',
  'decision-records',
);

/**
 * Copies the decision-records fixture into a fresh project directory under
 * `tmpDir` and seeds a card link that uses the fixture's 'test' link type so
 * cascades have something to strip or rewrite.
 * @param tmpDir Directory to create the project under. Remove it with
 *               `deleteDir(tmpDir)` after the test.
 * @returns The project with populated caches.
 */
export async function createLinkSeededProject(
  tmpDir: string,
): Promise<Checkout> {
  const projectPath = join(tmpDir, `proj-${Date.now()}`);
  await mkdir(projectPath, { recursive: true });
  await copyDir(FIXTURE_PATH, projectPath);

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

  const checkout = new Checkout(projectPath);
  await checkout.populateCaches();
  return checkout;
}
