import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CommandManager } from '../src/command-manager.js';
import type { CardsChanged } from '../src/containers/project.js';
import { copyDir } from '../src/utils/file-utils.js';
import { runWithCommitContext } from '../src/utils/commit-context.js';

const author = { name: 'Alice', email: 'alice@example.com', id: 'alice' };

describe('Project.onCardsChanged', () => {
  let dir: string;
  let commands: CommandManager;
  let changes: CardsChanged[];

  async function open(autocommit: boolean) {
    commands = new CommandManager(join(dir, 'decision-records'), {
      autocommit,
    });
    await commands.initialize();
    changes = [];
    commands.project.onCardsChanged((change) => changes.push(change));
  }

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'card-changes-test-'));
    await copyDir(
      'test/test-data/valid/decision-records',
      join(dir, 'decision-records'),
    );
  });

  afterEach(async () => {
    commands.project.dispose();
    await rm(dir, {
      recursive: true,
      force: true,
      // Git may still be tidying the repository in the background
      maxRetries: 5,
      retryDelay: 100,
    });
  });

  it('reports each write once, with who made it', async () => {
    await open(false);
    await runWithCommitContext(
      { author, actor: { kind: 'agent', name: 'claude' } },
      () => commands.editCmd.editCardContent('decision_5', 'Edited'),
    );
    expect(changes).toEqual([
      {
        updated: ['decision_5'],
        removed: [],
        author,
        actor: { kind: 'agent', name: 'claude' },
      },
    ]);
  });

  it('reports an atomic write as one change', async () => {
    await open(false);
    await commands.atomic(async () => {
      await commands.editCmd.editCardContent('decision_5', 'One');
      await commands.editCmd.editCardContent('decision_6', 'Two');
    }, 'Edit two cards');
    expect(changes.map((change) => change.updated)).toEqual([
      ['decision_5', 'decision_6'],
    ]);
  });

  it('reports nothing for a write that changes no card', async () => {
    await open(false);
    await commands.editCmd.editCardMetadata(
      'decision_5',
      'title',
      commands.project.findCard('decision_5').metadata!.title,
    );
    expect(changes).toEqual([]);
  });

  it('names the target of a link, whose inbound links changed', async () => {
    await open(false);
    await commands.createCmd.createLink(
      'decision_5',
      'decision_6',
      'decision/linkTypes/test',
    );
    expect(changes.map((change) => change.updated)).toEqual([
      ['decision_5', 'decision_6'],
    ]);
  });

  it('reports removed cards separately', async () => {
    await open(false);
    await commands.removeCmd.remove('card', 'decision_6');
    expect(
      changes.map(({ updated, removed }) => ({ updated, removed })),
    ).toEqual([{ updated: [], removed: ['decision_6'] }]);
  });

  it('reports nothing for a write that was rolled back', async () => {
    await open(true);
    await expect(
      commands.atomic(async () => {
        await commands.editCmd.editCardContent('decision_5', 'Lost');
        throw new Error('boom');
      }, 'Failing write'),
    ).rejects.toThrow('boom');
    expect(changes).toEqual([]);

    await commands.editCmd.editCardContent('decision_6', 'Kept');
    expect(changes.map((change) => change.updated)).toEqual([['decision_6']]);
  });

  it('stops reporting once unsubscribed', async () => {
    await open(false);
    const late: CardsChanged[] = [];
    const unsubscribe = commands.project.onCardsChanged((change) =>
      late.push(change),
    );
    unsubscribe();
    await commands.editCmd.editCardContent('decision_5', 'Edited');
    expect(late).toEqual([]);
    expect(changes).toHaveLength(1);
  });
});
