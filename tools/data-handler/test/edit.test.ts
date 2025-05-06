import { expect } from 'chai';
import { dirname, join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

import { copyDir } from '../src/utils/file-utils.js';
import { CommandManager } from '../src/command-manager.js';
import type { Edit } from '../src/commands/index.js';
import { fileURLToPath } from 'node:url';

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
      try {
        editCmd.editCard(firstCard.key + 1);
        expect(false);
      } catch {
        expect(true);
      }
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
});
