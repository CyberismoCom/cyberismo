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
 * Escape a string so it can be embedded literally in a RegExp source.
 */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Rewrite an attachment-bearing file: in the seed, attachment files are named
 * `<seedKey>-<basename>` and `index.adoc` may reference them by that exact
 * name. Replace every `<seedKey>-` prefix occurrence with `<newKey>-`.
 *
 * For text content (index.adoc): substitute any whole-word occurrence of a
 * known seed key with its replacement. Word boundaries (`\b`) prevent
 * accidental collisions with substrings that just happen to contain a seed key
 * — covers both `image::<seedKey>-...` and any handlebars `{{#image}}` blocks
 * pointing at the renamed attachment file.
 */
function rewriteTextWithKeys(
  data: Buffer,
  keyMap: Map<string, string>,
): Buffer {
  if (keyMap.size === 0) return data;
  const text = data.toString('utf-8');
  const escaped = [...keyMap.keys()].map(escapeRegExp).join('|');
  const re = new RegExp(`\\b(?:${escaped})\\b`, 'g');
  const replaced = text.replace(re, (m) => keyMap.get(m) ?? m);
  return Buffer.from(replaced);
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
/**
 * Recursively delete leaf cards under `cardRoot` until at most
 * `targetCount` cards remain. A leaf is a directory containing `index.json`
 * with no live children under its `c/` subdirectory. We delete deepest
 * cards first so each deletion preserves project validity (no orphans).
 *
 * `protectedCardTypes` lists cardTypes for which at least one card must
 * survive (so the bench can still run card-queries against those types).
 * The trim refuses to delete the last representative of any protected type.
 */
async function trimToTarget(
  cardRoot: string,
  targetCount: number,
  currentCount: number,
  protectedCardTypes: Set<string>,
): Promise<void> {
  if (currentCount <= targetCount) return;

  // Walk all card directories with depth and cardType.
  const cards: { path: string; depth: number; cardType: string }[] = [];
  async function walk(dir: string, depth: number): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    const isCard = entries.some((e) => e.name === 'index.json' && e.isFile());
    if (isCard) {
      let cardType = '';
      try {
        const idx = await readFile(join(dir, 'index.json'), 'utf-8');
        const obj = JSON.parse(idx) as { cardType?: unknown };
        if (typeof obj.cardType === 'string') cardType = obj.cardType;
      } catch {
        // ignore — card with malformed index.json gets cardType=''
      }
      cards.push({ path: dir, depth, cardType });
    }
    for (const e of entries) {
      if (e.isDirectory()) await walk(join(dir, e.name), depth + 1);
    }
  }
  for (const e of await readdir(cardRoot, { withFileTypes: true })) {
    if (e.isDirectory()) await walk(join(cardRoot, e.name), 0);
  }

  // Per-type counts for the protection check.
  const typeCount = new Map<string, number>();
  for (const c of cards) {
    typeCount.set(c.cardType, (typeCount.get(c.cardType) ?? 0) + 1);
  }

  // Sort by depth descending — deepest first. Tie-break by path so the
  // deletion order is deterministic across machines.
  cards.sort(
    (a, b) => b.depth - a.depth || a.path.localeCompare(b.path),
  );

  const deleted = new Set<string>();
  let remaining = currentCount;
  for (const c of cards) {
    if (remaining <= targetCount) break;
    // Skip if any descendant is still alive — only delete genuine leaves.
    const cContainer = join(c.path, 'c');
    let hasLiveChild = false;
    try {
      const subs = await readdir(cContainer);
      for (const sub of subs) {
        const subPath = join(cContainer, sub);
        if (!deleted.has(subPath)) {
          hasLiveChild = true;
          break;
        }
      }
    } catch {
      // No `c/` dir — definitely a leaf.
    }
    if (hasLiveChild) continue;
    // Refuse to delete the last representative of a protected cardType.
    if (
      protectedCardTypes.has(c.cardType) &&
      (typeCount.get(c.cardType) ?? 0) <= 1
    ) {
      continue;
    }
    await rm(c.path, { recursive: true, force: true });
    deleted.add(c.path);
    typeCount.set(c.cardType, (typeCount.get(c.cardType) ?? 0) - 1);
    remaining--;
  }
}

