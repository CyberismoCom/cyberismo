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

type Json = Record<string, unknown>;

/** Result of a three-way merge of one card's metadata. */
export type MetadataMergeResult =
  { merged: Json; conflicts: [] } | { merged?: undefined; conflicts: string[] };

const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

// Links are a set: one survives unless either side removed it.
function mergeLinks(base: unknown, ours: unknown, theirs: unknown): unknown[] {
  const key = (link: unknown) => JSON.stringify(link);
  const asList = (value: unknown) => (Array.isArray(value) ? value : []);
  const baseKeys = new Set(asList(base).map(key));
  const oursKeys = new Set(asList(ours).map(key));
  const theirsKeys = new Set(asList(theirs).map(key));
  const kept = (link: unknown) => {
    const k = key(link);
    const inBase = baseKeys.has(k);
    return inBase ? oursKeys.has(k) && theirsKeys.has(k) : true;
  };
  const result = new Map<string, unknown>();
  for (const link of [...asList(ours), ...asList(theirs)]) {
    if (kept(link)) {
      result.set(key(link), link);
    }
  }
  return [...result.values()];
}

/**
 * Three-way merge of a card's metadata ('index.json'), field by field.
 * A field changed on one side only takes that side; changed the same way on
 * both, either. 'lastUpdated' takes the later time, 'rank' ours (collisions
 * are re-ranked afterwards) and 'links' merge as a set. A field changed
 * differently on both sides is a conflict.
 * @param base Common ancestor's metadata.
 * @param ours Metadata on the branch being merged into.
 * @param theirs Metadata on the branch being merged.
 * @returns the merged metadata, or the names of the conflicting fields.
 */
export function mergeCardMetadata(
  base: Json,
  ours: Json,
  theirs: Json,
): MetadataMergeResult {
  const merged: Json = {};
  const conflicts: string[] = [];
  const fields = new Set([
    ...Object.keys(ours),
    ...Object.keys(theirs),
    ...Object.keys(base),
  ]);
  for (const field of fields) {
    const [b, o, t] = [base[field], ours[field], theirs[field]];
    let value: unknown;
    if (field === 'links') {
      value = mergeLinks(b, o, t);
    } else if (field === 'lastUpdated') {
      value = String(o ?? '') > String(t ?? '') ? o : t;
    } else if (same(o, t) || same(t, b)) {
      value = o;
    } else if (same(o, b)) {
      value = t;
    } else if (field === 'rank') {
      value = o;
    } else {
      conflicts.push(field);
      continue;
    }
    if (value !== undefined) {
      merged[field] = value;
    }
  }
  return conflicts.length > 0 ? { conflicts } : { merged, conflicts: [] };
}

/**
 * Union merge of an append-only JSON-lines log: ours, then the entries only
 * theirs has, in their order.
 */
export function mergeAppendOnlyLog(ours: string, theirs: string): string {
  const lines = (text: string) => text.split('\n').filter((line) => line);
  const oursLines = lines(ours);
  const seen = new Set(oursLines);
  const added = lines(theirs).filter((line) => !seen.has(line));
  return [...oursLines, ...added].map((line) => `${line}\n`).join('');
}
