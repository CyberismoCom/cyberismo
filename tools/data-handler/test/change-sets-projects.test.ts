import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';

import { CommandManager } from '../src/command-manager.js';
import { ChangeSetManager } from '../src/changesets/change-set-manager.js';
import { copyDir, pathExists } from '../src/utils/file-utils.js';
import { runWithCommitContext } from '../src/utils/commit-context.js';

const alice = { name: 'Alice', email: 'alice@example.com', id: 'alice' };
const asAlice = <T>(fn: () => Promise<T>) =>
  runWithCommitContext({ author: alice, actor: { kind: 'human' } }, fn);

// A repository holding two projects, 'one' and 'two'
describe(
  'changesets in a repository of several projects',
  { timeout: 30_000 },
  () => {
    let dir: string;
    let repo: string;
    let one: CommandManager;
    let two: CommandManager;
    let managers: ChangeSetManager[];

    const manager = (commands: CommandManager) => {
      const created = new ChangeSetManager(commands, {
        worktreesRoot: join(dir, 'worktrees'),
      });
      managers.push(created);
      return created;
    };

    beforeEach(async () => {
      dir = await mkdtemp(join(tmpdir(), 'change-sets-projects-'));
      repo = join(dir, 'repo');
      for (const name of ['one', 'two']) {
        await copyDir(
          'test/test-data/valid/decision-records',
          join(repo, name),
        );
      }
      const git = simpleGit(repo, {
        config: ['user.name=Test', 'user.email=test@test.com'],
      });
      await git.init();
      await git.add('.');
      await git.commit('Two projects');
      one = new CommandManager(join(repo, 'one'), { autocommit: true });
      two = new CommandManager(join(repo, 'two'), { autocommit: true });
      await one.initialize();
      await two.initialize();
      managers = [];
    });

    afterEach(async () => {
      for (const created of managers) created.dispose();
      one.project.dispose();
      two.project.dispose();
      await rm(dir, {
        recursive: true,
        force: true,
        // Git may still be tidying the repository in the background
        maxRetries: 5,
        retryDelay: 100,
      });
    });

    it('keeps each project’s changesets to itself', async () => {
      const ones = manager(one);
      const twos = manager(two);
      const info = await asAlice(() => ones.create('Only one'));
      await ones.setActive('alice', info.id);

      expect(await twos.list()).toEqual([]);
      expect(await twos.getActive('alice')).toBeUndefined();
      expect((await ones.getActive('alice'))?.id).toBe(info.id);
    });

    it('checks out only its project', async () => {
      const ones = manager(one);
      const { id } = await asAlice(() => ones.create('Sparse'));

      const projectPath = await ones.projectPathOf(id);
      const worktree = join(projectPath, '..');
      expect(pathExists(join(projectPath, 'cardRoot'))).toBe(true);
      expect(pathExists(join(worktree, 'two'))).toBe(false);
      // The main checkout keeps every project
      expect(pathExists(join(repo, 'two', 'cardRoot'))).toBe(true);
    });

    it('merges into its own project only', async () => {
      const ones = manager(one);
      const { id } = await asAlice(() => ones.create('Edit one'));
      const changeSet = await ones.open(id);
      const twoBefore = two.project.findCard('decision_5').content;
      await asAlice(() =>
        changeSet.editCmd.editCardContent('decision_5', 'One only'),
      );

      await asAlice(() => ones.merge(id));

      expect(one.project.findCard('decision_5').content).toBe('One only');
      expect(
        await readFile(
          join(repo, 'two', 'cardRoot', 'decision_5', 'index.adoc'),
          'utf-8',
        ),
      ).toBe(twoBefore);
    });

    it('takes over records kept for the whole repository before', async () => {
      const ones = manager(one);
      const info = await asAlice(() => ones.create('From before'));
      const changeSet = await ones.open(info.id);
      await asAlice(() =>
        changeSet.editCmd.editCardContent('decision_5', 'Changed'),
      );
      await ones.setActive('alice', info.id);
      ones.dispose();

      // Move the record and active state where they used to be
      const common = join(repo, '.git', 'cyberismo');
      const own = join(common, 'projects', 'one');
      await mkdir(join(common, 'changesets'), { recursive: true });
      await rename(
        join(own, 'changesets', `${info.id}.json`),
        join(common, 'changesets', `${info.id}.json`),
      );
      await writeFile(
        join(common, 'active-changesets.json'),
        JSON.stringify({ alice: info.id }),
      );
      await rm(join(own, 'active-changesets.json'));

      const twos = manager(two);
      expect(await twos.list()).toEqual([]);
      const later = manager(one);
      expect((await later.list()).map((record) => record.id)).toEqual([
        info.id,
      ]);
      expect((await later.getActive('alice'))?.id).toBe(info.id);
    });
  },
);
