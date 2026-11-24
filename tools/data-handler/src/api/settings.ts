// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { ActorRef, ProjectMetadata } from '@cyberismo/model';
import { Fetch } from '../state/checkout/hub-store.js';
import type { Checkout } from '../state/checkout/checkout.js';
import { moduleInfos } from '../domain/modules/index.js';
import { recordSettingsChange } from '../infra/tx/change-feed.js';
import { read, write } from '../infra/tx/rw-lock.js';
import type { CommitIdentity } from '../infra/tx/tx-record.js';
import { DHValidationError } from '../shared/exceptions/index.js';

/** Project settings to change; those left out stay as they are. */
export interface SettingsUpdate {
  name?: string;
  description?: string;
  category?: string;
  gitRemoteUrl?: string;
}

// Project information; the project's own name, prefix and the like, with its
// modules and card count.
export async function projectInfo(
  checkout: Checkout,
): Promise<ProjectMetadata> {
  const p = checkout;
  const modules = await moduleInfos(p);
  return {
    name: p.projectName,
    path: p.basePath,
    prefix: p.projectPrefix,
    category: p.configuration.category,
    description: p.configuration.description,
    version: p.configuration.version,
    hubs: p.configuration.hubs,
    modules,
    numberOfCards: p.cardTree.count,
  };
}

/**
 * Hub locations of the project, as one handle's actor. Holds no state of its
 * own.
 */
export class Hubs {
  /** @internal */
  constructor(
    private readonly checkout: Checkout,
    public readonly actor: ActorRef,
    public readonly identity: CommitIdentity | undefined,
  ) {}

  /**
   * Adds a hub; it is stored as a directory URL.
   * @throws if the location is empty, not an HTTP(S) URL, or already a hub.
   */
  @write((location) => `Add hub ${location}`)
  public async add(location: string): Promise<void> {
    await this.checkout.configuration.addHub(location);
    recordSettingsChange(this.checkout.lock);
  }

  /**
   * Removes a hub, named by any spelling of its location.
   * @throws if the project has no such hub.
   */
  @write((location) => `Remove hub ${location}`)
  public async remove(location: string): Promise<void> {
    await this.checkout.configuration.removeHub(location);
    recordSettingsChange(this.checkout.lock);
    // The cached module list still offers the removed hub's modules until it
    // is rewritten, and nothing else rewrites it without contacting a hub.
    await new Fetch(this.checkout).pruneUnconfiguredHubs();
  }
}

/**
 * Project settings of one handle. Writes through it are the handle's
 * actor's. Holds no state of its own.
 */
export class Settings {
  /** Hub locations, as this handle's actor. */
  public readonly hubs: Hubs;

  /** @internal */
  constructor(
    private readonly checkout: Checkout,
    public readonly actor: ActorRef,
    public readonly identity: CommitIdentity | undefined,
  ) {
    this.hubs = new Hubs(checkout, actor, identity);
  }

  /** Project name. */
  get name(): string {
    return this.checkout.configuration.name;
  }

  /** Card key prefix of the project. */
  get prefix(): string {
    return this.checkout.configuration.cardKeyPrefix;
  }

  /** Project category; may be empty or unset. */
  get category(): string | undefined {
    return this.checkout.configuration.category;
  }

  /** Project description; empty when unset. */
  get description(): string {
    return this.checkout.configuration.description;
  }

  /** Project information, with its modules and card count. */
  @read
  public async info(): Promise<ProjectMetadata> {
    return projectInfo(this.checkout);
  }

  /**
   * The project's git remote URL.
   * @returns the URL ('' if none is set), or null if the project is not a
   *   git repo.
   */
  @read
  public async gitRemoteUrl(): Promise<string | null> {
    if (!(await this.checkout.git.isRepo())) {
      return null;
    }
    return (await this.checkout.git.getRemoteUrl()) ?? '';
  }

  /**
   * Changes the project settings given; the rest stay as they are. An empty
   * description or category clears it.
   * @param changes.name New project name.
   * @param changes.description New project description.
   * @param changes.category New project category.
   * @param changes.gitRemoteUrl New git remote URL of the project.
   * @throws if the name is not valid, or a git remote URL is given for a
   *   project that is not a git repository; nothing is changed then.
   */
  @write(() => 'Update project settings')
  public async update(changes: SettingsUpdate): Promise<void> {
    const { name, description, category, gitRemoteUrl } = changes;
    if (gitRemoteUrl !== undefined && !(await this.checkout.git.isRepo())) {
      throw new DHValidationError(
        'Cannot set remote URL: directory is not a git repository',
      );
    }
    const configuration = this.checkout.configuration;
    // First: a name that is not valid is refused before anything is written.
    if (name !== undefined) {
      await configuration.setProjectName(name);
    }
    if (description !== undefined) {
      await configuration.setDescription(description);
    }
    if (category !== undefined) {
      await configuration.setCategory(category);
    }
    // Last: git keeps the remote even if the write is rolled back.
    if (gitRemoteUrl !== undefined) {
      await this.checkout.git.setRemoteUrl(gitRemoteUrl);
    }
    recordSettingsChange(this.checkout.lock);
  }
}
