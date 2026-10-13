/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import semver from 'semver';
import type { ActorRef, PublishResult, VersionBump } from '@cyberismo/model';
import { Validate } from '../commands/validate.js';
import type { Checkout } from '../containers/project.js';
import type { ConfigurationLogEntry } from '../utils/configuration-logger.js';
import {
  ConfigurationLogger,
  RETIRED_OPERATIONS,
} from '../utils/configuration-logger.js';
import type { ChangeClassification } from '../mutations/registry.js';
import { classify } from '../mutations/dispatcher.js';
import { entryToMutationInput } from '../mutations/replay/convert.js';
import { recordSettingsChange } from '../utils/change-feed.js';
import { write } from '../utils/rw-lock.js';
import type { CommitIdentity } from '../utils/tx-record.js';
import { publishVersion } from './publish.js';

export const validBumps = ['patch', 'minor', 'major'] as const;
export type BumpType = (typeof validBumps)[number];

interface ClassifiedEntry {
  entry: ConfigurationLogEntry;
  classification: ChangeClassification;
  /** True when the entry could not be routed and was classified by fallback. */
  unroutable: boolean;
}

function classifyEntry(entry: ConfigurationLogEntry): ClassifiedEntry {
  try {
    return {
      entry,
      classification: classify(entryToMutationInput(entry)),
      unroutable: false,
    };
  } catch {
    // An entry this build cannot route (e.g. written by a newer version) must
    // not slip through the gate; treat it as the strictest class.
    return { entry, classification: 'breaking', unroutable: true };
  }
}

// One line per entry, detailed enough to tell two edits of the same resource
// apart, and honest about entries that were classified by fallback.
function describeEntries(entries: ClassifiedEntry[]): string {
  return entries
    .map(({ entry, unroutable }) => {
      const operationName = (
        entry.parameters?.operation as { name?: string } | undefined
      )?.name;
      const detail = [entry.parameters?.key, operationName]
        .filter((part) => typeof part === 'string')
        .join(' ');
      const note = !unroutable
        ? ''
        : (RETIRED_OPERATIONS as readonly string[]).includes(entry.operation)
          ? ' — retired operation, treated as breaking'
          : ' — unrecognised entry, treated as breaking';
      return `  - ${entry.target} (${entry.operation})${detail ? ` ${detail}` : ''}${note}`;
    })
    .join('\n');
}

/**
 * Versions of one handle: bumping and publishing. Writes through it are the
 * handle's actor's. Holds no state of its own.
 */
export class Versions {
  constructor(
    private readonly checkout: Checkout,
    public readonly actor: ActorRef,
    public readonly identity: CommitIdentity | undefined,
  ) {}

  /**
   * Bumps the project version, snapshots the migration log, and commits.
   * @throws if the bump type is not valid or the project has validation
   *   errors; the project is validated before the write starts.
   */
  public async bump(bumpType: BumpType): Promise<VersionBump> {
    if (!(validBumps as readonly string[]).includes(bumpType)) {
      throw new Error(
        `Invalid bump type '${bumpType}'. Must be one of: ${validBumps.join(', ')}`,
      );
    }

    // Validate project before versioning
    const validation = await Validate.getInstance().validate(
      this.checkout.basePath,
      () => this.checkout,
    );
    if (validation.length) {
      throw new Error(
        `Cannot version: project has validation errors.\n${validation}`,
      );
    }

    return this.bumpVersion(bumpType);
  }

  /**
   * Publishes the current version: tags it and pushes the tag.
   * @throws if there is no version, it is already published, or the push
   *   fails (the tag is then removed).
   */
  @write(() => 'Publish version')
  public async publish(
    dryRun: boolean,
    remote?: string,
  ): Promise<PublishResult> {
    return publishVersion(this.checkout, dryRun, remote);
  }

  @write((bumpType) => `Version ${bumpType} bump`)
  private async bumpVersion(bumpType: BumpType): Promise<VersionBump> {
    const { git } = this.checkout;

    // Guard: refuse to version with uncommitted changes
    if (await git.hasUncommittedChanges()) {
      throw new Error(
        'Cannot version: there are uncommitted changes. Please commit or stash them first.',
      );
    }

    const currentVersion = this.checkout.configuration.version;

    // Skipped for the first version — there is no predecessor to break against.
    if (
      currentVersion &&
      bumpType !== 'major' &&
      ConfigurationLogger.hasPendingChanges(this.checkout.basePath)
    ) {
      const entries = (
        await ConfigurationLogger.entries(this.checkout.basePath)
      ).map(classifyEntry);
      const breaking = entries.filter(
        (entry) => entry.classification === 'breaking',
      );
      if (bumpType === 'patch') {
        throw new Error(
          'Cannot publish a patch version: the configuration log contains changes that require a migration:\n' +
            describeEntries(entries) +
            (breaking.length > 0
              ? '\nUse a major version bump.'
              : '\nUse a minor version bump.'),
        );
      }
      if (breaking.length > 0) {
        throw new Error(
          'Cannot publish a minor version: the configuration log contains breaking changes:\n' +
            describeEntries(breaking) +
            '\nUse a major version bump.',
        );
      }
    }

    const newVersion = currentVersion
      ? semver.inc(currentVersion, bumpType)
      : '1.0.0';

    if (!newVersion) {
      throw new Error(
        `Invalid current version '${currentVersion}': cannot compute ${bumpType} bump`,
      );
    }

    // Seal on the first version and every minor/major bump. Patches on an
    // existing version never seal; they must keep a clean log (guarded above).
    if (!currentVersion || bumpType !== 'patch') {
      await ConfigurationLogger.createVersion(
        this.checkout.basePath,
        newVersion,
      );
    }

    // Write new version to cardsConfig
    await this.checkout.configuration.setVersion(newVersion);
    recordSettingsChange(this.checkout.lock);

    return { previousVersion: currentVersion, newVersion };
  }
}
