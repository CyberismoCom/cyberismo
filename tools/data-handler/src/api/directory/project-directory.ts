// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type {
  ActorRef,
  CloneProjectResult,
  CreateProjectParams,
  CreateProjectResult,
  ProjectSummary,
} from '@cyberismo/model';
import type { CommitIdentity } from '../../infra/tx/tx-record.js';
import type { Workspace } from '../workspace.js';

/**
 * A set of projects, each opened by its prefix. Handles it gives are the
 * actor's; the directory holds what they work on and disposes it.
 */
export interface ProjectDirectory {
  /** The projects in the directory. */
  list(): Promise<ProjectSummary[]>;

  /**
   * The actor's handle over the project with `prefix`.
   * @param identity Git author of the actor's commits; unset lets git
   *   resolve it.
   * @throws ProjectNotFoundError if the directory has no such project.
   */
  open(
    prefix: string,
    actor: ActorRef,
    identity?: CommitIdentity,
  ): Promise<Workspace>;

  /**
   * Creates a project in the directory as the actor, as `createProject` does.
   * @throws ProjectExistsError if the directory has a project `params.prefix`,
   *   or a renamed project has its folder.
   */
  create(
    params: CreateProjectParams,
    actor: ActorRef,
    identity?: CommitIdentity,
  ): Promise<CreateProjectResult>;

  /**
   * Clones the repository at `url` into the directory and adds the projects
   * in it whose prefixes the directory does not have yet.
   */
  clone(url: string): Promise<CloneProjectResult>;

  /**
   * Changes the prefix of the project with `prefix` to `newPrefix`, as the
   * actor; the directory has it under `newPrefix` from then on.
   * @param options.force Rename even though a version has been published.
   * @throws ProjectNotFoundError if the directory has no such project.
   * @throws ProjectExistsError if the directory has a project `newPrefix`.
   */
  rename(
    prefix: string,
    newPrefix: string,
    actor: ActorRef,
    identity?: CommitIdentity,
    options?: { force?: boolean },
  ): Promise<void>;

  /**
   * Reopens the project with `prefix` from its files; handles over the old
   * checkout are refused from then on.
   * @throws ProjectNotFoundError if the directory has no such project.
   */
  replace(prefix: string): Promise<void>;
}
