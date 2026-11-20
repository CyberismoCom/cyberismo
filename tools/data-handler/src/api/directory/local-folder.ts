// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { join } from 'node:path';
import type {
  ActorRef,
  CloneProjectResult,
  CreateProjectParams,
  CreateProjectResult,
  ProjectErrors,
  ProjectSummary,
} from '@cyberismo/model';
import { cloneProject } from './clone-project.js';
import { Checkout } from '../../state/checkout/checkout.js';
import {
  ProjectExistsError,
  ProjectNotFoundError,
  WorkspaceDisposedError,
} from '../../shared/exceptions/index.js';
import { getChildLogger } from '../../shared/utils/log-utils.js';
import {
  configuredFolders,
  isProjectFolder,
} from '../../infra/paths/project-folders.js';
import { SYSTEM_ACTOR, type CommitIdentity } from '../../infra/tx/tx-record.js';
import { Workspace, type WorkspaceOptions } from '../workspace.js';
import { createAndOpen } from './create-project.js';
import type { ProjectDirectory } from './project-directory.js';
import { renameProject } from './rename-project.js';

/**
 * The actor's handle over the project at `path`, on a checkout of its own
 * that the caller disposes.
 * @param identity Git author of the actor's commits; unset lets git resolve
 *   it.
 * @throws if `path` is not a project, or its schema version is not supported.
 */
export async function openProjectAt(
  path: string,
  actor: ActorRef,
  identity?: CommitIdentity,
  options?: WorkspaceOptions,
): Promise<Workspace> {
  if (!isProjectFolder(path)) {
    throw new Error(
      `'${path}' is not a project: it has no '.cards' and 'cardRoot'`,
    );
  }
  return Workspace.over(await Checkout.open(path, options), actor, identity);
}

/**
 * The projects in the folder `root`, or `root` itself when it is a project.
 * Every project is opened here; one that fails to load is left out and
 * reported in `failed`.
 * @throws if `root` cannot be scanned.
 */
export async function localFolder(
  root: string,
  options?: WorkspaceOptions,
): Promise<{ directory: ProjectDirectory; failed: ProjectErrors[] }> {
  const directory = new LocalFolder(root, options);
  const failed: ProjectErrors[] = [];
  const seen = new Map<string, string>();
  for (const { path, prefix } of await configuredFolders(root)) {
    const project = await openFolder(path, prefix, options);
    if (isDuplicate(seen, path, project)) {
      continue;
    }
    if (project.checkout) {
      directory.add(project.prefix, project.checkout);
    } else {
      failed.push({
        prefix: project.prefix,
        errors: [
          `Failed to load project (${path}): ${
            project.error instanceof Error
              ? project.error.message
              : String(project.error)
          }`,
        ],
      });
    }
  }
  return { directory, failed };
}

type Opened =
  | { prefix: string; checkout: Checkout; error?: undefined }
  | { prefix: string; checkout?: undefined; error: unknown };

// The project at `path` opened, or why it did not open; `prefix` is the
// one its configuration names.
async function openFolder(
  path: string,
  prefix: string,
  options: WorkspaceOptions | undefined,
): Promise<Opened> {
  try {
    const checkout = await Checkout.open(path, options);
    return { prefix: checkout.projectPrefix, checkout };
  } catch (error) {
    return { prefix, error };
  }
}

// Whether an earlier folder had the project's prefix; the later one is
// dropped with a warning.
function isDuplicate(
  seen: Map<string, string>,
  path: string,
  project: Opened,
): boolean {
  const existing = seen.get(project.prefix);
  if (existing === undefined) {
    seen.set(project.prefix, path);
    return false;
  }
  console.warn(
    `Skipping project '${path}': duplicate prefix '${project.prefix}' (already registered from '${existing}')`,
  );
  // Nothing uses the checkout yet, and dispose never rejects.
  void project.checkout?.dispose();
  return true;
}

const logger = getChildLogger({ module: 'localFolder' });

// The directory reads settings as the system; it owns the checkout, not the handle.
function systemSettings(checkout: Checkout) {
  return Workspace.over(checkout, SYSTEM_ACTOR).settings;
}

