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

import { join } from 'node:path';
import semver from 'semver';

import { readJsonFile } from '../../utils/json.js';
import { checkLinearity, computeChain } from '../../mutations/replay/chain.js';
import {
  listSealFiles,
  type SealFile,
} from '../../mutations/replay/seal-files.js';
import { installedModulesWithSources, declaredModules } from '../inventory.js';
import { buildRemoteUrl } from '../remote-url.js';
import { versionToTag } from '../version.js';
import {
  toVersion,
  toVersionRange,
  type Source,
  type Version,
  type VersionRange,
} from '../types.js';
import { createSourceLayer, type SourceLayer } from '../source.js';
import type { ResolvedModule } from '../resolver.js';
import type { Project } from '../../containers/project.js';
import type { Credentials } from '../../interfaces/project-interfaces.js';
import type {
  Change,
  ConflictDemand,
  ResolveConflict,
  ResolveResult,
  UpdateRequest,
} from './types.js';

interface Edge {
  name: string;
  source: Source;
  range: VersionRange;
}
interface Node {
  name: string;
  source: Source;
  installed: Version | null;
  path: string | null;
  isRoot: boolean;
  declaredRange: VersionRange | null;
}
interface Decision {
  version: Version | null;
  edges: Edge[];
}
type Assignment = Map<string, Decision>;

/** Solver internals shared between {@link resolve} and {@link resolveForApply}. */
interface SolveOutcome {
  result: ResolveResult;
  nodes: Map<string, Node>;
  assign: Assignment;
}

function toEdges(config: {
  modules?: Array<{
    name?: unknown;
    location?: unknown;
    version?: string;
    private?: boolean;
  }>;
}): Edge[] {
  return (config.modules ?? [])
    .filter(
      (
        d,
      ): d is {
        name: string;
        location: string;
        version?: string;
        private?: boolean;
      } =>
        typeof d.name === 'string' &&
        d.name.length > 0 &&
        typeof d.location === 'string' &&
        d.location.length > 0,
    )
    .map((d) => ({
      name: d.name,
      source: { location: d.location, private: d.private ?? false },
      range: toVersionRange(
        d.version && d.version.length > 0 ? d.version : '*',
      ),
    }));
}

