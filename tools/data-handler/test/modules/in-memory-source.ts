import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { isGitLocation } from '../../src/modules/location.js';
import type { SourceLayer, FetchTarget } from '../../src/modules/source.js';
import type { Source, Version } from '../../src/modules/types.js';
import type { ProjectSettings } from '../../src/interfaces/project-interfaces.js';
import type { SealFile } from '../../src/mutations/replay/seal-files.js';
import { versionToTag } from '../../src/modules/version.js';

/** Minimal `cardsConfig.json` shape the resolver reads. */
export interface FakeModuleConfig {
  cardKeyPrefix?: string;
  name?: string;
  modules?: Array<{
    name: string;
    location: string;
    version?: string;
    private?: boolean;
  }>;
}

/**
 * In-memory `SourceLayer` for tests. Writes a synthetic `cardsConfig.json`
 * on fetch, and serves metadata from maps keyed by `location` or
 * `${location}@${tag}`.
 *
 * Constructor params:
 *   configs            — map from location (or `location@tag`) to config
 *   availableByLocation — map from location to semver tag list
 *   fetchOverrides     — optional map from location to a function that throws
 *   sealsByRef         — optional map from `location@tag` to seal pairs
 *   unreachable        — optional set of locations whose version listing throws,
 *                        simulating an unreachable remote
 */
export class InMemorySource implements SourceLayer {
  readonly fetchLog: Array<{
    location: string;
    remoteUrl: string;
    ref?: string;
    nameHint: string;
  }> = [];
  readonly listLog: string[] = [];

  constructor(
    private readonly configs: Map<string, FakeModuleConfig>,
    private readonly availableByLocation: Map<string, string[]>,
    private readonly fetchOverrides: Map<
      string,
      () => Promise<never>
    > = new Map(),
    private readonly sealsByRef: Map<
      string,
      Array<[string, string]>
    > = new Map(),
    private readonly unreachable: Set<string> = new Set(),
  ) {}

  async fetch(
    target: FetchTarget,
    destRoot: string,
    nameHint: string,
  ): Promise<string> {
    this.fetchLog.push({
      location: target.location,
      remoteUrl: target.remoteUrl,
      ref: target.ref,
      nameHint,
    });
    const override = this.fetchOverrides.get(target.location);
    if (override) {
      await override();
    }
    const dir = join(destRoot, nameHint);
    await mkdir(join(dir, '.cards', 'local'), { recursive: true });
    const config = this.configs.get(target.location) ?? {
      cardKeyPrefix: nameHint,
      name: nameHint,
      modules: [],
    };
    await writeFile(
      join(dir, '.cards', 'local', 'cardsConfig.json'),
      JSON.stringify(config),
    );
    return dir;
  }

  supportsVersioning(location: string): boolean {
    return isGitLocation(location);
  }

  async listRemoteVersions(location: string): Promise<string[]> {
    this.listLog.push(location);
    if (this.unreachable.has(location)) {
      throw new Error(`remote unreachable: ${location}`);
    }
    return this.availableByLocation.get(location) ?? [];
  }

  async queryRemote(): Promise<never> {
    throw new Error('queryRemote not used in tests');
  }

  async readMetadata(
    source: Source,
    version: Version | null,
  ): Promise<{ config: ProjectSettings; seals: SealFile[] }> {
    const tag = version === null ? undefined : versionToTag(version);
    return {
      config: this.cfg(source.location, tag),
      seals: tag !== undefined ? this.sealsAt(source.location, tag) : [],
    };
  }

  private cfg(location: string, tag: string | undefined): ProjectSettings {
    const raw =
      (tag !== undefined
        ? this.configs.get(`${location}@${tag}`)
        : undefined) ??
      this.configs.get(location) ??
      ({ cardKeyPrefix: 'unknown', modules: [] } as FakeModuleConfig);
    return raw as unknown as ProjectSettings;
  }

  private sealsAt(location: string, tag: string): SealFile[] {
    const pairs = this.sealsByRef.get(`${location}@${tag}`) ?? [];
    return pairs.map(([from, to]) => ({
      from,
      to,
      fileName: `migrationLog_${from}_${to}.jsonl`,
    }));
  }
}
