/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import type { Calculate } from '../commands/calculate.js';
import { Clean } from '../commands/clean.js';
import { Create } from '../commands/create.js';
import type { Edit } from '../commands/edit.js';
import type { Export } from '../commands/export.js';
import type { Fetch } from '../commands/fetch.js';
import type { Import } from '../commands/import.js';
import type { Modules } from '../commands/modules.js';
import type { Publish } from '../commands/publish.js';
import type { Remove } from '../commands/remove.js';
import type { Version } from '../commands/version.js';
import type { Rename } from '../commands/rename.js';
import type { Show } from '../commands/show.js';
import type { Transition } from '../commands/transition.js';
import type { Update } from '../commands/update.js';
import type { Validate } from '../commands/validate.js';
import { Cards } from '../cards/cards.js';
import { Checkout } from '../containers/project.js';
import type { ActorRef } from '@cyberismo/model';
import { runWithCommitContext } from '../utils/commit-context.js';
import { isWriteMethod } from '../utils/rw-lock.js';
import type { CommitIdentity, WriteFrame } from '../utils/tx-record.js';
import { type Level } from 'pino';
import { join } from 'node:path';
import { initLogger } from '../utils/log-utils.js';
import { DEFAULT_HUB } from '@cyberismo/assets';
import { sharedCommands, type SharedCommands } from './shared-commands.js';

export interface WorkspaceOptions {
  watchResourceChanges?: boolean;
  logLevel?: Level;
  autocommit?: boolean;
  autopush?: boolean;
}

/**
 * Opens the checkout at `path` and loads it. Its holder disposes it.
 * @param path Project path.
 * @param options Checkout options.
 * @throws if the project's schema version is not supported.
 */
export async function openCheckout(
  path: string,
  options?: WorkspaceOptions,
): Promise<Checkout> {
  // Set up logger before constructing anything so eager child loggers work
  if (options?.logLevel) {
    const logPath = join(path, '.logs', 'cyberismo_data-handler.log');
    initLogger(options.logLevel, logPath);
  }
  const checkout = new Checkout(path, {
    watchResourceChanges: options?.watchResourceChanges,
    autocommit: options?.autocommit,
    autopush: options?.autopush,
  });
  const compat = checkout.configuration.checkSchemaVersion();
  if (!compat.isCompatible) {
    checkout.dispose();
    throw new Error(compat.message);
  }
  try {
    checkout.resources.changedModules();
    await checkout.populateCaches();
    await checkout.initializeGit();
    await checkout.calculationEngine.generate();
  } catch (error) {
    checkout.dispose();
    throw error;
  }
  return checkout;
}

// A per-handle view of a shared legacy command object: its @write methods
// open the write as the handle's actor.
function legacyProxy<T extends object>(
  target: T,
  checkout: Checkout,
  frame: WriteFrame,
): T {
  return new Proxy(target, {
    get(object, key) {
      const value = Reflect.get(object, key);
      if (typeof value !== 'function') {
        return value;
      }
      // Clean.clean is undecorated: it writes unless it is a dry run.
      const isClean = object instanceof Clean && key === 'clean';
      if (!isClean && !isWriteMethod(value)) {
        return value.bind(object);
      }
      return (...args: unknown[]) =>
        isClean && args[0]
          ? value.apply(object, args)
          : checkout.lock.write(frame, () => value.apply(object, args));
    },
  });
}

/**
 * One actor's handle over a shared checkout. Writes through it are the
 * actor's. It holds no state of its own and is never disposed.
 */
export class Workspace {
  private readonly frame: WriteFrame;
  private readonly proxies = new Map<keyof SharedCommands, object>();
  private cardsFacade?: Cards;

  private constructor(
    public readonly checkout: Checkout,
    public readonly actor: ActorRef,
    public readonly identity: CommitIdentity | undefined,
  ) {
    this.frame = { actor, identity };
  }

  /**
   * A handle over `checkout` for `actor`.
   * @param checkout Checkout the handle works on.
   * @param actor Who acts through the handle.
   * @param identity Git author of the actor's commits; unset lets git
   *   resolve it.
   */
  public static over(
    checkout: Checkout,
    actor: ActorRef,
    identity?: CommitIdentity,
  ): Workspace {
    return new Workspace(checkout, actor, identity);
  }

