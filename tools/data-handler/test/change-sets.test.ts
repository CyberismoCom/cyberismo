import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';

import { CommandManager } from '../src/command-manager.js';
import {
  CardUnchangedError,
  ChangeSetBehindError,
  ChangeSetManager,
} from '../src/changesets/change-set-manager.js';
import type { CardsChanged } from '../src/containers/project.js';
import { copyDir, pathExists } from '../src/utils/file-utils.js';
import { GitManager } from '../src/utils/git-manager.js';
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

  it('refuses a project that its repository ignores', async () => {
    // The project only sits inside another repository, ignored there
    const outer = join(dir, 'outer');
    await copyDir(
      'test/test-data/valid/decision-records',
      join(outer, 'ignored'),
    );
    await writeFile(join(outer, '.gitignore'), 'ignored/\n');
    const git = simpleGit(outer, {
      config: ['user.name=Test', 'user.email=test@test.com'],
    });
    await git.init();
    await git.add('.');
    await git.commit('Outer');
    const ignored = new CommandManager(join(outer, 'ignored'));
    await ignored.initialize();
    const inside = new ChangeSetManager(ignored, {
      worktreesRoot: join(dir, 'worktrees'),
    });
    try {
      await expect(inside.create('Nope')).rejects.toThrow(
        'Changesets need the project to be in a git repository',
      );
      expect(await git.raw(['branch', '--list'])).not.toContain('cyberismo');
    } finally {
      inside.dispose();
      ignored.project.dispose();
    }
  });

  it('says so clearly when git is too old', async () => {
    const version = vi
      .spyOn(GitManager, 'gitVersion')
      .mockResolvedValue('2.30.1');
    try {
      await expect(manager.create('Old git')).rejects.toThrow(
        'Changesets need git 2.36.0 or newer; this system has 2.30.1',
      );
    } finally {
      version.mockRestore();
    }
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

  it('leaves out cards where only bookkeeping differs', async () => {
    const { id } = await as(alice, () => manager.create('Same'));
    const changeSet = await manager.open(id);
    const commits = async () =>
      (await simpleGit(changeSet.project.basePath).log()).total;
    const before = await commits();
    // Stamps 'lastUpdated' and nothing else
    await as(alice, () =>
      changeSet.editCmd.editCardContent(
        'decision_5',
        content(changeSet, 'decision_5')!,
      ),
    );

    expect(await commits()).toBe(before + 1);
    expect((await manager.changes(id)).cards).toEqual([]);
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
    // Only a card the changeset changed can be reviewed
    await expect(manager.markReviewed(id, 'decision_6')).rejects.toBeInstanceOf(
      CardUnchangedError,
    );
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

    expect(result).toEqual({ updated: true, conflicts: [], removedLinks: [] });
    expect(title(changeSet, 'decision_5')).toBe('From changeSet');
    expect(content(changeSet, 'decision_5')).toBe('Main content');
    expect(title(changeSet, 'decision_6')).toBe('From main');
    expect(await manager.update(id)).toEqual({
      updated: false,
      conflicts: [],
      removedLinks: [],
    });
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
    expect(second).toEqual({ updated: true, conflicts: [], removedLinks: [] });
    expect(title(changeSet, 'decision_5')).toBe('Theirs');
    expect(content(changeSet, 'decision_6')).toBe('Both');
  });

  describe('keeps the card tree whole when git merges files', () => {
    it('asks about a card deleted here while the project added under it', async () => {
      const { id } = await as(alice, () => manager.create('Delete parent'));
      const changeSet = await manager.open(id);
      await as(alice, () => changeSet.removeCmd.remove('card', 'decision_5'));
      const [child] = await as(bob, () =>
        main.createCmd.createCard(template, 'decision_5'),
      );

      const first = await as(alice, () => manager.update(id));
      expect(first).toMatchObject({
        updated: false,
        conflicts: [
          {
            kind: 'card',
            path: 'cardRoot/decision_5',
            key: 'decision_5',
            ours: null,
          },
        ],
      });
      // Nothing changed, and the changeset still loads
      expect(() => changeSet.project.findCard('decision_5')).toThrow();

      // Taking the project's version keeps the card and its new child
      const second = await as(alice, () =>
        manager.update(id, { 'cardRoot/decision_5': 'theirs' }),
      );
      expect(second.updated).toBe(true);
      expect(changeSet.project.findCard('decision_5').metadata).toBeDefined();
      expect(changeSet.project.findCard(child.key).parent).toBe('decision_5');
    });

    it('removes cards added under a card when keeping its deletion', async () => {
      const { id } = await as(alice, () => manager.create('Keep deletion'));
      const changeSet = await manager.open(id);
      await as(alice, () => changeSet.removeCmd.remove('card', 'decision_5'));
      const [child] = await as(bob, () =>
        main.createCmd.createCard(template, 'decision_5'),
      );

      const result = await as(alice, () =>
        manager.update(id, { 'cardRoot/decision_5': 'ours' }),
      );

      expect(result.updated).toBe(true);
      expect(() => changeSet.project.findCard('decision_5')).toThrow();
      expect(() => changeSet.project.findCard(child.key)).toThrow();
    });

    it('asks about a card the project deleted while cards moved under it here', async () => {
      const { id } = await as(alice, () => manager.create('Move under'));
      const changeSet = await manager.open(id);
      const [moved] = await as(alice, () =>
        changeSet.createCmd.createCard(template),
      );
      await as(alice, () =>
        changeSet.moveCmd.moveCard(moved.key, 'decision_6'),
      );
      await as(bob, () => main.removeCmd.remove('card', 'decision_6'));

      const first = await as(alice, () => manager.update(id));
      expect(first.conflicts).toMatchObject([
        {
          kind: 'card',
          path: 'cardRoot/decision_5/c/decision_6',
          theirs: null,
        },
      ]);

      const second = await as(alice, () =>
        manager.update(id, { 'cardRoot/decision_5/c/decision_6': 'ours' }),
      );
      expect(second.updated).toBe(true);
      expect(changeSet.project.findCard(moved.key).parent).toBe('decision_6');
    });

    it('removes links to a card the other side deleted', async () => {
      const { id } = await as(alice, () => manager.create('Dangling link'));
      const changeSet = await manager.open(id);
      await as(alice, () => changeSet.removeCmd.remove('card', 'decision_6'));
      const [linking] = await as(bob, () =>
        main.createCmd.createCard(template),
      );
      await as(bob, () =>
        main.createCmd.createLink(
          linking.key,
          'decision_6',
          'decision/linkTypes/test',
        ),
      );

      const result = await as(alice, () => manager.update(id));

      expect(result).toMatchObject({
        updated: true,
        removedLinks: [
          {
            cardKey: linking.key,
            linkType: 'decision/linkTypes/test',
            target: 'decision_6',
          },
        ],
      });
      expect(changeSet.project.findCard(linking.key).metadata?.links).toEqual(
        [],
      );
    });
  });

  it('undoes an update whose result does not load', async () => {
    const { id, branch } = await as(alice, () => manager.create('Unloadable'));
    const changeSet = await manager.open(id);
    await as(alice, () =>
      changeSet.editCmd.editCardContent('decision_6', 'Mine'),
    );
    await as(bob, () => main.editCmd.editCardContent('decision_5', 'Theirs'));
    const before = await main.project.git.resolveRef(branch);
    const reload = vi
      .spyOn(changeSet.project, 'reload')
      .mockRejectedValueOnce(new Error('cannot load'));

    await expect(as(alice, () => manager.update(id))).rejects.toThrow(
      'cannot load',
    );

    reload.mockRestore();
    expect(await main.project.git.resolveRef(branch)).toBe(before);
    expect(content(changeSet, 'decision_6')).toBe('Mine');
  });

  it('merges a write that was under way when the merge started', async () => {
    const { id } = await as(alice, () => manager.create('In flight'));
    const changeSet = await manager.open(id);
    await as(alice, () =>
      changeSet.editCmd.editCardContent('decision_6', 'First'),
    );
    // A write holding the changeset's lock when the merge begins
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const write = as(alice, () =>
      changeSet.project.lock.write(async () => {
        await held;
        await changeSet.editCmd.editCardContent('decision_6', 'Late');
      }),
    );
    const merge = as(bob, () => manager.merge(id));
    release();
    await write;
    await merge;

    expect(content(main, 'decision_6')).toBe('Late');
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
    expect(trailers).toContain(`Cyberismo-Changeset: ${id}`);
    expect(await git.raw(['branch', '--list', info.branch])).toBe('');
    expect(
      (
        await git.raw(['rev-parse', `refs/cyberismo/changesets/merged/${id}`])
      ).trim(),
    ).toMatch(/^[0-9a-f]{40}$/);
    await expect(manager.open(id)).rejects.toThrow('merged');
  });

  it('brings in project changes that were never committed', async () => {
    // Without autocommit, edits to the project stay uncommitted
    const project = new CommandManager(projectPath);
    await project.initialize();
    const { id } = await as(alice, () => manager.create('Pending'));
    const changeSet = await manager.open(id);
    await as(alice, () =>
      changeSet.editCmd.editCardContent('decision_6', 'Mine'),
    );
    await as(bob, () =>
      project.editCmd.editCardContent('decision_5', 'Uncommitted'),
    );
    expect(await main.project.git.hasUncommittedChanges()).toBe(true);

    await expect(as(bob, () => manager.merge(id))).rejects.toBeInstanceOf(
      ChangeSetBehindError,
    );
    expect(await main.project.git.hasUncommittedChanges()).toBe(false);
    expect(await as(alice, () => manager.update(id))).toEqual({
      updated: true,
      conflicts: [],
      removedLinks: [],
    });
    expect(content(changeSet, 'decision_5')).toBe('Uncommitted');
    await as(bob, () => manager.merge(id));
    project.project.dispose();
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

  it('checks logic programs before merging, alone and together', async () => {
    const { id } = await as(alice, () => manager.create('Programs'));
    const changeSet = await manager.open(id);
    const calculation = join(
      changeSet.project.basePath,
      '.cards/local/calculations/test/calculation.lp',
    );
    // Parses, so loading it succeeds, but cannot be ground: X is unsafe
    await writeFile(calculation, 'unsafe(X) :- test_fact(1).');
    await expect(as(bob, () => manager.merge(id))).rejects.toThrow(
      'Invalid logic program',
    );

    // Each program is fine alone; together they define a constant twice
    await writeFile(calculation, '#const limit = 1.');
    await as(alice, () => changeSet.createCmd.createCalculation('other'));
    await writeFile(
      join(
        changeSet.project.basePath,
        '.cards/local/calculations/other/calculation.lp',
      ),
      '#const limit = 2.',
    );
    await expect(as(bob, () => manager.merge(id))).rejects.toThrow(
      'Logic programs do not run',
    );
    expect((await manager.get(id)).status).toBe('active');
  });

  it('refuses to merge a changeset that renames the project', async () => {
    const { id } = await as(alice, () => manager.create('Rename'));
    const changeSet = await manager.open(id);
    await as(alice, () => changeSet.renameCmd.rename('renamed'));

    await expect(as(bob, () => manager.merge(id))).rejects.toThrow(
      "renames the project from 'decision' to 'renamed'",
    );
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

  it('shows a card before and after its changes', async () => {
    const { id } = await as(alice, () => manager.create('Diff'));
    const changeSet = await manager.open(id);
    const before = content(changeSet, 'decision_5');
    await as(alice, () =>
      changeSet.editCmd.editCardContent('decision_5', 'After'),
    );

    const diff = await manager.cardDiff(id, 'decision_5');

    expect(diff.change.kind).toBe('modified');
    expect(diff.before?.content).toBe(before);
    expect(diff.after?.content).toBe('After');
    expect(diff.after?.metadata.title).toBe(diff.before?.metadata.title);
  });

  it('closes changeSets left unused, keeping their worktrees', async () => {
    const closed: string[] = [];
    manager = new ChangeSetManager(main, {
      worktreesRoot: join(dir, 'worktrees'),
      onClose: (id) => closed.push(id),
    });
    const { id } = await as(alice, () => manager.create('Idle'));
    const changeSet = await manager.open(id);

    manager.closeIdle(60_000);
    expect(closed).toEqual([]);
    manager.closeIdle(-1);

    expect(closed).toEqual([id]);
    expect(pathExists(changeSet.project.basePath)).toBe(true);
    expect(await manager.open(id)).not.toBe(changeSet);
  });

  it('keeps each user’s active changeSet until it is merged', async () => {
    const one = await as(alice, () => manager.create('One'));
    const two = await as(alice, () => manager.create('Two'));
    expect(await manager.getActive('alice')).toBeUndefined();

    await manager.setActive('alice', one.id);
    await manager.setActive('bob', one.id);
    expect((await manager.getActive('alice'))?.id).toBe(one.id);
    await manager.setActive('alice', two.id);
    expect((await manager.getActive('alice'))?.id).toBe(two.id);

    await as(bob, () => manager.merge(one.id));
    expect(await manager.getActive('bob')).toBeUndefined();
    expect((await manager.getActive('alice'))?.id).toBe(two.id);
    await expect(manager.setActive('bob', one.id)).rejects.toThrow('merged');
    await manager.setActive('alice', null);
    expect(await manager.getActive('alice')).toBeUndefined();
    expect((await manager.list()).map((info) => info.id).sort()).toEqual(
      [one.id, two.id].sort(),
    );
  });

  it('finds a worktree checked out under another folder', async () => {
    const { id } = await as(alice, () => manager.create('Elsewhere'));
    const path = await manager.projectPathOf(id);
    const other = new ChangeSetManager(main, {
      worktreesRoot: join(dir, 'other-folder'),
    });
    try {
      expect(await other.projectPathOf(id)).toBe(path);
      expect(content(await other.open(id), 'decision_5')).toBe(
        content(await manager.open(id), 'decision_5'),
      );
    } finally {
      other.dispose();
    }
  });

  it('finishes closing a changeset left half closed', async () => {
    const { id, branch } = await as(alice, () => manager.create('Crashed'));
    const changeSet = await manager.open(id);
    const worktree = changeSet.project.basePath;
    // Record saved as discarded, but the worktree and branch never went
    const record = join(
      projectPath,
      '.git',
      'cyberismo',
      'projects',
      encodeURIComponent('/'),
      'changesets',
      `${id}.json`,
    );
    const info = JSON.parse(await readFile(record, 'utf-8'));
    await writeFile(record, JSON.stringify({ ...info, status: 'discarded' }));

    expect(await manager.cleanUp()).toEqual([id]);

    expect(pathExists(worktree)).toBe(false);
    const git = simpleGit(projectPath);
    expect(await git.raw(['branch', '--list', branch])).toBe('');
    expect(
      (
        await git.raw([
          'rev-parse',
          `refs/cyberismo/changesets/discarded/${id}`,
        ])
      ).trim(),
    ).toMatch(/^[0-9a-f]{40}$/);
    expect(await manager.cleanUp()).toEqual([]);
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
