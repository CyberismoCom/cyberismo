/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2024
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { join, resolve as pathResolve } from 'node:path';

import { pathExists } from '../utils/file-utils.js';
import { readCsvFile } from '../utils/csv.js';
import { Validate } from './validate.js';
import { write } from '../utils/rw-lock.js';

import {
  createInventory,
  createInstaller,
  createResolver,
  createSourceLayer,
  toVersionRange,
  validateVersionAgainstConstraints,
} from '../modules/index.js';
import { cleanOrphans } from '../modules/orphans.js';

import type { Create } from './create.js';
import type {
  Credentials,
  ModuleSettingOptions,
} from '../interfaces/project-interfaces.js';
import type { Fetch } from './fetch.js';
import type { Project } from '../containers/project.js';
import type { ModuleDeclaration } from '../modules/types.js';

const HTTPS_PROTOCOL = 'https:';
const FILE_PROTOCOL = 'file:';
const SSH_PREFIX = 'git@';

/**
 * Coerce a caller-supplied source into the canonical form used by the
 * module layers:
 *
 * - Git URLs (`https://…`, `git@…`) pass through unchanged.
 * - `file:<path>` URLs pass through unchanged.
 * - Any other value is treated as a bare filesystem path and rewritten to
 *   `file:<absolute path>` so the source layer can dispatch on the protocol.
 */
function normaliseLocation(source: string): string {
  if (
    source.startsWith(HTTPS_PROTOCOL) ||
    source.startsWith(SSH_PREFIX) ||
    source.startsWith(FILE_PROTOCOL)
  ) {
    return source;
  }
  return `${FILE_PROTOCOL}${pathResolve(source)}`;
}

/** True when the normalised source targets a local file tree. */
function isFileSource(location: string): boolean {
  return location.startsWith(FILE_PROTOCOL);
}

/**
 * Handles all import commands.
 */
export class Import {
  /**
   * Creates an instance of Import.
   * @param project Project to use.
   * @param createCmd Instance of Create to use.
   */
  constructor(
    private project: Project,
    private createCmd: Create,
    private fetchCmd: Fetch,
  ) {}

  /** Temp directory shared between the resolver and the installer. */
  private get tempModulesDir(): string {
    return join(this.project.paths.tempFolder, 'modules');
  }

  /**
   * Imports cards based on a csv file
   * @param csvFilePath path to the csv file
   * @param parentCardKey the cards in the csv file will be created under this card
   * @returns card keys of the imported cards
   */
  @write((csvFilePath) => `Import cards from CSV ${csvFilePath}`)
  public async importCsv(
    csvFilePath: string,
    parentCardKey?: string,
  ): Promise<string[]> {
    const csv = await readCsvFile(csvFilePath);

    const isValid = Validate.getInstance().validateJson(csv, 'csvSchema');
    if (isValid.length !== 0) {
      throw new Error(isValid);
    }

    const importedCards = [];

    for (const row of csv) {
      const { title, template, description, labels, ...customFields } = row;
      const templateResource = this.project.resources.byType(
        template,
        'templates',
      );
      const templateObject = templateResource.templateObject();
      if (!templateObject) {
        throw new Error(`Template '${template}' not found`);
      }

      const templateCards = templateObject.cards();
      if (templateCards.length !== 1) {
        console.warn(
          `Template '${template}' for card '${title}' does not have exactly one card. Skipping row.`,
        );
        continue;
      }

      // Create card
      const cards = await this.createCmd.createCard(template, parentCardKey);

      if (cards.length !== 1) {
        throw new Error('Card not created');
      }
      const cardKey = cards[0].key;
      const card = this.project.findCard(cardKey);
      if (!card.metadata?.cardType) {
        throw new Error(`Card type not found for card ${cardKey}`);
      }
      const cardType = this.project.resources
        .byType(card.metadata?.cardType, 'cardTypes')
        .show();

      if (description) {
        await this.project.updateCardContent(cardKey, description);
      }

      if (labels) {
        for (const label of labels.split(' ')) {
          try {
            await this.createCmd.createLabel(cardKey, label);
          } catch (e) {
            console.error(
              `Failed to create label ${label}: ${e instanceof Error ? e.message : 'Unknown error'}`,
            );
          }
        }
      }

      await this.project.updateCardMetadataKey(cardKey, 'title', title);
      for (const [key, value] of Object.entries(customFields)) {
        if (cardType.customFields.find((field) => field.name === key)) {
          await this.project.updateCardMetadataKey(cardKey, key, value);
        }
      }
      importedCards.push(cardKey);
    }
    return importedCards;
  }

