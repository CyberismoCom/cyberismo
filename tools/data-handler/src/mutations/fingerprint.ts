import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import type { MutationFingerprint, MutationInput } from './types.js';

/**
 * Deterministic hash over the proposed mutation plus the contents of every
 * file the cascade would touch.
 *
 * The file list comes from the handler's preview implementation; passing it
 * separately keeps computeFingerprint pure (no project / no cache access).
 */
export async function computeFingerprint(
  input: MutationInput,
  affectedFilePaths: string[],
): Promise<MutationFingerprint> {
  const hash = createHash('sha256');
  hash.update(canonicalJson(input));

  // Sort to make the digest independent of file enumeration order.
  const sorted = [...affectedFilePaths].sort();
  for (const path of sorted) {
    const contentDigest = createHash('sha256');
    contentDigest.update(await readFile(path));
    hash.update(path);
    hash.update(contentDigest.digest());
  }

  return { digest: hash.digest('hex') };
}

/** Canonical JSON: object keys sorted recursively, no whitespace. */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  const entries = Object.entries(value).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}
