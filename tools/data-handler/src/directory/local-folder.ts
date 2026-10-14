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

import { join } from 'node:path';
import type {
  ActorRef,
  CloneProjectResult,
  CreateProjectParams,
  ProjectErrors,
  ProjectSummary,
} from '@cyberismo/model';
import { Create } from '../commands/create.js';
import { Checkout } from '../containers/project.js';
import { ProjectNotFoundError } from '../exceptions/index.js';
import { isProjectDirectory, scanForProjects } from '../project-scanner.js';
import { SYSTEM_ACTOR, type CommitIdentity } from '../utils/tx-record.js';
import { Workspace, type WorkspaceOptions } from '../workspace/workspace.js';
import type { ProjectDirectory } from './project-directory.js';

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
  if (!isProjectDirectory(path)) {
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
  for (const project of await scanForProjects(root)) {
    try {
      directory.add(project.prefix, await Checkout.open(project.path, options));
    } catch (error) {
      failed.push({
        prefix: project.prefix,
        errors: [
          `Failed to load project (${project.path}): ${
            error instanceof Error ? error.message : String(error)
          }`,
        ],
      });
    }
  }
  return { directory, failed };
}

// The directory reads settings as the system; it owns the checkout, not the handle.
function systemSettings(checkout: Checkout) {
  return Workspace.over(checkout, SYSTEM_ACTOR).settings;
}

// prefix -> Checkout of the projects under one folder.
class LocalFolder implements ProjectDirectory {
  private readonly checkouts = new Map<string, Checkout>();

  constructor(
    private readonly root: string,
    private readonly options: WorkspaceOptions | undefined,
  ) {}

  add(prefix: string, checkout: Checkout) {
    if (this.checkouts.has(prefix)) {
      throw new Error(`Project '${prefix}' is already registered`);
    }
    this.checkouts.set(prefix, checkout);
  }

  private checkout(prefix: string): Checkout {
    const checkout = this.checkouts.get(prefix);
    if (!checkout) {
      throw new ProjectNotFoundError(prefix);
    }
    return checkout;
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
    return Workspace.over(this.checkout(prefix), actor, identity);
  }

  async create(
    params: CreateProjectParams,
    actor: ActorRef,
    identity?: CommitIdentity,
  ): Promise<ProjectSummary> {
    const { name, prefix, category, description } = params;
    const ws = await Workspace.createProjectWithDefaults(
      join(this.root, prefix),
      params,
      actor,
      identity,
      this.options,
    );
    this.add(prefix, ws.checkout);
    return {
      prefix,
      name,
      category: category || undefined,
      description: description || undefined,
    };
  }

  async clone(url: string): Promise<CloneProjectResult> {
    const clonedPath = await Create.cloneProject(url, this.root);
    const scanned = await scanForProjects(clonedPath);

    const registered: { prefix: string; name: string }[] = [];
    const skippedDuplicates: string[] = [];

    for (const project of scanned) {
      if (this.checkouts.has(project.prefix)) {
        skippedDuplicates.push(project.prefix);
        continue;
      }
      this.add(project.prefix, await Checkout.open(project.path, this.options));
      registered.push({
        prefix: project.prefix,
        name: project.name,
      });
    }

    return {
      projects: registered,
      ...(skippedDuplicates.length > 0 && { skippedDuplicates }),
    };
  }

  async replace(prefix: string): Promise<void> {
    const old = this.checkout(prefix);
    const checkout = await Checkout.open(old.basePath, this.options);
    old.dispose();
    this.checkouts.set(prefix, checkout);
  }
}
