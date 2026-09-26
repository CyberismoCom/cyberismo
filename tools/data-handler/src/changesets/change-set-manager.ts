/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { createHash, randomUUID } from 'node:crypto';
import {
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  rmdir,
  writeFile,
} from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';

import { CommandManager } from '../command-manager.js';
import {
  type CommitAuthor,
  commitTrailers,
  getCommitContext,
  runWithCommitContext,
} from '../utils/commit-context.js';
import { pathExists } from '../utils/file-utils.js';
import { GitManager } from '../utils/git-manager.js';
import { formatJson } from '../utils/json.js';
import { getChildLogger } from '../utils/log-utils.js';
import { cardFileOf } from './card-paths.js';
import {
  type CardChange,
  type ChangeList,
  computeChangeList,
} from './change-list.js';
import { mergeAppendOnlyLog, mergeCardMetadata } from './metadata-merge.js';

/** A changeSet's record, kept beside the repository, outside its history. */
export interface ChangeSetInfo {
  id: string;
  title: string;
  owner?: CommitAuthor;
  created: string;
  /** Main's commit when the changeSet was started. */
  base: string;
  branch: string;
  status: 'active' | 'merged' | 'discarded';
  merged?: { at: string; by?: CommitAuthor; commit: string };
  /** Per card key, the card's fingerprint when it was marked reviewed. */
  reviewed: Record<string, string>;
}

/** A card change, and whether it was reviewed as it stands. */
export interface ReviewedCardChange extends CardChange {
  reviewed: boolean;
}

/** What a changeSet changes, compared with main. */
export interface ChangeSetChanges extends Omit<ChangeList, 'cards'> {
  cards: ReviewedCardChange[];
}

/** A file that updating a changeSet from main could not merge on its own. */
export interface ChangeSetConflict {
  path: string;
  /** The card the file belongs to, if any. */
  key?: string;
  /** For card metadata: the fields changed differently on both sides. */
  fields?: string[];
  /** The file in the common ancestor, the changeSet and main; null: absent. */
  base: string | null;
  ours: string | null;
  theirs: string | null;
}

/** How to settle a conflict: keep a side, or write the given content. */
export type ConflictResolution = 'ours' | 'theirs' | { content: string };

/** One card before and after a changeSet's changes; null where absent. */
export interface CardDiff {
  change: ReviewedCardChange;
  before: { metadata: Record<string, unknown>; content: string | null } | null;
  after: { metadata: Record<string, unknown>; content: string | null } | null;
}

export interface ChangeSetManagerOptions {
  /**
   * Folder for the worktrees, outside any folder scanned for projects; each
   * repository gets a subfolder. Defaults to '~/.cyberismo/changesets'.
   */
  worktreesRoot?: string;
  /** Most changeSets kept open at once; the least recently used is closed. */
  maxOpen?: number;
  /** Called when a changeSet's CommandManager is closed. */
  onClose?: (id: string, commands: CommandManager) => void;
}

/** Thrown when a changeSet must first be updated from main. */
export class ChangeSetBehindError extends Error {
  constructor(id: string) {
    super(`Changeset '${id}' is behind main: update it from main first`);
  }
}

/** Thrown for a changeSet id that does not exist. */
export class ChangeSetNotFoundError extends Error {
  constructor(id: string) {
    super(`Changeset '${id}' does not exist`);
  }
}

/** Thrown when merging a changeSet would add validation errors. */
export class ChangeSetInvalidError extends Error {
  constructor(
    id: string,
    public readonly errors: string[],
  ) {
    super(`Changeset '${id}' does not validate:\n${errors.join('\n')}`);
  }
}

/** Thrown when a card the changeSet did not change is asked about. */
export class CardUnchangedError extends Error {
  constructor(id: string, cardKey: string) {
    super(`Card '${cardKey}' has no changes in changeset '${id}'`);
  }
}

/** Thrown when a merged or discarded changeSet is asked to change. */
export class ChangeSetClosedError extends Error {
  constructor(id: string, status: string) {
    super(`Changeset '${id}' is ${status}`);
  }
}

// A parent's 'c' folder left empty is removed, as the card tree does; never
// the card root itself.
async function removeIfEmpty(root: string, folder: string) {
  if (basename(folder) === 'c') {
    await rmdir(join(root, folder)).catch(() => undefined);
  }
}

