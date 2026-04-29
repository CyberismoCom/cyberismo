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

import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { vi } from 'vitest';

import { ProjectPaths } from '../../src/containers/project/project-paths.js';
import type { Project } from '../../src/containers/project.js';
import type { FetchTarget, SourceLayer } from '../../src/modules/source.js';
import type { ModuleSetting } from '../../src/interfaces/project-interfaces.js';
import type {
  RemoteQueryOutcome,
  Source,
  VersionRange,
} from '../../src/modules/types.js';

// ---------------------------------------------------------------------------
// Fake on-disk module fixture.
// ---------------------------------------------------------------------------

/** Shape of the `cardsConfig.json` the fake fixture writes. */
export interface FakeModuleConfig {
  cardKeyPrefix: string;
  name?: string;
  modules?: Array<{ name: string; location: string; version?: string }>;
}

/**
 * Build a synthetic module fixture on disk that `Import.importModule`
 * accepts as a `file:` source. The minimum a file-source module needs is
 * a valid `.cards/local/cardsConfig.json`; optional `modules[]` entries
 * declare transitive deps that the resolver walks. A sibling empty
 * `cardRoot/` exists so `Validate.validateFolder` and the `pathExists`
 * precondition in `importModule` sail through cleanly.
 */
export function makeFakeModuleFixture(
  root: string,
  config: FakeModuleConfig,
): string {
  const localDir = join(root, '.cards', 'local');
  mkdirSync(localDir, { recursive: true });
  mkdirSync(join(root, 'cardRoot'), { recursive: true });
  writeFileSync(
    join(localDir, 'cardsConfig.json'),
    JSON.stringify(buildConfigPayload(config), null, 2),
  );
  return root;
}

/**
 * Rewrite an existing fake module fixture's `cardsConfig.json` in place.
 * Used to simulate a module upstream dropping a transitive dependency
 * between imports — the trigger for `cleanOrphans` during `updateAllModules`.
 */
export function rewriteFakeModuleFixture(
  root: string,
  config: FakeModuleConfig,
): void {
  writeFileSync(
    join(root, '.cards', 'local', 'cardsConfig.json'),
    JSON.stringify(buildConfigPayload(config), null, 2),
  );
}

function buildConfigPayload(config: FakeModuleConfig) {
  return {
    cardKeyPrefix: config.cardKeyPrefix,
    name: config.name ?? config.cardKeyPrefix,
    description: '',
    modules: config.modules ?? [],
    hubs: [],
  };
}

// ---------------------------------------------------------------------------
// In-memory SourceLayer for resolver / installer integration tests.
// ---------------------------------------------------------------------------

export interface InMemoryModuleConfig {
  cardKeyPrefix: string;
  name: string;
  modules: Array<{ name: string; location: string; version?: string }>;
}

export interface InMemorySourceOptions {
  /**
   * Synthetic cardsConfig.json payload per `source.location`. The
   * returned `SourceLayer.fetch` materialises these under the staging dir.
   */
  configs: Map<string, InMemoryModuleConfig>;
  /**
   * Available version tags per `source.location`. Consumed by
   * `listRemoteVersions` in descending-preference order as the callers
   * supply them — the resolver already handles semver ranking itself.
   */
  availableByLocation: Map<string, string[]>;
  /**
   * Optional spy invoked on every `fetch` with the target location. Used
   * by the "fetch reuse" tests that assert call counts.
   */
  onFetch?: (target: FetchTarget) => void;
  /**
   * Override `queryRemote`. Defaults to always-reachable which is what
   * the existing integration tests need.
   */
  queryRemote?: (
    source: Source,
    options?: { remoteUrl?: string; range?: VersionRange | string },
  ) => Promise<RemoteQueryOutcome>;
}

/**
 * Build a `SourceLayer` backed entirely by in-memory maps. Consolidates
 * the resolver/installer fakes previously inlined across multiple
 * command-import integration tests.
 */
export function inMemorySource(opts: InMemorySourceOptions): SourceLayer {
  const {
    configs,
    availableByLocation,
    onFetch,
    queryRemote = async () => ({ reachable: true }),
  } = opts;

  return {
    async fetch(target, destRoot, nameHint) {
      onFetch?.(target);
      const dir = join(destRoot, nameHint);
      await mkdir(join(dir, '.cards', 'local'), { recursive: true });
      const cfg = configs.get(target.location);
      if (!cfg) throw new Error(`no fake config for ${target.location}`);
      await writeFile(
        join(dir, '.cards', 'local', 'cardsConfig.json'),
        JSON.stringify(cfg),
      );
      return dir;
    },
    async listRemoteVersions(location) {
      return availableByLocation.get(location) ?? [];
    },
    queryRemote,
  };
}

// ---------------------------------------------------------------------------
// Typed Project stub for modules/* unit tests.
// ---------------------------------------------------------------------------

/**
 * Narrow slice of `Project` used by `modules/installer`, `modules/inventory`
 * and `modules/orphans`. Unit tests construct this directly instead of
 * casting through `as unknown as Project`.
 */
export interface ModuleTestProject {
  basePath: string;
  paths: ProjectPaths;
  projectPrefix: string;
  projectPrefixes(): string[];
  configuration: {
    modules: ModuleSetting[];
    upsertModule(setting: ModuleSetting): Promise<void>;
    removeModule(name: string): Promise<void>;
  };
  refreshAfterModuleChange(): Promise<void>;
}

export interface MakeProjectStubOptions {
  basePath: string;
  /** Initial top-level declarations. Defaults to `[]`. */
  modules?: ModuleSetting[];
  /** Override `projectPrefix`. Defaults to `'root'`. */
  projectPrefix?: string;
}

export interface ProjectStub {
  /**
   * The typed stub. Pass directly to `installer.install`, `createInventory`,
   * `cleanOrphans` — production signatures expect `Project`, so the
   * single cast lives here.
   */
  project: Project;
  /** Live view of the declared modules array (mutated by `upsertModule`). */
  modules: ModuleSetting[];
  /** Vitest spy on `refreshAfterModuleChange`. */
  refreshAfterModuleChange: ReturnType<typeof vi.fn>;
}

/**
 * Build a minimal typed project stub for `modules/*` unit tests. The
 * returned `project` is cast once here so call sites stay cast-free.
 */
export function makeProjectStub(opts: MakeProjectStubOptions): ProjectStub {
  const { basePath, projectPrefix = 'root' } = opts;
  const modules: ModuleSetting[] = opts.modules ?? [];
  const paths = new ProjectPaths(basePath);
  const refreshAfterModuleChange = vi.fn(async () => {});

  const stub: ModuleTestProject = {
    basePath,
    paths,
    projectPrefix,
    projectPrefixes: () => [projectPrefix, ...modules.map((m) => m.name)],
    configuration: {
      modules,
      async upsertModule(setting: ModuleSetting) {
        const existing = modules.find((m) => m.name === setting.name);
        if (existing) {
          existing.version = setting.version;
          if (setting.location) existing.location = setting.location;
          if (setting.private !== undefined) {
            existing.private = setting.private;
          }
        } else {
          modules.push({ ...setting });
        }
      },
      async removeModule(name: string) {
        const idx = modules.findIndex((m) => m.name === name);
        if (idx >= 0) modules.splice(idx, 1);
      },
    },
    refreshAfterModuleChange,
  };

  // Production signatures require a full `Project`; the stub genuinely
  // only implements the subset the module layer touches. This is the
  // single cast — tests receive `Project` directly.
  return {
    project: stub as unknown as Project,
    modules,
    refreshAfterModuleChange,
  };
}
