// testing
import { expect } from 'chai';

// node
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, rmSync } from 'node:fs';

import { type CardType } from '../src/interfaces/resource-interfaces.js';
import { copyDir } from '../src/utils/file-utils.js';
import { Project } from '../src/containers/project.js';
import { ResourceCollector } from '../src/containers/project/resource-collector.js';
import { Calculate, Show, Update } from '../src/commands/index.js';

const baseDir = dirname(fileURLToPath(import.meta.url));
const testDir = join(baseDir, 'tmp-update-tests');
const decisionRecordsPath = join(testDir, 'valid/decision-records');
let project: Project;
let update: Update;
let collector: ResourceCollector;

describe('update command', () => {
  before(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data', testDir);
  });

  after(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    project = new Project(decisionRecordsPath);
    update = new Update(project);
    collector = new ResourceCollector(project);
    collector.collectLocalResources();
  });

  it('update file resource', async () => {
    const name = `${project.projectPrefix}/workflows/decision`;
    const exists = await collector.resourceExists('workflows', name);
    const newName = `${project.projectPrefix}/workflows/newName`;
    expect(exists).to.equal(true);

    await update.updateValue(name, 'change', 'name', newName);
    collector.changed();
    const workflows = await project.workflows();
    let found = false;
    for (const wf of workflows) {
      if (wf.name === newName) {
        found = true;
      }
    }
    expect(found).to.equal(true);
  });
  it('update file resource name using just identifier', async () => {
    const name = `${project.projectPrefix}/workflows/newName`;
    const exists = await collector.resourceExists('workflows', name);
    const newName = `decision`;
    expect(exists).to.equal(true);

    await update.updateValue(name, 'change', 'name', newName);
    collector.changed();
    const workflows = await project.workflows();
    let found = false;
    for (const wf of workflows) {
      if (wf.name === `${project.projectPrefix}/workflows/${newName}`) {
        found = true;
      }
    }
    expect(found).to.equal(true);
  });

  it('update resource - rank item using string value (name)', async () => {
    const calculate = new Calculate(project);
    const show = new Show(project, calculate);
    const name = `${project.projectPrefix}/cardTypes/decision`;
    const fileName = `${name}.json`;
    const moveToIndex = 0;

    let indexBefore = -1;
    let indexAfter = -1;
    const before = await show.showResource(name);
    let found = (before as CardType).customFields.find((item) => {
      return item.name === 'decision/fieldTypes/finished';
    });
    if (found) {
      indexBefore = (before as CardType).customFields.indexOf(found);
    }

    await update.updateValue(
      fileName,
      'rank',
      'customFields',
      'decision/fieldTypes/finished',
      moveToIndex as unknown as string,
    );

    const after = await show.showResource(name);
    found = (after as CardType).customFields.find((item) => {
      return item.name === 'decision/fieldTypes/finished';
    });
    if (found) {
      indexAfter = (after as CardType).customFields.indexOf(found);
    }
    expect(indexBefore).not.to.equal(indexAfter);
    expect(indexAfter).to.equal(moveToIndex);
  });
  it('update resource - rank item using partial object value', async () => {
    const calculate = new Calculate(project);
    const show = new Show(project, calculate);
    const name = `${project.projectPrefix}/cardTypes/decision`;
    const fileName = `${name}.json`;
    const moveToIndex = 4;

    let indexBefore = -1;
    let indexAfter = -1;
    const before = (await show.showResource(name)) as CardType;
    let found = before.customFields.find((item) => {
      return item.name === 'decision/fieldTypes/finished';
    });
    if (found) {
      indexBefore = before.customFields.indexOf(found);
    }

    await update.updateValue(
      fileName,
      'rank',
      'customFields',
      { name: 'decision/fieldTypes/finished' } as CardType,
      moveToIndex as unknown as object,
    );

    const after = (await show.showResource(name)) as CardType;
    found = after.customFields.find((item) => {
      return item.name === 'decision/fieldTypes/finished';
    });
    if (found) {
      indexAfter = after.customFields.indexOf(found);
    }
    expect(indexBefore).not.to.equal(indexAfter);
    expect(indexAfter).to.equal(moveToIndex);
  });

  it('try to update file resource with invalid data', async () => {
    const name = `${project.projectPrefix}/workflows/simple`;
    const exists = await collector.resourceExists('workflows', name);
    const invalidName = `${project.projectPrefix}/workflows/newName-ÄÄÄ`;
    expect(exists).to.equal(true);

    await expect(
      update.updateValue(name, 'change', 'name', invalidName),
    ).to.be.rejectedWith(
      "Resource identifier must follow naming rules. Identifier 'newName-ÄÄÄ' is invalid",
    );
  });
});