  private legacy<K extends keyof SharedCommands>(key: K): SharedCommands[K] {
    let proxy = this.proxies.get(key);
    if (!proxy) {
      const target = sharedCommands(this.checkout)[key];
      proxy = legacyProxy(target, this.checkout, this.frame);
      this.proxies.set(key, proxy);
    }
    return proxy as SharedCommands[K];
  }

  /** Card operations, as this handle's actor. */
  get cards(): Cards {
    this.cardsFacade ??= new Cards(this.checkout, this.actor, this.identity);
    return this.cardsFacade;
  }

  get calculateCmd(): Calculate {
    return this.legacy('calculateCmd');
  }
  get cleanCmd(): Clean {
    return this.legacy('cleanCmd');
  }
  get createCmd(): Create {
    return this.legacy('createCmd');
  }
  get editCmd(): Edit {
    return this.legacy('editCmd');
  }
  get exportCmd(): Export {
    return this.legacy('exportCmd');
  }
  get fetchCmd(): Fetch {
    return this.legacy('fetchCmd');
  }
  get importCmd(): Import {
    return this.legacy('importCmd');
  }
  get modulesCmd(): Modules {
    return this.legacy('modulesCmd');
  }
  get publishCmd(): Publish {
    return this.legacy('publishCmd');
  }
  get removeCmd(): Remove {
    return this.legacy('removeCmd');
  }
  get renameCmd(): Rename {
    return this.legacy('renameCmd');
  }
  get showCmd(): Show {
    return this.legacy('showCmd');
  }
  get transitionCmd(): Transition {
    return this.legacy('transitionCmd');
  }
  get updateCmd(): Update {
    return this.legacy('updateCmd');
  }
  get validateCmd(): Validate {
    return this.legacy('validateCmd');
  }
  get versionCmd(): Version {
    return this.legacy('versionCmd');
  }

  /**
   * Checks the schema version compatibility.
   * @returns
   *    isCompatible - true if compatible; false otherwise
   *    message - optional message related to compatibility.
   */
  public checkSchemaVersion(): { isCompatible: boolean; message?: string } {
    return this.checkout.configuration.checkSchemaVersion();
  }

  /**
   * Execute multiple commands as a single atomic write transaction.
   * All inner @write/@read calls reuse the same lock context.
   * Git commit fires once on success; rollback on any error.
   */
  public async atomic<T>(fn: () => Promise<T>, message: string): Promise<T> {
    const run = () => this.checkout.lock.write(this.frame, fn);
    return runWithCommitContext({ message }, run);
  }

  /**
   * Execute multiple commands under a consistent read snapshot.
   * All inner @read calls reuse the same lock context.
   * Writers are blocked for the duration.
   */
  public async consistent<T>(fn: () => Promise<T>): Promise<T> {
    return this.checkout.lock.read(fn);
  }

  /**
   * Creates a new project with default configuration.
   * Sets up the project files, initializes git, and adds the default hub.
   * @param projectPath Path where the project will be created
   * @param params Project parameters (name, prefix, category, description)
   * @param actor Who creates the project.
   * @param identity Git author of the project's first commits.
   * @param options Optional checkout options
   * @returns The actor's handle over the new project's checkout
   */
  public static async createProjectWithDefaults(
    projectPath: string,
    params: {
      name: string;
      prefix: string;
      category?: string;
      description?: string;
    },
    actor: ActorRef,
    identity: CommitIdentity | undefined,
    options?: WorkspaceOptions,
  ): Promise<Workspace> {
    await Create.createProject(
      projectPath,
      params.prefix,
      params.name,
      params.category ?? '',
      params.description ?? '',
    );

    const ws = Workspace.over(
      await openCheckout(projectPath, options),
      actor,
      identity,
    );

    await ws.checkout.git.initialize(identity);

    // Add default hub and fetch module data
    try {
      await ws.createCmd.addHubLocation(DEFAULT_HUB);
      await ws.fetchCmd.fetchHubs();
    } catch {
      // Hub setup is non-critical; project is still usable
    }

    return ws;
  }
}
