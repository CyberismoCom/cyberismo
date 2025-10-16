// testing
import { expect } from 'chai';

// node
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

import { type CardType } from '../src/interfaces/resource-interfaces.js';
import { copyDir } from '../src/utils/file-utils.js';
import { Project } from '../src/containers/project.js';
import { ResourceCollector } from '../src/containers/project/resource-collector.js';
import { Show, Update } from '../src/commands/index.js';

const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-update-tests');
const decisionRecordsPath = join(testDir, 'valid/decision-records');
let project: Project;
let update: Update;
let collector: ResourceCollector;

describe('update command', () => {
  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data', testDir);

    project = new Project(decisionRecordsPath);
    await project.populateCaches();
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

  it('update resource - rank item using string value (name)', async () => {
    const show = new Show(project);
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
    const show = new Show(project);
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

  it('update card type workflow with complete state mapping (success)', async () => {
    const name = `${project.projectPrefix}/cardTypes/decision`;
    const currentWorkflow = `${project.projectPrefix}/workflows/decision`;
    const newWorkflow = `${project.projectPrefix}/workflows/simple`;

    // current workflow (decision) states: Draft, Approved, Rejected, Rerejected, Deprecated
    // new workflow (simple) states: Created, Approved, Deprecated
    const stateMap = {
      stateMapping: {
        Draft: 'Created',
        Approved: 'Approved',
        Rejected: 'Deprecated',
        Rerejected: 'Deprecated',
        Deprecated: 'Deprecated',
      },
    };

    await update.updateValue(
      name,
      'change',
      'workflow',
      currentWorkflow,
      newWorkflow,
      stateMap,
    );

    collector.changed();
    const cardType = await project.resource<CardType>(name);
    expect(cardType?.workflow).to.equal(newWorkflow);
  });

  it('try to update card type workflow with incomplete state mapping (failure)', async () => {
    const name = `${project.projectPrefix}/cardTypes/decision`;
    const currentWorkflow = `${project.projectPrefix}/workflows/decision`;
    const newWorkflow = `${project.projectPrefix}/workflows/simple`;
    const incompleteMapping = {
      stateMapping: {
        Draft: 'Created',
        Approved: 'Approved',
        // Missing: Rejected, Rerejected, Deprecated
      },
    };

    await expect(
      update.updateValue(
        name,
        'change',
        'workflow',
        currentWorkflow,
        newWorkflow,
        incompleteMapping,
      ),
    ).to.be.rejectedWith('State mapping validation failed');
  });

  it('try to update card type workflow with invalid target states (failure)', async () => {
    const name = `${project.projectPrefix}/cardTypes/decision`;
    const currentWorkflow = `${project.projectPrefix}/workflows/decision`;
    const newWorkflow = `${project.projectPrefix}/workflows/simple`;
    const invalidTargetMapping = {
      stateMapping: {
        Draft: 'InvalidState', // This state doesn't exist in simple workflow
        Approved: 'Approved',
        Rejected: 'Deprecated',
        Rerejected: 'Deprecated',
        Deprecated: 'Deprecated',
      },
    };

    await expect(
      update.updateValue(
        name,
        'change',
        'workflow',
        currentWorkflow,
        newWorkflow,
        invalidTargetMapping,
      ),
    ).to.be.rejectedWith('State mapping validation failed');
  });
});
