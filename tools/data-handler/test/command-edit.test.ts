import { expect } from 'chai';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

import { copyDir } from '../src/utils/file-utils.js';
import { CommandManager } from '../src/command-manager.js';
import { type Edit } from '../src/commands/index.js';

describe('edit card', () => {
  const baseDir = import.meta.dirname;
  const testDir = join(baseDir, 'tmp-edit-tests');
  const decisionRecordsPath = join(testDir, 'valid/decision-records');
  let commands: CommandManager;
  let editCmd: Edit;

  before(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data/', testDir);
    commands = new CommandManager(decisionRecordsPath, {
      autoSaveConfiguration: false,
    });
    await commands.initialize();
    editCmd = commands.editCmd;
  });

  after(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('edit card content (success)', async () => {
    const cards = commands.project.cards();
    const firstCard = cards.at(0);

    // Modify content
    if (firstCard) {
      await editCmd.editCardContent(firstCard.key, 'whoopie');

      // Fetch the changed card again
      const changedCard = commands.project.findCard(firstCard.key);
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
    const templateCards = commands.project.templateCards(
      'decision/templates/decision',
    );
    const firstCard = templateCards.at(0);
    if (!firstCard) {
      throw new Error('No template cards found');
    }
    await editCmd.editCardContent(firstCard.key, 'whoopie');
    const changedCard = commands.project.findCard(firstCard.key);
    if (changedCard) {
      expect(changedCard.content).to.equal('whoopie');
    } else {
      expect(false);
    }
  });

  it('edit card content - no content', async () => {
    const cards = commands.project.cards();
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
    const cards = commands.project.cards();
    const firstCard = cards.at(0);
    if (firstCard) {
      expect(() => editCmd.editCard(firstCard.key + 1)).throws(
        "Card 'decision_51' does not exist in the project",
      );
    }
  });
  // @todo: Make sinon fake/mock for user preferences
  // it('try to edit card from CLI (success)', async () => {
  //     const decisionRecordsPath = join(testDir, 'valid/decision-records');
  //     const project = new Project(decisionRecordsPath);
  //     const cards = project.cards();
  //     const firstCard = cards.at(0);
  //     if (firstCard) {
  //         const EditCmd = new Edit();
  //         const result = await EditCmd.editCard(project.basePath, firstCard.key);
  //         expect(result.statusCode).to.equal(400);
  //     }
  // });

  it('edit card metadata (success)', async () => {
    const cards = commands.project.cards();
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
      const changedCard = commands.project.findCard(firstCard.key);
      expect(changedCard.metadata?.title).to.equal('new name');
    } else {
      expect(false);
    }
  });
  it('edit card metadata - template card', async () => {
    // Create a fresh CommandManager instance to avoid test isolation issues
    const freshTestDir = join(baseDir, 'tmp-edit-template-test');
    mkdirSync(freshTestDir, { recursive: true });
    try {
      await copyDir('test/test-data/', freshTestDir);
      const freshDecisionRecordsPath = join(
        freshTestDir,
        'valid/decision-records',
      );
      const freshCommands = new CommandManager(freshDecisionRecordsPath, {
        autoSaveConfiguration: false,
      });
      await freshCommands.initialize();
      const freshEditCmd = freshCommands.editCmd;

      const templateCards = freshCommands.project.templateCards(
        'decision/templates/decision',
      );
      const firstCard = templateCards.at(0);
      if (!firstCard) {
        throw new Error('No template cards found');
      }
      await freshEditCmd.editCardMetadata(firstCard.key, 'title', 'new name');
      if (!firstCard) {
        expect(false);
      }
      const changedCard = freshCommands.project.findCard(firstCard.key);
      if (changedCard) {
        expect(changedCard.metadata?.title).to.equal('new name');
      } else {
        expect(false);
      }
    } finally {
      rmSync(freshTestDir, { recursive: true, force: true });
    }
  });
  it('try to edit card metadata - incorrect field name', async () => {
    const cards = commands.project.cards();
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
});