// prefix -> Checkout of the projects under one folder.
class LocalFolder implements ProjectDirectory {
  private readonly checkouts = new Map<string, Checkout>();
  // Projects that a replace is reopening; a lookup waits for the reopen.
  private readonly reopening = new Map<string, Promise<void>>();
  // Projects whose reopen failed: their folder, and why.
  private readonly failed = new Map<string, { path: string; error: unknown }>();
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly root: string,
    private readonly options: WorkspaceOptions | undefined,
  ) {}

  add(prefix: string, checkout: Checkout) {
    if (this.checkouts.has(prefix)) {
      throw new Error(`Project '${prefix}' is already registered`);
    }
    this.hold(prefix, checkout);
  }

  private hold(prefix: string, checkout: Checkout) {
    this.checkouts.set(prefix, checkout);
    // A write's event names the project's prefix once the write is done, so
    // a rename is followed only if it stands.
    checkout.changeFeed.subscribe(({ project }) =>
      this.follow(checkout, project),
    );
  }

  // Runs `fn` after the renames, creates and clones started before it, so
  // each one's check sees the prefixes the earlier ones took.
  private serially<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn);
    this.queue = run.catch(() => {});
    return run;
  }

  // Whether a project has `prefix`: under its key, or on disk inside a write
  // that renamed it and has not ended yet.
  private holds(prefix: string): boolean {
    return (
      this.checkouts.has(prefix) ||
      this.failed.has(prefix) ||
      [...this.checkouts.values()].some(
        (checkout) => checkout.projectPrefix === prefix,
      )
    );
  }

  // Keeps `checkout` under `prefix`, its prefix now, unless another project
  // holds it.
  private follow(checkout: Checkout, prefix: string) {
    if (this.checkouts.has(prefix)) {
      return;
    }
    for (const [key, held] of this.checkouts) {
      if (held === checkout) {
        this.checkouts.delete(key);
        this.checkouts.set(prefix, checkout);
        return;
      }
    }
  }

  private checkout(prefix: string): Checkout {
    const checkout = this.checkouts.get(prefix);
    if (!checkout) {
      throw new ProjectNotFoundError(prefix);
    }
    return checkout;
  }

  // The checkout of the project `prefix` once a reopen of it has ended.
  private async lookup(prefix: string): Promise<Checkout> {
    await this.reopening.get(prefix);
    const failure = this.failed.get(prefix);
    if (failure) {
      const reason =
        failure.error instanceof Error
          ? failure.error.message
          : String(failure.error);
      throw new WorkspaceDisposedError(
        `Project '${prefix}' failed to reopen: ${reason}`,
      );
    }
    return this.checkout(prefix);
  }

  async list(): Promise<ProjectSummary[]> {
    return Array.from(this.checkouts.entries()).map(([prefix, checkout]) => {
      const { name, category, description } = systemSettings(checkout);
      return {
        prefix,
        name,
        category: category || undefined,
        description: description || undefined,
      };
    });
  }

  async open(
    prefix: string,
    actor: ActorRef,
    identity?: CommitIdentity,
  ): Promise<Workspace> {
    return Workspace.over(await this.lookup(prefix), actor, identity);
  }

  async create(
    params: CreateProjectParams,
    actor: ActorRef,
    identity?: CommitIdentity,
  ): Promise<CreateProjectResult> {
    const path = join(this.root, params.prefix);
    return this.serially(async () => {
      // A renamed project keeps its folder, which a create would write into.
      if (this.holds(params.prefix) || Checkout.isCreated(path)) {
        throw new ProjectExistsError(params.prefix);
      }
      const { checkout, result } = await createAndOpen(
        path,
        params,
        actor,
        identity,
        this.options,
      );
      this.add(params.prefix, checkout);
      return result;
    });
  }

  async clone(url: string): Promise<CloneProjectResult> {
    const folders = await cloneProject(url, this.root);

    return this.serially(async () => {
      const registered: { prefix: string; name: string }[] = [];
      const skippedDuplicates: string[] = [];
      const seen = new Map<string, string>();

      for (const { path, prefix } of folders) {
        const project = await openFolder(path, prefix, this.options);
        if (isDuplicate(seen, path, project)) {
          continue;
        }
        if (this.holds(project.prefix)) {
          await project.checkout?.dispose();
          skippedDuplicates.push(project.prefix);
          continue;
        }
        if (!project.checkout) {
          throw project.error;
        }
        this.add(project.prefix, project.checkout);
        registered.push({
          prefix: project.prefix,
          name: project.checkout.configuration.name,
        });
      }

      return {
        projects: registered,
        ...(skippedDuplicates.length > 0 && { skippedDuplicates }),
      };
    });
  }

  async rename(
    prefix: string,
    newPrefix: string,
    actor: ActorRef,
    identity?: CommitIdentity,
    { force = false }: { force?: boolean } = {},
  ): Promise<void> {
    await this.serially(async () => {
      const ws = await this.open(prefix, actor, identity);
      if (newPrefix !== prefix && this.holds(newPrefix)) {
        throw new ProjectExistsError(newPrefix);
      }
      await renameProject(ws, newPrefix, { force });
    });
  }

  // Reopens a project that failed to reopen, too.
  async replace(prefix: string): Promise<void> {
    await this.serially(async () => {
      const old = this.checkouts.get(prefix);
      const path = old?.basePath ?? this.failed.get(prefix)?.path;
      if (path === undefined) {
        throw new ProjectNotFoundError(prefix);
      }
      let reopened!: () => void;
      this.reopening.set(
        prefix,
        new Promise((resolve) => (reopened = resolve)),
      );
      try {
        // The old checkout lets go of the files before the new one reads them.
        await old?.dispose();
        this.checkouts.delete(prefix);
        try {
          this.hold(prefix, await Checkout.open(path, this.options));
          this.failed.delete(prefix);
        } catch (error) {
          this.failed.set(prefix, { path, error });
          logger.error({ error, prefix }, 'Reopening the project failed');
          throw error;
        }
      } finally {
        this.reopening.delete(prefix);
        reopened();
      }
    });
  }
}
