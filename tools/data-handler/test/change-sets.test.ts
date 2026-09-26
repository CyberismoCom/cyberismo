import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';

import { CommandManager } from '../src/command-manager.js';
import {
  ChangeSetBehindError,
  ChangeSetManager,
} from '../src/changesets/change-set-manager.js';
import type { CardsChanged } from '../src/containers/project.js';
import { copyDir, pathExists } from '../src/utils/file-utils.js';
import { runWithCommitContext } from '../src/utils/commit-context.js';

const alice = { name: 'Alice', email: 'alice@example.com', id: 'alice' };
const bob = { name: 'Bob', email: 'bob@example.com', id: 'bob' };
const template = 'decision/templates/decision';

describe('ChangeSetManager', () => {
  let dir: string;
  let projectPath: string;
  let main: CommandManager;
  let manager: ChangeSetManager;

  const as = <T>(
    author: typeof alice,
    fn: () => Promise<T>,
    actor: 'human' | 'agent' = 'human',
  ) =>
    runWithCommitContext(
      {
        author,
        actor:
          actor === 'agent'
            ? { kind: 'agent', name: 'bot' }
            : { kind: 'human' },
      },
      fn,
    );
  const title = (commands: CommandManager, key: string) =>
    commands.project.findCard(key).metadata?.title;
  const content = (commands: CommandManager, key: string) =>
    commands.project.findCard(key).content;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'change-sets-test-'));
    projectPath = join(dir, 'decision-records');
    await copyDir('test/test-data/valid/decision-records', projectPath);
    main = new CommandManager(projectPath, { autocommit: true });
    await main.initialize();
    manager = new ChangeSetManager(main, {
      worktreesRoot: join(dir, 'worktrees'),
    });
  });

  afterEach(async () => {
    manager.dispose();
    main.project.dispose();
    await rm(dir, { recursive: true, force: true });
  });

  it('starts from main, committing its uncommitted changes first', async () => {
    const cardFile = join(projectPath, 'cardRoot', 'decision_5', 'index.adoc');
    await writeFile(cardFile, 'Edited outside the app');

    const info = await as(alice, () => manager.create('Rework decisions'));

    expect(info).toMatchObject({
      title: 'Rework decisions',
      owner: alice,
      status: 'active',
      branch: `cyberismo/changesets/${info.id}`,
    });
    expect(await main.project.git.hasUncommittedChanges()).toBe(false);
    expect(info.base).toBe(await main.project.git.headCommit());
    expect(await manager.list()).toEqual([info]);
    const changeSet = await manager.open(info.id);
    expect(content(changeSet, 'decision_5')).toBe('Edited outside the app');
  });

  it('keeps its changes away from main and lists them per card', async () => {
    const { id } = await as(alice, () => manager.create('Rework'));
    const changeSet = await manager.open(id);

    await as(alice, () =>
      changeSet.editCmd.editCardMetadata('decision_5', 'title', 'Retitled'),
    );
    const [created] = await as(
      alice,
      () => changeSet.createCmd.createCard(template, 'decision_5'),
      'agent',
    );
    await as(alice, () => changeSet.moveCmd.moveCard('decision_6', 'root'));
    await as(alice, () =>
      changeSet.editCmd.editCardContent('decision_6', 'New content'),
    );

    expect(title(main, 'decision_5')).not.toBe('Retitled');
    expect(() => main.project.findCard(created.key)).toThrow();

    const { cards, resources } = await manager.changes(id);
    expect(resources).toEqual([]);
    const byKey = Object.fromEntries(cards.map((card) => [card.key, card]));
    expect(Object.keys(byKey).sort()).toEqual(
      [created.key, 'decision_5', 'decision_6'].sort(),
    );
    expect(byKey.decision_5).toMatchObject({
      kind: 'modified',
      title: 'Retitled',
      contentChanged: false,
      reviewed: false,
    });
    expect(byKey.decision_5.fields).toContainEqual({
      field: 'title',
      before: expect.any(String),
      after: 'Retitled',
    });
    expect(byKey[created.key]).toMatchObject({ kind: 'created' });
    expect(byKey[created.key].commits[0]).toMatchObject({
      author: { name: 'Alice', email: 'alice@example.com' },
      actor: 'agent',
      agent: 'bot',
    });
    expect(byKey.decision_6).toMatchObject({
      kind: 'moved',
      parent: { before: 'decision_5', after: 'root' },
      contentChanged: true,
    });
  });

  it('counts a card as reviewed only as it was when reviewed', async () => {
    const { id } = await as(alice, () => manager.create('Review'));
    const changeSet = await manager.open(id);
    await as(alice, () =>
      changeSet.editCmd.editCardContent('decision_5', 'One'),
    );

    await manager.markReviewed(id, 'decision_5');
    expect((await manager.changes(id)).cards[0].reviewed).toBe(true);

    await as(alice, () =>
      changeSet.editCmd.editCardContent('decision_5', 'Two'),
    );
    expect((await manager.changes(id)).cards[0].reviewed).toBe(false);
  });

  it('reverts a card to how it was, whatever the change', async () => {
    const { id } = await as(alice, () => manager.create('Revert'));
    const changeSet = await manager.open(id);
    const originalContent = content(changeSet, 'decision_5');
    const [created] = await as(alice, () =>
      changeSet.createCmd.createCard(template, 'decision_5'),
    );
    await as(alice, () =>
      changeSet.editCmd.editCardContent('decision_5', 'Changed'),
    );
    await as(alice, () => changeSet.removeCmd.remove('card', 'decision_6'));

    await as(alice, () => manager.revertCard(id, 'decision_5'));
    await as(alice, () => manager.revertCard(id, created.key));
    await as(alice, () => manager.revertCard(id, 'decision_6'));

    expect(content(changeSet, 'decision_5')).toBe(originalContent);
    expect(() => changeSet.project.findCard(created.key)).toThrow();
    expect(changeSet.project.findCard('decision_6').parent).toBe('decision_5');
    expect((await manager.changes(id)).cards).toEqual([]);
  });

  it('moves a moved card back', async () => {
    const { id } = await as(alice, () => manager.create('Move back'));
    const changeSet = await manager.open(id);
    await as(alice, () => changeSet.moveCmd.moveCard('decision_6', 'root'));

    await as(alice, () => manager.revertCard(id, 'decision_6'));

    expect(changeSet.project.findCard('decision_6').parent).toBe('decision_5');
    expect((await manager.changes(id)).cards).toEqual([]);
  });

  it('brings in main, merging card metadata field by field', async () => {
    const { id } = await as(alice, () => manager.create('Update'));
    const changeSet = await manager.open(id);
    await as(alice, () =>
      changeSet.editCmd.editCardMetadata(
        'decision_5',
        'title',
        'From changeSet',
      ),
    );
    await as(bob, () =>
      main.editCmd.editCardContent('decision_5', 'Main content'),
    );
    await as(bob, () =>
      main.editCmd.editCardMetadata('decision_6', 'title', 'From main'),
    );
    // Both sides stamp 'lastUpdated' on decision_5: a conflict git cannot settle
    await as(bob, () =>
      main.transitionCmd
        .cardTransition('decision_5', 'Approve')
        .catch(() => undefined),
    );

    const result = await as(alice, () => manager.update(id));

    expect(result).toEqual({ updated: true, conflicts: [] });
    expect(title(changeSet, 'decision_5')).toBe('From changeSet');
    expect(content(changeSet, 'decision_5')).toBe('Main content');
    expect(title(changeSet, 'decision_6')).toBe('From main');
    expect(await manager.update(id)).toEqual({ updated: false, conflicts: [] });
  });

  it('returns conflicts it cannot settle, and applies resolutions', async () => {
    const { id } = await as(alice, () => manager.create('Conflict'));
    const changeSet = await manager.open(id);
    await as(alice, () =>
      changeSet.editCmd.editCardMetadata('decision_5', 'title', 'Ours'),
    );
    await as(alice, () =>
      changeSet.editCmd.editCardContent('decision_6', 'Ours'),
    );
    await as(bob, () =>
      main.editCmd.editCardMetadata('decision_5', 'title', 'Theirs'),
    );
    await as(bob, () => main.editCmd.editCardContent('decision_6', 'Theirs'));

    const first = await as(alice, () => manager.update(id));
    expect(first.updated).toBe(false);
    const paths = first.conflicts.map((conflict) => conflict.path).sort();
    expect(paths).toEqual([
      'cardRoot/decision_5/c/decision_6/index.adoc',
      'cardRoot/decision_5/index.json',
    ]);
    expect(first.conflicts.find((c) => c.key === 'decision_5')?.fields).toEqual(
      ['title'],
    );
    // The attempt left the changeSet as it was
    expect(title(changeSet, 'decision_5')).toBe('Ours');

    const second = await as(alice, () =>
      manager.update(id, {
        'cardRoot/decision_5/index.json': 'theirs',
        'cardRoot/decision_5/c/decision_6/index.adoc': { content: 'Both' },
      }),
    );
    expect(second).toEqual({ updated: true, conflicts: [] });
    expect(title(changeSet, 'decision_5')).toBe('Theirs');
    expect(content(changeSet, 'decision_6')).toBe('Both');
  });

  it('merges into main once up to date, as the approver', async () => {
    const { id } = await as(alice, () => manager.create('Ship it'));
    const changeSet = await manager.open(id);
    await as(alice, () =>
      changeSet.editCmd.editCardContent('decision_6', 'Shipped'),
    );
    await as(bob, () =>
      main.editCmd.editCardContent('decision_5', 'Main moved on'),
    );

    await expect(as(bob, () => manager.merge(id))).rejects.toBeInstanceOf(
      ChangeSetBehindError,
    );
    await as(alice, () => manager.update(id));

    const changes: CardsChanged[] = [];
    main.project.onCardsChanged((change) => changes.push(change));
    const info = await as(bob, () => manager.merge(id));

    expect(info).toMatchObject({ status: 'merged', merged: { by: bob } });
    expect(content(main, 'decision_6')).toBe('Shipped');
    expect(content(main, 'decision_5')).toBe('Main moved on');
    expect(changes).toEqual([
      expect.objectContaining({
        updated: ['decision_6'],
        removed: [],
        author: bob,
      }),
    ]);
    const git = simpleGit(projectPath);
    const merge = await git.raw([
      'log',
      '-1',
      '--format=%an%n%P%n%(trailers:only,unfold)',
    ]);
    const [author, parents, ...trailers] = merge.trim().split('\n');
    expect(author).toBe('Bob');
    expect(parents.split(' ')).toHaveLength(2);
    expect(trailers).toContain(`Cyberismo-ChangeSet: ${id}`);
    expect(await git.raw(['branch', '--list', info.branch])).toBe('');
    expect(
      (
        await git.raw(['rev-parse', `refs/cyberismo/changesets/merged/${id}`])
      ).trim(),
    ).toMatch(/^[0-9a-f]{40}$/);
    await expect(manager.open(id)).rejects.toThrow('merged');
  });

  it('refuses to merge changes that add validation errors', async () => {
    const { id } = await as(alice, () => manager.create('Broken'));
    const changeSet = await manager.open(id);
    const metadataPath = join(
      changeSet.project.basePath,
      'cardRoot',
      'decision_5',
      'index.json',
    );
    const metadata = JSON.parse(await readFile(metadataPath, 'utf-8'));
    await writeFile(
      metadataPath,
      JSON.stringify({ ...metadata, cardType: 42 }),
    );
    await changeSet.project.git.commit('Break a card');

    await expect(as(bob, () => manager.merge(id))).rejects.toThrow(
      'does not validate',
    );
    expect((await manager.get(id)).status).toBe('active');
  });

  it('discards a changeSet, keeping its work recoverable', async () => {
    const { id } = await as(alice, () => manager.create('Abandon'));
    const changeSet = await manager.open(id);
    await as(alice, () =>
      changeSet.editCmd.editCardContent('decision_5', 'Draft'),
    );
    const worktree = changeSet.project.basePath;

    await manager.discard(id);

    expect((await manager.get(id)).status).toBe('discarded');
    expect(pathExists(worktree)).toBe(false);
    const git = simpleGit(projectPath);
    const archived = (
      await git.raw(['rev-parse', `refs/cyberismo/changesets/discarded/${id}`])
    ).trim();
    expect(
      await git.raw(['show', `${archived}:cardRoot/decision_5/index.adoc`]),
    ).toBe('Draft');
  });

  it('includes edits made in its folder outside the app', async () => {
    const { id } = await as(alice, () => manager.create('By hand'));
    const cardFile = join(
      await manager.projectPathOf(id),
      'cardRoot',
      'decision_5',
      'index.adoc',
    );
    await writeFile(cardFile, 'Edited by hand');

    const { cards } = await as(alice, () => manager.changes(id));

    expect(cards).toMatchObject([
      { key: 'decision_5', kind: 'modified', contentChanged: true },
    ]);
    expect(cards[0].commits[0].author.name).toBe('Alice');
  });

  it('checks a changeSet out again when its worktree went missing', async () => {
    const { id } = await as(alice, () => manager.create('Recover'));
    const changeSet = await manager.open(id);
    await as(alice, () =>
      changeSet.editCmd.editCardContent('decision_5', 'Kept'),
    );
    manager.close(id);
    await rm(changeSet.project.basePath, { recursive: true, force: true });

    const reopened = await manager.open(id);

    expect(content(reopened, 'decision_5')).toBe('Kept');
  });
});
