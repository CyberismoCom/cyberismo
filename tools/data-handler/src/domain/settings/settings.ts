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

import type { ActorRef, ProjectMetadata } from '@cyberismo/model';
import { Fetch } from '../../infra/modules/hub-store.js';
import type { Checkout } from '../../infra/checkout/checkout.js';
import { moduleInfos } from '../modules/index.js';
import { recordSettingsChange } from '../../infra/tx/change-feed.js';
import { read, write } from '../../infra/tx/rw-lock.js';
import type { CommitIdentity } from '../../infra/tx/tx-record.js';

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
   * Sets the project name.
   * @param name New project name.
   * @throws if the name is not valid.
   */
  @write(() => 'Set project name')
  public async setName(name: string): Promise<void> {
    await this.checkout.configuration.setProjectName(name);
    recordSettingsChange(this.checkout.lock);
  }

  /**
   * Sets the project description. An empty string clears it.
   * @param description New project description.
   */
  @write(() => 'Set project description')
  public async setDescription(description: string): Promise<void> {
    await this.checkout.configuration.setDescription(description);
    recordSettingsChange(this.checkout.lock);
  }

  /**
   * Sets the project category. An empty string clears it.
   * @param category New project category.
   */
  @write(() => 'Set project category')
  public async setCategory(category: string): Promise<void> {
    await this.checkout.configuration.setCategory(category);
    recordSettingsChange(this.checkout.lock);
  }

  /**
   * Sets the git remote URL for the project.
   * @param url The remote URL to set.
   */
  @write(() => 'Set git remote URL')
  public async setGitRemoteUrl(url: string): Promise<void> {
    await this.checkout.git.setRemoteUrl(url);
    recordSettingsChange(this.checkout.lock);
  }
}
