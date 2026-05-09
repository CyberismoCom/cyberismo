import { CommandManager } from '@cyberismo/data-handler';
import {
  cp,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { join, sep } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * Scales a project to a target card count by creating cards from a template.
 * Works on a temporary copy of the project.
 *
 * @param projectPath Path to the source project
 * @param targetCount Target number of cards
 * @param templateName Template to use for creating cards
 * @returns Path to the scaled temporary project (caller must clean up)
 */
export async function scaleProject(
  projectPath: string,
  targetCount: number,
  templateName: string,
): Promise<string> {
  // Copy project to temp directory
  const tmpDir = await mkdtemp(join(tmpdir(), 'cyberismo-bench-'));
  await cp(projectPath, tmpDir, { recursive: true });

  // Note: CommandManager.getInstance() is a singleton — calling it with a new
  // path disposes the previous instance. Only use the scaler before or after
  // benchmark runs, not during. If needed mid-benchmark, use the constructor directly.
  const commands = await CommandManager.getInstance(tmpDir);
  const initialCount = commands.project.cards().length;

  if (initialCount >= targetCount) {
    console.error(
      `Project already has ${initialCount} cards (target: ${targetCount})`,
    );
    return tmpDir;
  }

  // Create one instance to determine cards per template
  const testCards = await commands.createCmd.createCard(templateName);
  const cardsPerInstance = testCards.length;
  if (cardsPerInstance === 0) {
    await rm(tmpDir, { recursive: true, force: true });
    throw new Error(
      `Template '${templateName}' produces 0 cards — cannot scale`,
    );
  }

  let currentCount = initialCount + cardsPerInstance;
  console.error(
    `Template '${templateName}' produces ${cardsPerInstance} card(s). Initial: ${initialCount}, target: ${targetCount}`,
  );

  // Scale up
  while (currentCount < targetCount) {
    await commands.createCmd.createCard(templateName);
    currentCount += cardsPerInstance;
    if (currentCount % 500 === 0 || currentCount >= targetCount) {
      console.error(`  ${currentCount} / ${targetCount} cards`);
    }
  }

  console.error(`Scaled to ${currentCount} cards (scratch: ${tmpDir})`);
  return tmpDir;
}

// ── Fast scale path ─────────────────────────────────────────────────────────
// Bypasses commands.createCmd.createCard for the bulk of cards by snapshotting
// a single seed instance's on-disk subtree and replicating it with key
// rewrites. See README-gen-fixtures.md for the audit conclusion that justifies
// skipping handleNewCards / creationQuery for the two configured benchmark
// projects.

interface SeedFileNode {
  /** Path relative to the seed root for this top-level card. */
  relativeDir: string;
  /** Files in this dir (basenames). */
  files: { name: string; data: Buffer }[];
}

interface SeedSnapshot {
  /**
   * For each top-level seed card: list of dir entries under it (recursively).
   * Each entry's `relativeDir` is relative to the per-instance root (e.g.
   * empty string for the top-level card dir, "c/secdeva_xxxx" for a child).
   */
  topLevelKeys: string[];
  /** Map keyed by seedTopKey -> list of dir nodes belonging to that subtree. */
  subtrees: Map<string, SeedFileNode[]>;
  /** Set of every seed-instance card key (top-level + nested). */
  seedKeys: Set<string>;
}

async function readDirRecursive(
  baseDir: string,
  rel: string,
  out: SeedFileNode[],
): Promise<void> {
  const fullDir = join(baseDir, rel);
  const entries = await readdir(fullDir, { withFileTypes: true });
  const node: SeedFileNode = { relativeDir: rel, files: [] };
  for (const entry of entries) {
    if (entry.isFile()) {
      const data = await readFile(join(fullDir, entry.name));
      node.files.push({ name: entry.name, data });
    }
  }
  out.push(node);
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const nextRel = rel ? join(rel, entry.name) : entry.name;
      await readDirRecursive(baseDir, nextRel, out);
    }
  }
}

/**
 * Snapshot the per-card subtrees of every seed top-level card.
 *
 * `cardRoot` is the project's `cardRoot/` folder. `seedTopLevelKeys` are the
 * card keys whose directories live directly under cardRoot (not nested).
 */
async function snapshotSeedInstance(
  cardRoot: string,
  seedTopLevelKeys: string[],
  allSeedKeys: Set<string>,
): Promise<SeedSnapshot> {
  const subtrees = new Map<string, SeedFileNode[]>();
  for (const topKey of seedTopLevelKeys) {
    const topDir = join(cardRoot, topKey);
    const nodes: SeedFileNode[] = [];
    await readDirRecursive(topDir, '', nodes);
    subtrees.set(topKey, nodes);
  }
  return {
    topLevelKeys: seedTopLevelKeys,
    subtrees,
    seedKeys: allSeedKeys,
  };
}