async function solve(
  project: Project,
  req: UpdateRequest,
  source: SourceLayer,
  credentials?: Credentials,
): Promise<SolveOutcome> {
  const installed = await installedModulesWithSources(project);
  const declaredByName = new Map(
    declaredModules(project).map((d) => [d.name, d]),
  );

  const nodes = new Map<string, Node>();
  for (const i of installed) {
    const decl = declaredByName.get(i.name);
    nodes.set(i.name, {
      name: i.name,
      source: i.source,
      installed: i.version ?? null,
      path: i.path,
      isRoot: decl !== undefined,
      declaredRange: decl?.versionRange ?? null,
    });
  }
  // Fresh import: seed a not-yet-installed root from the prefetched name+source.
  // Upsert so re-importing an installed module frees it like an update.
  if (req.kind === 'add') {
    const existing = nodes.get(req.name);
    // Re-importing an already-installed module from a different source is a
    // conflict — the prefix is already bound to its origin. Reject before any
    // disk change rather than silently rebinding it.
    if (existing?.path) {
      const existingPrivate = existing.source.private ?? false;
      const declPrivate = req.source.private ?? false;
      if (
        existing.source.location !== req.source.location ||
        existingPrivate !== declPrivate
      ) {
        throw new Error(
          `Conflicting source for module '${req.name}': ` +
            `installed from '${existing.source.location}' ` +
            `(private=${existingPrivate}), but also declared with ` +
            `'${req.source.location}' (private=${declPrivate})`,
        );
      }
    }
    nodes.set(req.name, {
      name: req.name,
      source: req.source,
      installed: existing?.installed ?? null,
      path: existing?.path ?? null,
      isRoot: true,
      declaredRange: req.range ?? null,
    });
  }
  const nodeFor = (name: string, src: Source): Node => {
    const found = nodes.get(name);
    if (found) return found;
    const created: Node = {
      name,
      source: src,
      installed: null,
      path: null,
      isRoot: false,
      declaredRange: null,
    };
    nodes.set(name, created);
    return created;
  };

  const candidateCache = new Map<
    string,
    { edges: Edge[]; seals: SealFile[] }
  >();
  const installedSealCache = new Map<string, SealFile[]>();

  const installedSeals = async (n: Node): Promise<SealFile[]> => {
    if (!n.installed || !n.path) return [];
    const hit = installedSealCache.get(n.name);
    if (hit) return hit;
    const seals = await listSealFiles(join(n.path, 'migrations'));
    installedSealCache.set(n.name, seals);
    return seals;
  };

  const readCandidate = async (n: Node, v: Version | null) => {
    const key = `${n.name}@${v}`;
    const hit = candidateCache.get(key);
    if (hit) return hit;
    let edges: Edge[];
    let seals: SealFile[];
    // updateAll on an unversioned (to === null) installed module tracks a
    // moving source, so its transitive set may have drifted from the vendored
    // copy. Re-read from source to surface added/dropped deps; otherwise the
    // cheaper installed-config read is authoritative.
    const refreshUnversioned =
      req.kind === 'updateAll' && v === null && n.installed === null;
    if (n.installed === v && n.path && !refreshUnversioned) {
      edges = toEdges(
        await readJsonFile(project.paths.moduleConfigurationFile(n.name)),
      );
      seals = await listSealFiles(join(n.path, 'migrations'));
    } else {
      const url = buildRemoteUrl(n.source, credentials);
      const meta = await source.readMetadata(n.source, v, url);
      edges = toEdges(meta.config);
      seals = meta.seals;
    }
    const result = { edges, seals };
    candidateCache.set(key, result);
    return result;
  };

  const availableVersions = async (n: Node): Promise<Version[]> => {
    if (!source.supportsVersioning(n.source.location))
      return n.installed ? [n.installed] : [];
    const url = buildRemoteUrl(n.source, credentials);
    const remote = (
      await source.listRemoteVersions(n.source.location, url)
    ).map(toVersion);
    // An installed versioned module stays a candidate even if the remote
    // currently lists no tags — only a genuinely tagless source is unversioned.
    if (remote.length === 0 && n.installed) return [n.installed];
    return remote;
  };

  const candidatesFor = async (n: Node): Promise<(Version | null)[]> => {
    const avail = await availableVersions(n);
    if (avail.length === 0) return [null]; // unversioned / tagless: install-as-is
    const newestFirst = [...avail].sort(semver.rcompare) as Version[];
    const inRange = n.declaredRange
      ? newestFirst.filter((v) => semver.satisfies(v, n.declaredRange!))
      : newestFirst;
    const fromInstalled = (): Version[] => {
      const asc = [...avail].sort(semver.compare) as Version[];
      return n.installed
        ? [n.installed, ...asc.filter((v) => v !== n.installed)]
        : asc;
    };
    switch (req.kind) {
      case 'verify':
        // An installed module with no version is unversioned (install-as-is),
        // not a conflict — even if its remote happens to list tags.
        return n.installed !== null ? [n.installed] : [null];
      case 'update':
        if (n.name !== req.module) return fromInstalled();
        return req.to ? [req.to] : inRange;
      case 'add':
        return n.name === req.name ? inRange : fromInstalled();
      case 'updateAll':
        return inRange; // everything to newest-in-range, transitive included
      case 'availability': {
        if (!req.module) return inRange; // "can I update all?" → everything to newest
        return n.name === req.module ? inRange : fromInstalled();
      }
    }
  };

  const isReplayable = async (n: Node, v: Version | null): Promise<boolean> => {
    if (v === null || !n.installed || n.installed === v) return true;
    const before = await installedSeals(n);
    const { seals: target } = await readCandidate(n, v);
    if (checkLinearity(before, target).length > 0) return false;
    try {
      computeChain(target, n.installed, v);
      return true;
    } catch {
      return false;
    }
  };

  // Carries which module imposed each range, so a refusal names the culprits.
  const dependentRanges = (
    name: string,
    assign: Assignment,
  ): ConflictDemand[] => {
    const out: ConflictDemand[] = [];
    for (const [producer, d] of assign)
      for (const e of d.edges)
        if (e.name === name) out.push({ range: e.range, from: producer });
    return out;
  };

  const conflicts: ResolveConflict[] = [];

  const dfs = async (queue: Node[], assign: Assignment): Promise<boolean> => {
    if (queue.length === 0) return true;
    const [n, ...rest] = queue;
    if (assign.has(n.name)) return dfs(rest, assign);
    const incoming = dependentRanges(n.name, assign);
    for (const v of await candidatesFor(n)) {
      if (v !== null && !incoming.every((d) => semver.satisfies(v, d.range)))
        continue;
      if (!(await isReplayable(n, v))) continue;
      const { edges } = await readCandidate(n, v);
      if (
        edges.some((e) => {
          const d = assign.get(e.name);
          return (
            d && d.version !== null && !semver.satisfies(d.version, e.range)
          );
        })
      )
        continue;
      assign.set(n.name, { version: v, edges });
      const next = [
        ...rest,
        ...edges
          .map((e) => nodeFor(e.name, e.source))
          .filter((m) => !assign.has(m.name)),
      ];
      if (await dfs(next, assign)) return true;
      assign.delete(n.name);
    }
    conflicts.push({ module: n.name, demands: incoming });
    return false;
  };

  const assign: Assignment = new Map();
  const ok = await dfs(
    [...nodes.values()].filter((n) => n.isRoot),
    assign,
  );
  if (!ok) {
    // Dedupe by module: keep the richest demand set, drop dead-branch noise.
    const byModule = new Map<string, ResolveConflict>();
    for (const c of conflicts) {
      const prev = byModule.get(c.module);
      if (!prev || c.demands.length > prev.demands.length)
        byModule.set(c.module, c);
    }
    return {
      result: { ok: false, conflicts: [...byModule.values()] },
      nodes,
      assign,
    };
  }

  const changes: Change[] = [];
  for (const [name, decision] of assign) {
    const node = nodes.get(name)!;
    const from = node.installed; // Version | null
    const to = decision.version; // Version | null
    const wasInstalled = node.path !== null;
    // An unversioned module (to === null) tracks a moving source, so its
    // refreshed config may have changed even though from === to === null —
    // which would otherwise read as "no change". Re-emit it so dropped/added
    // transitive deps get re-vendored or orphaned: on the add target itself,
    // and on every unversioned root during updateAll.
    const isAddTarget = req.kind === 'add' && name === req.name;
    const isUnversionedRootRefresh =
      req.kind === 'updateAll' && node.isRoot && to === null;
    if (isAddTarget || isUnversionedRootRefresh || !wasInstalled || from !== to) {
      let replay: SealFile[] = [];
      if (from && to && from !== to) {
        try {
          replay = computeChain(
            (await readCandidate(node, to)).seals,
            from,
            to,
          );
        } catch {
          replay = [];
        }
      }
      changes.push({ module: name, from, to, replay });
    }
  }
  return { result: { ok: true, changes }, nodes, assign };
}