  /**
   * Imports a module to a project (spec's `ImportModule`, upsert semantics).
   * Copies resources to the project under `.cards/modules/<prefix>/`.
   *
   * Re-importing an already-declared module with the same source updates
   * the declared range rather than erroring. A re-import with a different
   * source for an existing name is rejected by the resolver via the
   * `DeclarationAndInstallationAgreeOnSource` invariant.
   *
   * @param source Path to module that will be imported. Git URLs
   *   (`https://…`, `git@…`) and `file:` URLs pass through; bare
   *   filesystem paths are rewritten to `file:<absolute>`.
   * @param destination Unused. Kept for backwards-compatibility with the
   *   CLI command signature — the destination is always the project the
   *   `Import` command was constructed with.
   * @param options Additional options for module import. Optional.
   *        private: If true, uses credentials to clone the repository
   *        version: Semver version or range (e.g. '1.0.0', '^1.0.0')
   */
  @write((source) => `Import module ${source}`)
  public async importModule(
    source: string,
    destination?: string,
    options?: ModuleSettingOptions,
  ) {
    void destination;

    // Ensure module list is up to date before importing.
    await this.fetchCmd.ensureModuleListUpToDate();

    const beforeImportValidateErrors = await Validate.getInstance().validate(
      this.project.basePath,
      () => this.project,
    );

    const location = normaliseLocation(source);

    // Early precondition check for file sources: catch bad folder names and
    // missing paths before we hand off to the resolver so the error message
    // matches what the legacy `importFileModule` produced.
    if (isFileSource(location)) {
      const folder = location.substring(FILE_PROTOCOL.length);
      if (!Validate.validateFolder(folder)) {
        throw new Error(
          `Input validation error: folder name is invalid '${folder}'`,
        );
      }
      if (!pathExists(folder)) {
        throw new Error(
          `Input validation error: cannot find project '${folder}'`,
        );
      }
    }

    const inventory = createInventory();
    const existing = inventory.declared(this.project);

    // Build the fresh root declaration for the module being imported. The
    // resolver fills in `name` from the fetched module's cardKeyPrefix when
    // it is empty.
    const newRoot: ModuleDeclaration = {
      project: this.project.basePath,
      name: '',
      source: {
        location,
        private: options?.private ?? false,
      },
      versionRange: options?.version
        ? toVersionRange(options.version)
        : undefined,
      parent: undefined,
    };

    // Include existing top-level declarations so the resolver's source-
    // agreement check fires on a genuine location mismatch. Existing
    // declarations that happen to share a name with the new root are kept
    // so the resolver can see the collision.
    const allRoots: ModuleDeclaration[] = [newRoot, ...existing];

    const sourceLayer = createSourceLayer();
    const resolver = createResolver(sourceLayer);
    const installer = createInstaller(sourceLayer);

    const resolved = await resolver.resolve(allRoots, {
      credentials: options?.credentials,
      tempDir: this.tempModulesDir,
      onConflict: (event) => {
        console.warn(
          `Diamond version conflict for module '${event.name}': ` +
            `installed version ${event.installedVersion ?? '<unknown>'} ` +
            `does not satisfy range '${event.rejectingRange}' ` +
            `(required by ${event.rejectingParent?.name ?? '<unknown parent>'})`,
        );
      },
    });

    // Only install the new root's subgraph — anything already declared has
    // already been installed by a previous import/update and should not be
    // churned by this import. The resolver still produces entries for
    // existing roots (so transitive dedup works); we just skip re-installing
    // them here.
    const existingNames = new Set(existing.map((d) => d.name));
    await installer.install(this.project, resolved, {
      credentials: options?.credentials,
      skip: existingNames,
      tempDir: this.tempModulesDir,
      validate: isFileSource(location),
    });

    // Clean up any installations orphaned by this import. Fixed-point
    // cascade per the `NoOrphanInstallations` invariant.
    await cleanOrphans(this.project);

    // Refresh the project's cached module prefixes and template cards so
    // the newly-installed root is immediately usable through the Project
    // API. The installer already persisted the declaration via
    // `configuration.upsertModule`; here we drive the side-effects on the
    // in-memory `Project` (cache invalidation + template-card population).
    const newRootResolved = resolved.find(
      (r) => r.declaration.source.location === location,
    );
    if (newRootResolved) {
      const persistedRange = newRootResolved.declaration.versionRange;
      await this.project.importModule({
        name: newRootResolved.declaration.name,
        location,
        private: options?.private,
        version:
          persistedRange ??
          (newRootResolved.version ? `^${newRootResolved.version}` : undefined),
      });
    } else {
      // Defensive: the resolver dedupes on name, so a re-import whose
      // name already resolved earlier (e.g. from transitive deps) may not
      // surface the new location. Drive the project-side refresh against
      // the declaration we know the caller asked for.
      console.warn(
        `importModule: no resolved entry matched source '${location}'; falling back to cache refresh only.`,
      );
      this.project.resources.changedModules();
    }

    // Validate the project after module has been imported.
    const afterImportValidateErrors = await Validate.getInstance().validate(
      this.project.basePath,
      () => this.project,
    );
    if (afterImportValidateErrors.length > beforeImportValidateErrors.length) {
      console.error(
        `There are new validations errors after importing the module. Check the project`,
      );
    }
  }

