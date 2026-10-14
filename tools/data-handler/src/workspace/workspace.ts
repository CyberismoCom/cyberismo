/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { Clean } from '../clean/clean.js';
import { Export } from '../export/export.js';
import { Modules } from '../modules/modules.js';
import { Versions } from '../versions/version.js';
import { Cards } from '../cards/cards.js';
import { Render } from '../macros/render.js';
import { Queries } from '../queries/queries.js';
import { Changes } from './changes.js';
import { Resources } from './resources.js';
import { Settings } from './settings.js';
import type { Checkout, OpenOptions } from '../infra/checkout.js';
import type { ActorRef } from '@cyberismo/model';
import { runWithCommitContext } from '../infra/commit-context.js';
import type { CommitIdentity, WriteFrame } from '../utils/tx-record.js';
import { setCheckout } from '../infra/internal.js';

/** How a workspace's checkout is opened. */
export type WorkspaceOptions = OpenOptions;

/**
 * One actor's handle over a shared checkout. Writes through it are the
 * actor's. It holds no state of its own and is never disposed.
 */
export class Workspace {
  private readonly frame: WriteFrame;
  private cardsFacade?: Cards;
  private settingsFacade?: Settings;
  private changesFacade?: Changes;
  private resourcesFacade?: Resources;
  private queriesFacade?: Queries;
  private exportFacade?: Export;
  private cleanFacade?: Clean;
  private versionsFacade?: Versions;
  private renderFacade?: Render;
  private modulesFacade?: Modules;

  private constructor(
    public readonly checkout: Checkout,
    public readonly actor: ActorRef,
    public readonly identity: CommitIdentity | undefined,
  ) {
    this.frame = { actor, identity };
    setCheckout(this, checkout);
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

  /** Card operations, as this handle's actor. */
  get cards(): Cards {
    this.cardsFacade ??= new Cards(this.checkout, this.actor, this.identity);
    return this.cardsFacade;
  }

  /** Project settings, as this handle's actor. */
  get settings(): Settings {
    this.settingsFacade ??= new Settings(
      this.checkout,
      this.actor,
      this.identity,
    );
    return this.settingsFacade;
  }

  /** Resource changes, as this handle's actor. */
  get changes(): Changes {
    this.changesFacade ??= new Changes(
      this.checkout,
      this.actor,
      this.identity,
    );
    return this.changesFacade;
  }

  /** Resources, as this handle's actor. */
  get resources(): Resources {
    this.resourcesFacade ??= new Resources(this.checkout, this.changes);
    return this.resourcesFacade;
  }

  /** Queries and logic programs. */
  get queries(): Queries {
    this.queriesFacade ??= new Queries(this.checkout);
    return this.queriesFacade;
  }

  /** Exports of cards and the project. */
  get export(): Export {
    this.exportFacade ??= new Export(this.checkout);
    return this.exportFacade;
  }

  /** Dormant field values, as this handle's actor. */
  get clean(): Clean {
    this.cleanFacade ??= new Clean(this.checkout, this.actor, this.identity);
    return this.cleanFacade;
  }

  /** Version bumps and publishing, as this handle's actor. */
  get versions(): Versions {
    this.versionsFacade ??= new Versions(
      this.checkout,
      this.actor,
      this.identity,
    );
    return this.versionsFacade;
  }

  /** Card content rendering. */
  get render(): Render {
    this.renderFacade ??= new Render(this.checkout);
    return this.renderFacade;
  }

  /** Modules and hubs, as this handle's actor. */
  get modules(): Modules {
    this.modulesFacade ??= new Modules(
      this.checkout,
      this.actor,
      this.identity,
    );
    return this.modulesFacade;
  }

  /** Path of the project. */
  get path(): string {
    return this.checkout.basePath;
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
}
