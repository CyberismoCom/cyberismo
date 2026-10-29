// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import semver from 'semver';
import type { ActorRef, PublishResult, VersionBump } from '@cyberismo/model';
import { Validate } from '../domain/validation/index.js';
import type { Checkout } from '../state/checkout/checkout.js';
import type { ConfigurationLogEntry } from '../infra/replay-log/configuration-logger.js';
import {
  ConfigurationLogger,
  RETIRED_OPERATIONS,
} from '../infra/replay-log/configuration-logger.js';
import type { ChangeClassification } from '../domain/resources/index.js';
import { classify } from '../domain/resources/index.js';
import { entryToMutationInput } from '../domain/resources/index.js';
import { recordSettingsChange } from '../infra/tx/change-feed.js';
import { write } from '../infra/tx/rw-lock.js';
import type { CommitIdentity } from '../infra/tx/tx-record.js';
import { tagVersion } from '../domain/versions/index.js';
import { errorFunction } from '../shared/utils/error-utils.js';

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
  /** @internal */
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
   * Publishes the current version: tags it, and pushes the tag once the
   * write is over.
   * @throws if there is no version or it is already published; or, with the
   *   tag kept, if the push fails.
   */
  public async publish(
    dryRun: boolean,
    remote?: string,
  ): Promise<PublishResult> {
    const result = await this.tag(dryRun, remote);
    if (!dryRun) {
      try {
        await this.checkout.git.push({ tags: true, remote: result.remote });
      } catch (error) {
        throw new Error(
          `Tagged v${result.version}, but could not push it to '${result.remote}': ${errorFunction(error)}; push it with 'git push ${result.remote} v${result.version}'`,
          { cause: error },
        );
      }
    }
    return result;
  }

  @write(() => 'Publish version')
  private async tag(dryRun: boolean, remote?: string): Promise<PublishResult> {
    return tagVersion(this.checkout, dryRun, remote);
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