/**
 * Replace each `/<oldKey>/` and trailing `/<oldKey>` segment in `relPath` with
 * the corresponding new key. Path separator agnostic.
 */
function rewritePath(relPath: string, keyMap: Map<string, string>): string {
  if (!relPath) return relPath;
  return relPath
    .split(sep)
    .map((part) => keyMap.get(part) ?? part)
    .join(sep);
}

/**
 * Rewrite a Buffer for an `index.json` file: parse, swap any `links[].cardKey`
 * referenced in keyMap, and re-serialise. Other fields pass through verbatim.
 */
function rewriteIndexJson(data: Buffer, keyMap: Map<string, string>): Buffer {
  const text = data.toString('utf-8');
  const obj = JSON.parse(text) as Record<string, unknown>;
  const links = obj.links;
  if (Array.isArray(links)) {
    obj.links = links.map((link) => {
      if (
        link &&
        typeof link === 'object' &&
        'cardKey' in link &&
        typeof (link as { cardKey: unknown }).cardKey === 'string'
      ) {
        const oldKey = (link as { cardKey: string }).cardKey;
        const newKey = keyMap.get(oldKey);
        if (newKey) {
          return { ...(link as Record<string, unknown>), cardKey: newKey };
        }
      }
      return link;
    });
  }
  // Match the on-disk style: 4-space indent (consistent with seed).
  return Buffer.from(JSON.stringify(obj, null, 4) + '\n');
}

/**
 * Rewrite an attachment-bearing file: in the seed, attachment files are named
 * `<seedKey>-<basename>` and `index.adoc` may reference them by that exact
 * name. Replace every `<seedKey>-` prefix occurrence with `<newKey>-`.
 *
 * For text content (index.adoc): substitute any literal `<oldKey>` occurrence
 * — covers both `image::<seedKey>-...` and any handlebars `{{#image}}` blocks
 * pointing at the renamed attachment file.
 */
function rewriteTextWithKeys(
  data: Buffer,
  keyMap: Map<string, string>,
): Buffer {
  let text = data.toString('utf-8');
  // Only rewrite tokens that actually appear in keyMap to avoid accidental
  // collisions with other strings.
  for (const [oldKey, newKey] of keyMap) {
    if (text.includes(oldKey)) {
      text = text.split(oldKey).join(newKey);
    }
  }
  return Buffer.from(text);
}

function rewriteAttachmentName(
  fileName: string,
  keyMap: Map<string, string>,
): string {
  // Attachment files are named "<cardKey>-<originalName>" by
  // template.processAttachments. Rewrite the prefix if it's in the seed map.
  const dashIdx = fileName.indexOf('-');
  if (dashIdx > 0) {
    const prefix = fileName.slice(0, dashIdx);
    const newPrefix = keyMap.get(prefix);
    if (newPrefix) return newPrefix + fileName.slice(dashIdx);
  }
  return fileName;
}

/**
 * Like `scaleProject` but bypasses createCard for all but the first instance.
 * Snapshots the seed instance's directory tree once, then duplicates it on
 * disk with fresh card keys until `targetCount` is reached.
 *
 * SAFETY: This skips `handleNewCards`, which fires the `onCreation` Clingo
 * query that may produce `onTransitionSetField` / `onTransitionExecuteTransition`
 * effects. For the two configured benchmark projects (cyberismo-docs +
 * base/templates/page, module-eu-cra + secdeva/templates/project) we have
 * audited that no rules fire on creation, so this is semantically a no-op.
 * For OTHER projects, verify the audit before using this path.
 */