// Migrations of shared records, per repository: projects sharing one take
// turns.
const migrations = new Map<string, Promise<void>>();

const BRANCH_PREFIX = 'cyberismo/changesets/';
const ARCHIVE_PREFIX = 'refs/cyberismo/changesets/';
const CARD_ROOTS = ['cardRoot', '.cards/local/templates'];
const DEFAULT_MAX_OPEN = 3;

/**
 * Creates, opens, reviews, updates and merges the changeSets of a project.
 *
 * A changeSet is a branch checked out in a worktree of its own, served by a
 * CommandManager of its own: every feature works inside it unchanged, and
 * main is untouched until the changeSet is merged.
 */
export class ChangeSetManager {
  private migration: Promise<void> | undefined;
  private opened = new Map<
    string,
    { commands: CommandManager; lastUsed: number }
  >();
  private tail: Promise<unknown> = Promise.resolve();
  private logger = getChildLogger({ module: 'ChangeSetManager' });

  /**
   * @param main The project's own CommandManager, on its main working tree.
   * @param options Where worktrees go, and how many stay open.
   */
  constructor(
    private readonly main: CommandManager,
    private readonly options: ChangeSetManagerOptions = {},
  ) {}

  private get git() {
    return this.main.project.git;
  }

  // Mutations run one at a time: they share branches, worktrees and records.
  private serialize<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.tail.then(fn, fn);
    this.tail = run.catch(() => undefined);
    return run;
  }

  // Records live in git's folder, beside the repository's history. Worktrees
  // must not: tools skip any path containing '.git/', the project validator
  // among them. A lost worktree is checked out again from its branch.
  //
  // A changeSet belongs to one project: a repository may hold several, and
  // each keeps its own records, active changeSets and worktrees.
  private async paths() {
    const common = await this.git.commonDir();
    const repository = createHash('sha1').update(common).digest('hex');
    // '' for a project at the repository root; '/' cannot start a subfolder
    const project = encodeURIComponent((await this.git.pathInRepo()) || '/');
    const own = join(common, 'cyberismo', 'projects', project);
    return {
      common,
      records: join(own, 'changesets'),
      // Per user id, the id of that user's active changeSet
      active: join(own, 'active-changesets.json'),
      worktrees: join(
        this.options.worktreesRoot ??
          join(homedir(), '.cyberismo', 'changesets'),
        repository.slice(0, 12),
        project,
      ),
    };
  }

  private async folders() {
    this.migration ??= this.migrateSharedRecords();
    await this.migration;
    return this.paths();
  }

  // Records from before changeSets were per project lived in one folder for
  // the whole repository: take over those that changed this project's files.
  private async migrateSharedRecords() {
    const { common, records, active } = await this.paths();
    const shared = join(common, 'cyberismo', 'changesets');
    const sharedActive = join(common, 'cyberismo', 'active-changesets.json');
    if (!pathExists(shared)) {
      return;
    }
    const previous = migrations.get(common) ?? Promise.resolve();
    const run = previous.then(async () => {
      const taken = new Set<string>();
      for (const name of await readdir(shared)) {
        const file = join(shared, name);
        if (!name.endsWith('.json') || !pathExists(file)) continue;
        const info = JSON.parse(await readFile(file, 'utf-8')) as ChangeSetInfo;
        const head =
          info.status === 'active'
            ? info.branch
            : `${ARCHIVE_PREFIX}${info.status}/${info.id}`;
        const ours = await this.git
          .changedFiles(info.base, head)
          .then((files) => files.length > 0)
          .catch(() => false);
        if (ours) {
          await mkdir(records, { recursive: true });
          await rename(file, join(records, name));
          taken.add(info.id);
        }
      }
      if (taken.size > 0 && pathExists(sharedActive)) {
        const entries = JSON.parse(
          await readFile(sharedActive, 'utf-8'),
        ) as Record<string, string>;
        const own = pathExists(active)
          ? (JSON.parse(await readFile(active, 'utf-8')) as Record<
              string,
              string
            >)
          : {};
        for (const [user, id] of Object.entries(entries)) {
          if (taken.has(id)) {
            own[user] = id;
            delete entries[user];
          }
        }
        await mkdir(dirname(active), { recursive: true });
        await writeFile(active, formatJson(own));
        await writeFile(sharedActive, formatJson(entries));
      }
    });
    migrations.set(
      common,
      run.catch(() => undefined),
    );
    await run;
  }

  // Where a changeSet's worktree is: wherever git has it checked out (the
  // CLI and the server may be configured with different folders), else
  // where a new one goes.
  private async worktreeOf(id: string) {
    const branch = `${BRANCH_PREFIX}${id}`;
    const existing = (await this.git.listWorktrees()).find(
      (worktree) => worktree.branch === branch,
    );
    if (existing && pathExists(existing.path)) {
      return existing.path;
    }
    return join((await this.folders()).worktrees, id);
  }

  /**
   * The project folder inside a changeSet's worktree: where its cards live
   * while it is active.
   */
  public async projectPathOf(id: string): Promise<string> {
    return join(await this.worktreeOf(id), await this.git.pathInRepo());
  }

  private async readActive(): Promise<Record<string, string>> {
    const { active } = await this.folders();
    return pathExists(active)
      ? (JSON.parse(await readFile(active, 'utf-8')) as Record<string, string>)
      : {};
  }

  private async writeActive(entries: Record<string, string>) {
    const { active } = await this.folders();
    await mkdir(dirname(active), { recursive: true });
    await writeFile(active, formatJson(entries));
  }

  /**
   * A user's active changeSet: the one their changes, and their agents',
   * go to instead of main.
   * @param userId The user.
   * @returns the changeSet, or undefined when the user works in main.
   */
  public async getActive(userId: string): Promise<ChangeSetInfo | undefined> {
    const id = (await this.readActive())[userId];
    if (!id) {
      return undefined;
    }
    try {
      const info = await this.get(id);
      return info.status === 'active' ? info : undefined;
    } catch (error) {
      if (error instanceof ChangeSetNotFoundError) {
        return undefined;
      }
      throw error;
    }
  }

  /**
   * Makes a changeSet the user's active one, or returns them to main. Any
   * active changeSet will do, not only the user's own.
   * @param userId The user.
   * @param id The changeSet, or null for main.
   * @throws ChangeSetNotFoundError, ChangeSetClosedError
   */
  public setActive(userId: string, id: string | null): Promise<void> {
    return this.serialize(async () => {
      if (id !== null) {
        await this.active(id);
      }
      const entries = await this.readActive();
      if (id === null) {
        delete entries[userId];
      } else {
        entries[userId] = id;
      }
      await this.writeActive(entries);
    });
  }

  private async save(info: ChangeSetInfo) {
    const { records } = await this.folders();
    await mkdir(records, { recursive: true });
    await writeFile(join(records, `${info.id}.json`), formatJson(info));
  }

  /**
   * Starts a changeSet from main as it is now. Uncommitted changes in main
   * are committed first, so that the changeSet starts from all of them.
   * @param title What the changeSet is for.
   * @returns the new changeSet's record.
   */
  public create(title: string): Promise<ChangeSetInfo> {
    return this.serialize(async () => {
      if (!(await this.git.isRepo())) {
        throw new Error(
          'Changesets need the project to be in a git repository',
        );
      }
      const context = getCommitContext();
      await this.main.project.lock.read(async () => {
        if (await this.git.hasUncommittedChanges()) {
          await this.git.commit(
            `Commit changes before changeset "${title}"`,
            context.author,
            commitTrailers(context),
          );
        }
      });
      const id = randomUUID().slice(0, 8);
      const info: ChangeSetInfo = {
        id,
        title,
        ...(context.author ? { owner: context.author } : {}),
        created: new Date().toISOString(),
        base: await this.git.headCommit(),
        branch: `${BRANCH_PREFIX}${id}`,
        status: 'active',
        reviewed: {},
      };
      await this.git.addWorktree(
        join((await this.folders()).worktrees, id),
        info.branch,
        info.base,
        await this.git.pathInRepo(),
      );
      await this.save(info);
      this.logger.info({ id, title }, 'Changeset created');
      return info;
    });
  }

  /** All changeSets, active and closed, oldest first. */
  public async list(): Promise<ChangeSetInfo[]> {
    const { records } = await this.folders();
    if (!pathExists(records)) {
      return [];
    }
    const files = (await readdir(records)).filter((name) =>
      name.endsWith('.json'),
    );
    const infos = await Promise.all(
      files.map(
        async (name) =>
          JSON.parse(
            await readFile(join(records, name), 'utf-8'),
          ) as ChangeSetInfo,
      ),
    );
    return infos.sort((a, b) => a.created.localeCompare(b.created));
  }

  /**
   * One changeSet's record.
   * @throws if there is no such changeSet
   */
  public async get(id: string): Promise<ChangeSetInfo> {
    const { records } = await this.folders();
    const file = join(records, `${id}.json`);
    if (!/^[a-z0-9-]+$/i.test(id) || !pathExists(file)) {
      throw new ChangeSetNotFoundError(id);
    }
    return JSON.parse(await readFile(file, 'utf-8')) as ChangeSetInfo;
  }

  private async active(id: string): Promise<ChangeSetInfo> {
    const info = await this.get(id);
    if (info.status !== 'active') {
      throw new ChangeSetClosedError(id, info.status);
    }
    return info;
  }

  /**
   * The CommandManager serving a changeSet, opening it if needed. A worktree
   * that has gone missing is checked out again from the changeSet's branch.
   */
  public async open(id: string): Promise<CommandManager> {
    const info = await this.active(id);
    const cached = this.opened.get(id);
    if (cached) {
      // Most recently used last
      this.opened.delete(id);
      this.opened.set(id, { ...cached, lastUsed: Date.now() });
      return cached.commands;
    }
    const worktree = await this.worktreeOf(id);
    if (!pathExists(worktree)) {
      await this.git.pruneWorktrees();
      await this.git.addWorktree(
        worktree,
        info.branch,
        undefined,
        await this.git.pathInRepo(),
      );
    }
    const commands = new CommandManager(await this.projectPathOf(id), {
      autocommit: true,
    });
    await commands.initialize();
    const maxOpen = this.options.maxOpen ?? DEFAULT_MAX_OPEN;
    for (const [openId] of this.opened) {
      if (this.opened.size < maxOpen) break;
      this.close(openId);
    }
    this.opened.set(id, { commands, lastUsed: Date.now() });
    return commands;
  }

  /** The CommandManager of a changeSet, if it is open now. */
  public openedCommands(id: string): CommandManager | undefined {
    return this.opened.get(id)?.commands;
  }

  /** Closes a changeSet's CommandManager; its worktree stays. */
  public close(id: string): void {
    const opened = this.opened.get(id);
    if (!opened) {
      return;
    }
    this.opened.delete(id);
    opened.commands.project.dispose();
    this.options.onClose?.(id, opened.commands);
  }

  /**
   * Closes the changeSets not used for a while; their worktrees stay.
   * @param maxIdleMs How long a changeSet may go unused.
   */
  public closeIdle(maxIdleMs: number): void {
    const cutoff = Date.now() - maxIdleMs;
    for (const [id, { lastUsed }] of [...this.opened]) {
      if (lastUsed < cutoff) {
        this.close(id);
      }
    }
  }

  /** Closes every open changeSet. */
  public dispose(): void {
    for (const id of [...this.opened.keys()]) {
      this.close(id);
    }
  }

  // Edits made in a changeSet's folder outside the app (e.g. with the CLI,
  // which does not commit by default) become a commit of the changeSet.
  private async commitPending(info: ChangeSetInfo) {
    const path = await this.projectPathOf(info.id);
    if (!pathExists(path)) {
      return;
    }
    const opened = this.opened.get(info.id)?.commands;
    const git = opened?.project.git ?? new GitManager(path);
    if (!(await git.hasUncommittedChanges())) {
      return;
    }
    const context = getCommitContext();
    const commit = () =>
      git.commit(
        'Commit changes made in the changeset folder',
        context.author,
        commitTrailers(context),
      );
    if (!opened) {
      await commit();
      return;
    }
    await opened.project.lock.write(async () => {
      await commit();
      await opened.project.reload();
    });
  }

  // Compared with main as it is now: base = where the two last met
  private async compare(info: ChangeSetInfo) {
    await this.commitPending(info);
    const head = await this.git.resolveRef(info.branch);
    const base = await this.git.mergeBase(await this.git.headCommit(), head);
    return { base, head };
  }

  // Per card key, a hash of the card's own files (not its children's).
  private async fingerprints(ref: string): Promise<Map<string, string>> {
    const files = new Map<string, string[]>();
    for (const entry of await this.git.listTree(ref, CARD_ROOTS)) {
      const card = cardFileOf(entry.path);
      if (!card || card.role === 'other') continue;
      const own = `${entry.path.slice(card.cardPath.length)}:${entry.oid}`;
      files.set(card.key, [...(files.get(card.key) ?? []), own]);
    }
    return new Map(
      [...files].map(([key, own]) => [
        key,
        createHash('sha1').update(own.sort().join('\n')).digest('hex'),
      ]),
    );
  }

  /**
   * What a changeSet changes compared with main, card by card, and which
   * cards were reviewed as they stand.
   */
  public changes(id: string): Promise<ChangeSetChanges> {
    return this.serialize(async () => {
      const info = await this.active(id);
      const { base, head } = await this.compare(info);
      const [list, fingerprints] = await Promise.all([
        computeChangeList(this.git, base, head),
        this.fingerprints(head),
      ]);
      return {
        ...list,
        cards: list.cards.map((card) => ({
          ...card,
          reviewed:
            info.reviewed[card.key] !== undefined &&
            info.reviewed[card.key] ===
              (fingerprints.get(card.key) ?? 'deleted'),
        })),
      };
    });
  }

  /**
   * One card as it was before the changeSet and as it is in it.
   * @throws if the card has no changes in the changeSet
   */
  public async cardDiff(id: string, cardKey: string): Promise<CardDiff> {
    const changes = await this.changes(id);
    const change = changes.cards.find((card) => card.key === cardKey);
    if (!change) {
      throw new CardUnchangedError(id, cardKey);
    }
    const beforePath = change.previousPath ?? change.path;
    const [beforeMeta, beforeContent, afterMeta, afterContent] =
      await this.git.readFiles([
        { ref: changes.base, path: `${beforePath}/index.json` },
        { ref: changes.base, path: `${beforePath}/index.adoc` },
        { ref: changes.head, path: `${change.path}/index.json` },
        { ref: changes.head, path: `${change.path}/index.adoc` },
      ]);
    const side = (metadata: string | null, content: string | null) =>
      metadata === null ? null : { metadata: JSON.parse(metadata), content };
    return {
      change,
      before:
        change.kind === 'created' ? null : side(beforeMeta, beforeContent),
      after: change.kind === 'deleted' ? null : side(afterMeta, afterContent),
    };
  }

  /**
   * Marks a card reviewed as it stands now, or clears the mark. A card that
   * changes after it was reviewed counts as unreviewed again.
   */
  public markReviewed(
    id: string,
    cardKey: string,
    reviewed = true,
  ): Promise<void> {
    return this.serialize(async () => {
      const info = await this.active(id);
      if (reviewed) {
        await this.commitPending(info);
        const head = await this.git.resolveRef(info.branch);
        info.reviewed[cardKey] =
          (await this.fingerprints(head)).get(cardKey) ?? 'deleted';
      } else {
        delete info.reviewed[cardKey];
      }
      await this.save(info);
    });
  }

  /**
   * Undoes a changeSet's changes to one card, as a new commit in the
   * changeSet: a created card is removed with its subtree, a deleted card
   * is restored with its subtree, a moved card goes back, and the card's own
   * files return to how they were.
   * @throws if the card has no changes, or the revert would lose other
   *   changes (a created card holding cards that existed before, or a
   *   deleted card whose parent is gone too)
   */
  public revertCard(id: string, cardKey: string): Promise<void> {
    return this.serialize(async () => {
      const info = await this.active(id);
      const { base, head } = await this.compare(info);
      const change = (await computeChangeList(this.git, base, head)).cards.find(
        (card) => card.key === cardKey,
      );
      if (!change) {
        throw new CardUnchangedError(id, cardKey);
      }
      const commands = await this.open(id);
      const project = commands.project;
      const root = project.basePath;
      const git = project.git;

      // The card's own files at a commit: not its children's
      const ownFiles = async (ref: string, cardPath: string) =>
        (await git.listTree(ref, [cardPath]))
          .map((entry) => entry.path)
          .filter((path) => cardFileOf(path)?.cardPath === cardPath);

      const revert = async () => {
        if (change.kind === 'created') {
          const before = await this.fingerprints(base);
          const survivors = (await git.listTree(head, [change.path]))
            .flatMap((entry) => cardFileOf(entry.path)?.key ?? [])
            .filter((key) => key !== cardKey && before.has(key));
          if (survivors.length > 0) {
            throw new Error(
              `Card '${cardKey}' holds cards that existed before the changeset (${[...new Set(survivors)].join(', ')}); move them out first`,
            );
          }
          await rm(join(root, change.path), { recursive: true, force: true });
          await removeIfEmpty(root, dirname(change.path));
          return;
        }
        if (change.kind === 'deleted') {
          const parentFolder = dirname(change.path);
          if (!pathExists(join(root, dirname(parentFolder)))) {
            throw new Error(
              `The parent of card '${cardKey}' is gone too; revert it first`,
            );
          }
          await git.restoreFrom(base, [change.path]);
          return;
        }
        let path = change.path;
        if (change.kind === 'moved') {
          const target = change.previousPath!;
          if (!pathExists(join(root, dirname(dirname(target))))) {
            throw new Error(
              `The previous parent of card '${cardKey}' is gone; revert it first`,
            );
          }
          await mkdir(join(root, dirname(target)), { recursive: true });
          await rename(join(root, path), join(root, target));
          await removeIfEmpty(root, dirname(path));
          path = target;
        }
        // At its original place: make its own files match the base
        const baseFiles = await ownFiles(base, path);
        const headFiles = await ownFiles(head, change.path);
        const relative = (file: string, cardPath: string) =>
          file.slice(cardPath.length);
        const keep = new Set(baseFiles.map((file) => relative(file, path)));
        for (const file of headFiles) {
          if (!keep.has(relative(file, change.path))) {
            await rm(join(root, path, relative(file, change.path)), {
              force: true,
            });
          }
        }
        await git.restoreFrom(base, baseFiles);
      };

      await runWithCommitContext(
        { message: `Revert changes to ${cardKey}` },
        () =>
          project.lock.write(async () => {
            await revert();
            await project.reload();
          }),
      );
    });
  }

  /**
   * Brings main's latest changes into a changeSet by merging main into its
   * branch. Card metadata changed on both sides is merged field by field,
   * and the migration log by union. Anything else changed on both sides is
   * settled by the given resolutions; without one, the update is abandoned
   * and the conflicts are returned, with every side, to resolve and retry.
   * @param resolutions Per project-relative path, how to settle it.
   * @returns whether the changeSet was updated, and any conflicts left.
   */
  public update(
    id: string,
    resolutions: Record<string, ConflictResolution> = {},
  ): Promise<{ updated: boolean; conflicts: ChangeSetConflict[] }> {
    return this.serialize(async () => {
      const info = await this.active(id);
      await this.commitPending(info);
      const mainHead = await this.git.headCommit();
      const head = await this.git.resolveRef(info.branch);
      if ((await this.git.mergeBase(mainHead, head)) === mainHead) {
        return { updated: false, conflicts: [] };
      }
      const commands = await this.open(id);
      const project = commands.project;
      const git = project.git;
      const context = getCommitContext();

      return project.lock.write(async () => {
        const conflicted = await git.mergeNoCommit(mainHead);
        const unresolved: ChangeSetConflict[] = [];
        const write = async (path: string, content: string | null) => {
          const file = join(project.basePath, path);
          if (content === null) {
            await rm(file, { force: true });
          } else {
            await mkdir(dirname(file), { recursive: true });
            await writeFile(file, content);
          }
          await git.markResolved([path]);
        };
        for (const path of conflicted) {
          const [base, ours, theirs] = await Promise.all([
            git.conflictSide(1, path),
            git.conflictSide(2, path),
            git.conflictSide(3, path),
          ]);
          const card = cardFileOf(path);
          const resolution = resolutions[path];
          if (resolution) {
            await write(
              path,
              resolution === 'ours'
                ? ours
                : resolution === 'theirs'
                  ? theirs
                  : resolution.content,
            );
            continue;
          }
          if (card?.role === 'metadata' && base && ours && theirs) {
            const result = mergeCardMetadata(
              JSON.parse(base),
              JSON.parse(ours),
              JSON.parse(theirs),
            );
            if (result.merged) {
              await write(path, formatJson(result.merged));
              continue;
            }
            unresolved.push({
              path,
              key: card.key,
              fields: result.conflicts,
              base,
              ours,
              theirs,
            });
            continue;
          }
          if (
            path.endsWith('migrationLog.jsonl') &&
            ours !== null &&
            theirs !== null
          ) {
            await write(path, mergeAppendOnlyLog(ours, theirs));
            continue;
          }
          unresolved.push({
            path,
            ...(card ? { key: card.key } : {}),
            base,
            ours,
            theirs,
          });
        }
        if (unresolved.length > 0) {
          await git.abortMerge();
          return { updated: false, conflicts: unresolved };
        }
        await git.commit(
          `Update changeset "${info.title}" from main`,
          context.author,
          commitTrailers(context),
          { allowEmpty: true },
        );
        await project.reload();
        return { updated: true, conflicts: [] };
      });
    });
  }

  // Validation errors the changeSet has and main does not
  private async newValidationErrors(
    commands: CommandManager,
  ): Promise<string[]> {
    const errors = async (target: CommandManager) => {
      const base = target.project.basePath;
      const text = await target.validateCmd.validate(
        base,
        () => target.project,
      );
      return text
        .split('\n')
        .map((line) => line.replaceAll(base, '').trim())
        .filter((line) => line !== '');
    };
    const existing = new Set(await errors(this.main));
    return (await errors(commands)).filter((line) => !existing.has(line));
  }

  /**
   * Merges a changeSet into main, as the current commit author (the
   * approver). The changeSet must contain everything main has, and must not
   * add validation errors. The branch is kept as an archive ref.
   * @throws ChangeSetBehindError when main has moved on since the last update
   */
  public merge(id: string): Promise<ChangeSetInfo> {
    return this.serialize(async () => {
      const info = await this.active(id);
      await this.commitPending(info);
      const commands = await this.open(id);
      const project = this.main.project;
      const context = getCommitContext();
      const head = await this.git.resolveRef(info.branch);

      await project.lock.write(async () => {
        if (await this.git.hasUncommittedChanges()) {
          throw new Error('Main has uncommitted changes; commit them first');
        }
        const mainHead = await this.git.headCommit();
        if ((await this.git.mergeBase(mainHead, head)) !== mainHead) {
          throw new ChangeSetBehindError(id);
        }
        const invalid = await this.newValidationErrors(commands);
        if (invalid.length > 0) {
          throw new ChangeSetInvalidError(id, invalid);
        }
        const changed = (await computeChangeList(this.git, mainHead, head))
          .cards;
        const conflicts = await this.git.mergeNoCommit(head);
        if (conflicts.length > 0) {
          await this.git.abortMerge();
          throw new ChangeSetBehindError(id);
        }
        await this.git.commit(
          `Merge changeset "${info.title}"`,
          context.author,
          { ...commitTrailers(context), 'Cyberismo-Changeset': id },
          { allowEmpty: true },
        );
        await project.reload();
        project.recordCardChange({
          updated: changed
            .filter((card) => card.kind !== 'deleted')
            .map((card) => card.key),
          removed: changed
            .filter((card) => card.kind === 'deleted')
            .map((card) => card.key),
        });
      });

      info.status = 'merged';
      info.merged = {
        at: new Date().toISOString(),
        ...(context.author ? { by: context.author } : {}),
        commit: await this.git.headCommit(),
      };
      await this.retire(info, head);
      return info;
    });
  }

  /**
   * Abandons a changeSet. Its branch is kept as an archive ref, so the work
   * can still be recovered with git.
   */
  public discard(id: string): Promise<void> {
    return this.serialize(async () => {
      const info = await this.active(id);
      await this.commitPending(info);
      const head = await this.git.resolveRef(info.branch);
      info.status = 'discarded';
      await this.retire(info, head);
    });
  }

  // Closes a changeSet for good: worktree removed, branch archived, record saved.
  private async retire(info: ChangeSetInfo, head: string) {
    this.close(info.id);
    const worktree = await this.worktreeOf(info.id);
    if (pathExists(worktree)) {
      await this.git.removeWorktree(worktree, true);
    }
    await this.git.updateRef(
      `${ARCHIVE_PREFIX}${info.status}/${info.id}`,
      head,
    );
    await this.git.deleteBranch(info.branch, true);
    await this.save(info);
    // Whoever worked in it is back in main
    const active = await this.readActive();
    await this.writeActive(
      Object.fromEntries(
        Object.entries(active).filter(([, id]) => id !== info.id),
      ),
    );
    this.logger.info({ id: info.id, status: info.status }, 'Changeset closed');
  }
}