  // Collect declared version range constraints for a module. Used by the
  // "update to exact version X" path to validate the override against
  // already-declared ranges.
  private collectConstraints(moduleName: string) {
    const constraints: { range: string; source: string }[] = [];
    for (const mod of this.project.configuration.modules) {
      if (mod.name === moduleName && mod.version) {
        constraints.push({ range: mod.version, source: 'project' });
      }
    }
    return constraints;
  }

  /**
   * Updates a specific imported module (spec's `UpdateModules(name)`).
   * @param moduleName Name (prefix) of module to update.
   * @param credentials Optional credentials for a private module.
   * @param version Optional target version to update to.
   * @throws if module is not part of the project
   */
  @write((moduleName) => `Update module ${moduleName}`)
  public async updateModule(
    moduleName: string,
    credentials?: Credentials,
    version?: string,
  ) {
    // Ensure module list is up to date before updating
    await this.fetchCmd.ensureModuleListUpToDate();

    const inventory = createInventory();
    const declared = inventory.declared(this.project);
    const target = declared.find((d) => d.name === moduleName);
    if (!target) {
      throw new Error(`Module '${moduleName}' is not part of the project`);
    }

    const sourceLayer = createSourceLayer();
    const resolver = createResolver(sourceLayer);
    const installer = createInstaller(sourceLayer);

    let overrides: Map<string, string> | undefined;
    if (version) {
      // Validate the override against any declared ranges for this name.
      const constraints = this.collectConstraints(moduleName);
      if (constraints.length > 0) {
        validateVersionAgainstConstraints(moduleName, version, constraints);
      }

      // Pre-check that the version is actually available on the remote so
      // we surface an actionable error before touching the filesystem.
      const remoteVersions = await sourceLayer.listRemoteVersions(
        target.source.location,
      );
      if (remoteVersions.length > 0 && !remoteVersions.includes(version)) {
        throw new Error(
          `Version '${version}' is not available for module '${moduleName}'. ` +
            `Available versions: ${remoteVersions.join(', ') || 'none'}`,
        );
      }

      overrides = new Map<string, string>([[moduleName, version]]);
    }

    const resolved = await resolver.resolve(declared, {
      credentials,
      overrides,
      tempDir: this.tempModulesDir,
      onConflict: (event) => {
        console.warn(
          `Diamond version conflict for module '${event.name}': ` +
            `installed version ${event.installedVersion ?? '<unknown>'} ` +
            `does not satisfy range '${event.rejectingRange}' ` +
            `(required by ${event.rejectingParent?.name ?? '<unknown parent>'})`,
        );
      },
    });

    await installer.install(this.project, resolved, {
      credentials,
      tempDir: this.tempModulesDir,
    });

    await cleanOrphans(this.project);
  }

  /**
   * Updates all imported modules (spec's `UpdateModules`, no name).
   * @param credentials Optional credentials for private modules.
   */
  @write(() => 'Update all modules')
  public async updateAllModules(credentials?: Credentials) {
    // Ensure module list is up to date before updating all modules
    await this.fetchCmd.ensureModuleListUpToDate();

    const inventory = createInventory();
    const declared = inventory.declared(this.project);

    if (declared.length === 0) {
      // Preserve the legacy "no modules to update" error so callers that
      // depended on it still observe a failure.
      throw new Error('No modules in the project!');
    }

    const sourceLayer = createSourceLayer();
    const resolver = createResolver(sourceLayer);
    const installer = createInstaller(sourceLayer);

    const resolved = await resolver.resolve(declared, {
      credentials,
      tempDir: this.tempModulesDir,
      onConflict: (event) => {
        console.warn(
          `Diamond version conflict for module '${event.name}': ` +
            `installed version ${event.installedVersion ?? '<unknown>'} ` +
            `does not satisfy range '${event.rejectingRange}' ` +
            `(required by ${event.rejectingParent?.name ?? '<unknown parent>'})`,
        );
      },
    });

    await installer.install(this.project, resolved, {
      credentials,
      tempDir: this.tempModulesDir,
    });

    await cleanOrphans(this.project);
  }
}