export async function fastScaleProject(
  projectPath: string,
  targetCount: number,
  templateName: string,
): Promise<string> {
  // 1. Copy project to temp directory.
  const tmpDir = await mkdtemp(join(tmpdir(), 'cyberismo-bench-fast-'));
  await cp(projectPath, tmpDir, { recursive: true });

  const commands = await CommandManager.getInstance(tmpDir);
  const initialCount = commands.project.cards().length;
  if (initialCount >= targetCount) {
    console.error(
      `Project already has ${initialCount} cards (target: ${targetCount})`,
    );
    return tmpDir;
  }

  // 2. Seed: pay the createCard cost ONCE.
  const seedCards = await commands.createCmd.createCard(templateName);
  const cardsPerInstance = seedCards.length;
  if (cardsPerInstance === 0) {
    await rm(tmpDir, { recursive: true, force: true });
    throw new Error(
      `Template '${templateName}' produces 0 cards — cannot scale`,
    );
  }

  // 3. Identify top-level seed cards (parent === ROOT/'root') and the full
  //    set of seed keys (top + nested).
  const seedKeys = new Set(seedCards.map((c) => c.key));
  const seedTopLevelKeys = seedCards
    .filter((c) => !c.parent || c.parent === 'root')
    .map((c) => c.key);
  if (seedTopLevelKeys.length === 0) {
    await rm(tmpDir, { recursive: true, force: true });
    throw new Error(
      `Template '${templateName}' did not produce any top-level cards`,
    );
  }

  const cardRoot = join(tmpDir, 'cardRoot');
  const projectPrefix = commands.project.projectPrefix;

  // 4. Snapshot the seed instance's on-disk subtree.
  const snapshot = await snapshotSeedInstance(
    cardRoot,
    seedTopLevelKeys,
    seedKeys,
  );

  let currentCount = initialCount + cardsPerInstance;
  console.error(
    `[fast] Template '${templateName}' produces ${cardsPerInstance} card(s). Initial: ${initialCount}, target: ${targetCount}. Seed keys: ${seedKeys.size}, top-level: ${seedTopLevelKeys.length}`,
  );

  // 5. Replicate. Use a deterministic counter-based key scheme that won't
  //    collide with the seed (seed keys are 8-char base36; we use a different
  //    pattern: <prefix>_b<n>).
  let keyCounter = 0;
  while (currentCount < targetCount) {
    // Generate a fresh key map for this instance.
    const keyMap = new Map<string, string>();
    for (const seedKey of seedKeys) {
      // Unique, collision-free with seed keys (which never match this pattern).
      const newKey = `${projectPrefix}_b${keyCounter++}`;
      keyMap.set(seedKey, newKey);
    }

    // Reconstruct subtrees on disk.
    for (const seedTopKey of snapshot.topLevelKeys) {
      const newTopKey = keyMap.get(seedTopKey);
      if (!newTopKey) {
        throw new Error(
          `internal: seed top-level key ${seedTopKey} missing from keyMap`,
        );
      }
      const newTopDir = join(cardRoot, newTopKey);
      const nodes = snapshot.subtrees.get(seedTopKey);
      if (!nodes) {
        throw new Error(
          `internal: seed subtree for ${seedTopKey} missing from snapshot`,
        );
      }
      for (const node of nodes) {
        const newRelDir = rewritePath(node.relativeDir, keyMap);
        const dirAbs = newRelDir ? join(newTopDir, newRelDir) : newTopDir;
        await mkdir(dirAbs, { recursive: true });
        for (const file of node.files) {
          let data: Buffer;
          let outName = file.name;
          if (file.name === 'index.json') {
            data = rewriteIndexJson(file.data, keyMap);
          } else if (file.name === 'index.adoc') {
            data = rewriteTextWithKeys(file.data, keyMap);
          } else if (
            newRelDir.split(sep).pop() === 'a' ||
            node.relativeDir.split(sep).pop() === 'a'
          ) {
            // Attachment: rewrite filename prefix and (if text) any embedded
            // key references. Most attachments are binary (svg/png/...), in
            // which case key prefix replacement on the raw bytes for binary
            // formats would be unsafe. We only touch the FILENAME for
            // attachments — content is copied verbatim.
            outName = rewriteAttachmentName(file.name, keyMap);
            data = file.data;
          } else {
            // Unknown file under a card dir (e.g. .schema). Pass through.
            data = file.data;
          }
          await writeFile(join(dirAbs, outName), data);
        }
      }
    }

    currentCount += cardsPerInstance;
    if (currentCount % 500 === 0 || currentCount >= targetCount) {
      console.error(`  [fast] ${currentCount} / ${targetCount} cards`);
    }
  }

  console.error(`[fast] Scaled to ${currentCount} cards (scratch: ${tmpDir})`);
  // We wrote files directly to disk, bypassing the card cache. The
  // CommandManager singleton is re-used by the caller (the second
  // getInstance(tmpDir) returns the SAME live instance), so we must refresh
  // the cache from disk now or the caller's `commands.project.cards()`
  // will only see the seed instance.
  commands.project.cardsCache.clear();
  await commands.project.cardsCache.populateFromPath(cardRoot);
  // Match the slow path's contract: do NOT dispose. Caller owns the lifetime.
  return tmpDir;
}

/**
 * Cleans up a temporary scaled project directory
 */
export async function cleanupScaledProject(tmpDir: string): Promise<void> {
  await rm(tmpDir, { recursive: true, force: true });
}
