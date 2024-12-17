// testing
import { expect } from 'chai';

// node
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

import { copyDir } from '../src/utils/file-utils.js';
import { Project } from '../src/containers/project.js';
import { ResourceCollector } from '../src/containers/project/resource-collector.js';

import { Update } from '../src/update.js';

describe('Update command tests', async () => {
  const baseDir = dirname(fileURLToPath(import.meta.url));
  const testDir = join(baseDir, 'tmp-resource-tests');
  const decisionRecordsPath = join(testDir, 'valid/decision-records');
  mkdirSync(testDir, { recursive: true });
  await copyDir('test/test-data/', testDir);

  const project = new Project(decisionRecordsPath);
  const update = new Update(project);

  it('update folder file resource', async () => {
    const collector = new ResourceCollector(project);
    collector.collectLocalResources();
    const name = `${project.projectPrefix}/workflows/decision`;
    const fileName = `${name}.json`;
    const exists = await collector.resourceExists('workflows', fileName);
    expect(exists).to.equal(true);

    const newName = `${project.projectPrefix}/workflows/newName`;

    await update.updateValue(fileName, 'change', 'name', newName);
    collector.changed();
    const workflows = await project.workflows();
    let found = false;
    for (const wf of workflows) {
      if (wf.name === newName + '.json') {
        found = true;
      }
    }
    expect(found).to.equal(true);
  });

  it('try to update folder file resource with invalid data', async () => {
    const collector = new ResourceCollector(project);
    collector.collectLocalResources();
    const name = `${project.projectPrefix}/workflows/simple`;
    const fileName = `${name}.json`;
    const exists = await collector.resourceExists('workflows', fileName);
    expect(exists).to.equal(true);

    const invalidName = `${project.projectPrefix}/workflows/newName111`;
    await update
      .updateValue(fileName, 'change', 'name', invalidName)
      .then(() => {
        expect(false).to.equal(true);
      })
      .catch((error) => {
        expect(error.message).to.equal(
          "Resource identifier must follow naming rules. Identifier 'newName111' is invalid",
        );
      });
  });
});