export async function resolve(
  project: Project,
  req: UpdateRequest,
  opts?: {
    sourceLayer?: SourceLayer;
    tempDir?: string;
    credentials?: Credentials;
  },
): Promise<ResolveResult> {
  const source = opts?.sourceLayer ?? createSourceLayer();
  try {
    return (await solve(project, req, source, opts?.credentials)).result;
  } finally {
    await source.dispose?.(); // release reused clones (no-op for fakes/file sources)
  }
}

/**
 * Solve, then for each MOVED module fetch the full tree and shape a
 * {@link ResolvedModule} the applier can consume. Roots carry their declared
 * range and no parent; transitives carry the owning installation as parent and
 * no range (the range lives in the parent's own config).
 */
export async function resolveForApply(
  project: Project,
  req: UpdateRequest,
  opts?: {
    sourceLayer?: SourceLayer;
    tempDir?: string;
    credentials?: Credentials;
  },
): Promise<{ plan: ResolveResult; resolved: ResolvedModule[] }> {
  const source = opts?.sourceLayer ?? createSourceLayer();
  const tempDir = opts?.tempDir ?? join(project.paths.tempFolder, 'resolve');
  try {
    const { result, nodes, assign } = await solve(
      project,
      req,
      source,
      opts?.credentials,
    );
    if (!result.ok) return { plan: result, resolved: [] };

    const resolved: ResolvedModule[] = [];
    for (const change of result.changes) {
      const node = nodes.get(change.module)!;
      const remoteUrl = buildRemoteUrl(node.source, opts?.credentials);
      const ref = change.to ? versionToTag(change.to) : undefined;
      // FULL fetch — the apply path needs the whole module tree, not metadata.
      const stagedPath = await source.fetch(
        { location: node.source.location, remoteUrl, ref },
        tempDir,
        change.module,
      );
      // Roots have no parent; a transitive's parent is any chosen module whose
      // edges reference it.
      const referrer = node.isRoot
        ? undefined
        : [...assign].find(([, d]) =>
            d.edges.some((e) => e.name === change.module),
          )?.[0];
      resolved.push({
        declaration: {
          project: project.basePath,
          name: change.module,
          source: node.source,
          versionRange: node.isRoot
            ? (node.declaredRange ?? undefined)
            : undefined,
          parent: referrer
            ? { project: project.basePath, name: referrer }
            : undefined,
        },
        ref,
        remoteUrl,
        version: change.to ?? undefined,
        stagedPath,
      });
    }
    return { plan: result, resolved };
  } finally {
    await source.dispose?.();
  }
}
