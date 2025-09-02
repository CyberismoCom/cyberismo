import { expect } from 'chai';
import { dirname, join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

import { copyDir } from '../src/utils/file-utils.js';
import { CommandManager } from '../src/command-manager.js';
import { type Edit } from '../src/commands/index.js';
import { fileURLToPath } from 'node:url';
import type { ResourceName } from '../src/resources/file-resource.js';

describe('edit card', () => {
  const baseDir = dirname(fileURLToPath(import.meta.url));
  const testDir = join(baseDir, 'tmp-edit-tests');
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

  it('edit card content (success)', async () => {
    const cards = await commands.project.cards();
    const firstCard = cards.at(0);

    // Modify content
    if (firstCard) {
      await editCmd.editCardContent(firstCard.key, 'whoopie');

      // Fetch the changed card again
      const changedCard = await commands.project.findSpecificCard(
        firstCard.key,
        {
          metadata: true,
          content: true,
        },
      );
      if (changedCard) {
        expect(changedCard.content).to.equal('whoopie');
        expect(changedCard.metadata?.lastUpdated).to.not.equal(
          firstCard.metadata?.lastUpdated,
        );
      } else {
        expect(false);
      }
    } else {
      expect(false);
    }
  });
  it('edit card content - template card', async () => {
    const templateCards = await commands.project.templateCards(
      'decision/templates/decision',
    );
    const firstCard = templateCards.at(0);
    if (!firstCard) {
      throw new Error('No template cards found');
    }
    await editCmd.editCardContent(firstCard.key, 'whoopie');
    const changedCard = await commands.project.findSpecificCard(firstCard.key, {
      metadata: true,
      content: true,
    });
    if (changedCard) {
      expect(changedCard.content).to.equal('whoopie');
    } else {
      expect(false);
    }
  });

  it('edit card content - no content', async () => {
    const cards = await commands.project.cards();
    const firstCard = cards.at(0);
    if (firstCard) {
      await editCmd
        .editCardContent(firstCard.key, '')
        .then(() => {
          expect(true);
        })
        .catch(() => {
          expect(false);
        });
    }
  });

  it('try to edit card content - card is not in project', async () => {
    await editCmd
      .editCardContent('card-key-does-not-exist', 'whoopie')
      .then(() => {
        expect(false);
      })
      .catch(() => {
        expect(true);
      });
  });

  it('try to edit card from CLI - no project', async () => {
    const cards = await commands.project.cards();
    const firstCard = cards.at(0);
    if (firstCard) {
      await expect(editCmd.editCard(firstCard.key + 1)).to.be.rejectedWith(
        "Card 'decision_51' does not exist in the project",
      );
    }
  });
  // @todo: Make sinon fake/mock for user preferences
  // it('try to edit card from CLI (success)', async () => {
  //     const decisionRecordsPath = join(testDir, 'valid/decision-records');
  //     const project = new Project(decisionRecordsPath);
  //     const cards = await project.cards();
  //     const firstCard = cards.at(0);
  //     if (firstCard) {
  //         const EditCmd = new Edit();
  //         const result = await EditCmd.editCard(project.basePath, firstCard.key);
  //         expect(result.statusCode).to.equal(400);
  //     }
  // });

  it('edit card metadata (success)', async () => {
    const cards = await commands.project.cards();
    const firstCard = cards.at(0);

    // Modify metadata - title
    if (firstCard) {
      await editCmd
        .editCardMetadata(firstCard.key, 'title', 'new name')
        .then(() => {
          expect(true);
        })
        .catch(() => {
          expect(false);
        });

      // Fetch the changed card again
      const changedCard = await commands.project.findSpecificCard(
        firstCard.key,
        {
          metadata: true,
          content: true,
        },
      );
      if (changedCard) {
        if (changedCard.metadata) {
          expect(changedCard.metadata.title).to.equal('new name');
        }
      } else {
        expect(false);
      }
    } else {
      expect(false);
    }
  });
  it('edit card metadata - template card', async () => {
    const templateCards = await commands.project.templateCards(
      'decision/templates/decision',
    );
    const firstCard = templateCards.at(0);
    if (!firstCard) {
      throw new Error('No template cards found');
    }
    await editCmd.editCardMetadata(firstCard.key, 'title', 'new name');
    if (!firstCard) {
      expect(false);
    }
    const changedCard = await commands.project.findSpecificCard(firstCard.key, {
      metadata: true,
      content: true,
    });
    if (changedCard) {
      expect(changedCard.metadata?.title).to.equal('new name');
    } else {
      expect(false);
    }
  });
  it('try to edit card metadata - incorrect field name', async () => {
    const cards = await commands.project.cards();
    const firstCard = cards.at(0);
    if (firstCard) {
      await editCmd
        .editCardMetadata(firstCard.key, '', '')
        .then(() => {
          expect(false);
        })
        .catch(() => {
          expect(true);
        });
    }
  });

  it('try to edit card metadata - card is not in project', async () => {
    const EditCmd = commands.editCmd;
    await EditCmd.editCardMetadata(
      'card-key-does-not-exist',
      'whoopie',
      'whoopie',
    )
      .then(() => {
        expect(false);
      })
      .catch(() => {
        expect(true);
      });
  });
  it('edit folder resource content', async () => {
    const resourceName = {
      prefix: 'decision',
      type: 'graphViews',
      identifier: 'test',
    };
    await editCmd.editResourceContent(resourceName, 'view.lp.hbs', 'whoopie');
    const content = await commands.showCmd.showFile(
      resourceName,
      'view.lp.hbs',
    );
    expect(content).to.equal('whoopie');
  });
  it('try to edit folder resource content - file is not whitelisted', async () => {
    const resourceName = {
      prefix: 'decision',
      type: 'graphViews',
      identifier: 'test',
    };
    await expect(
      editCmd.editResourceContent(resourceName, 'random.file', 'whoopie'),
    ).to.be.rejectedWith("File 'random.file' is not whitelisted");
  });
  describe('edit calculation', () => {
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
});