export async function fastScaleProject(
  projectPath: string,
  targetCount: number,
  templateName: string,
  protectedCardTypes: Set<string> = new Set(),
): Promise<string> {
  // 1. Copy project to temp directory.
  const tmpDir = await mkdtemp(join(tmpdir(), 'cyberismo-bench-fast-'));
  try {
    await cp(projectPath, tmpDir, { recursive: true });

    const commands = await CommandManager.getInstance(tmpDir);
    const initialCount = commands.project.cards().length;
    if (initialCount >= targetCount) {
      // Trim path: delete leaf cards (recursively the deepest first) until
      // the project has at most `targetCount` cards. This lets benchmarks
      // measure the regime-1 overhead floor at very small N (e.g. 10, 50)
      // even when the project's natural minimum exceeds the target.
      const cardRoot = join(tmpDir, 'cardRoot');
      await trimToTarget(cardRoot, targetCount, initialCount, protectedCardTypes);
      // Refresh the calculation engine so the addon's program store no
      // longer references the deleted cards.
      commands.project.cardsCache.clear();
      await commands.project.cardsCache.populateFromPath(cardRoot);
      await commands.project.calculationEngine.generate();
      const trimmedCount = commands.project.cards().length;
      console.error(
        `Trimmed to ${trimmedCount} cards (target: ${targetCount}, scratch: ${tmpDir})`,
      );
      return tmpDir;
    }

    // 2. Seed: pay the createCard cost ONCE.
    const seedCards = await commands.createCmd.createCard(templateName);
    const cardsPerInstance = seedCards.length;
    if (cardsPerInstance === 0) {
      throw new Error(
        `Template '${templateName}' produces 0 cards — cannot scale`,
      );
    }

    // 2b. If the seeded project already exceeds target (e.g. target=10 but
    // the template produces a 41-card instance), trim leaves to reach target.
    const postSeedCount = commands.project.cards().length;
    if (postSeedCount > targetCount) {
      const cardRoot = join(tmpDir, 'cardRoot');
      await trimToTarget(cardRoot, targetCount, postSeedCount, protectedCardTypes);
      commands.project.cardsCache.clear();
      await commands.project.cardsCache.populateFromPath(cardRoot);
      await commands.project.calculationEngine.generate();
      const trimmedCount = commands.project.cards().length;
      console.error(
        `Trimmed seed to ${trimmedCount} cards (target: ${targetCount})`,
      );
      return tmpDir;
    }

    // 3. Identify top-level seed cards (parent === ROOT/'root') and the full
    //    set of seed keys (top + nested).
    const seedKeys = new Set(seedCards.map((c) => c.key));
    const seedTopLevelKeys = seedCards
      .filter((c) => !c.parent || c.parent === 'root')
      .map((c) => c.key);
    if (seedTopLevelKeys.length === 0) {
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

    console.error(
      `[fast] Scaled to ${currentCount} cards (scratch: ${tmpDir})`,
    );
    // If replication overshot the target (cardsPerInstance > 1, target not a
    // multiple of cardsPerInstance), trim leaves down to exact target so
    // benchmarks measure at the requested scale.
    if (currentCount > targetCount) {
      await trimToTarget(cardRoot, targetCount, currentCount, protectedCardTypes);
      console.error(`[fast] Trimmed overshoot to <= ${targetCount} cards`);
    }
    // We wrote files directly to disk, bypassing the card cache. The
    // CommandManager singleton is re-used by the caller (the second
    // getInstance(tmpDir) returns the SAME live instance), so we must refresh
    // the cache from disk now or the caller's `commands.project.cards()`
    // will only see the seed instance.
    commands.project.cardsCache.clear();
    await commands.project.cardsCache.populateFromPath(cardRoot);
    // Re-run the calculation engine setup over the now-fully-populated cache
    // so the Clingo program store has facts for every replicated card. Without
    // this, callers who later run `buildProgram` / `solve` would only see the
    // seed instance's facts, leaving the LP undersized.
    await commands.project.calculationEngine.generate();
    // Match the slow path's contract: do NOT dispose. Caller owns the lifetime.
    return tmpDir;
  } catch (err) {
    await rm(tmpDir, { recursive: true, force: true });
    throw err;
  }
}

/**
 * Cleans up a temporary scaled project directory
 */
export async function cleanupScaledProject(tmpDir: string): Promise<void> {
  await rm(tmpDir, { recursive: true, force: true });
}
