import { expect } from 'chai';
import { dirname, join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { copyDir } from '../src/utils/file-utils.js';
import { CommandManager } from '../src/command-manager.js';
import type { Edit } from '../src/commands/index.js';
import type { ResourceName } from '../src/utils/resource-utils.js';

describe('edit calculation', () => {
  const baseDir = dirname(fileURLToPath(import.meta.url));
  const testDir = join(baseDir, 'tmp-edit-calculation-tests');
  const decisionRecordsPath = join(testDir, 'valid/decision-records');
  let commands: CommandManager;
  let editCmd: Edit;

  before(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data/', testDir);
    commands = new CommandManager(decisionRecordsPath);
    editCmd = commands.editCmd;
  });

  after(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('edits a local calculation (success)', async () => {
    // Use existing test calculation 'test' from test data
    const name: ResourceName = {
      prefix: commands.project.projectPrefix,
      type: 'calculations',
      identifier: 'test',
    };

    const newContent = '% edited content for test calculation\n#const x = 1.';
    await editCmd.editCalculation(name, newContent);

    const filePath = join(
      commands.project.paths.calculationProjectFolder,
      name.identifier + '.lp',
    );
    const fileContent = await readFile(filePath, { encoding: 'utf-8' });
    expect(fileContent).to.equal(newContent);
  });

  it('refuses to edit module/non-local calculation (error)', async () => {
    const name: ResourceName = {
      // Any prefix different from the current project prefix counts as non-local
      prefix: 'someOtherPrefix',
      type: 'calculations',
      identifier: 'test',
    };
    await expect(editCmd.editCalculation(name, '% no-op')).to.be.rejectedWith(
      "Resource 'test' is not a local resource",
    );
  });

  it('error when calculation does not exist', async () => {
    const name: ResourceName = {
      prefix: commands.project.projectPrefix,
      type: 'calculations',
      identifier: 'does-not-exist',
    };
    await expect(editCmd.editCalculation(name, '% no-op')).to.be.rejectedWith(
      `Resource '${name.prefix}/${name.type}/${name.identifier}' does not exist in the project`,
    );
  });
});
