// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { UpdatePlan } from '@cyberismo/model';

// Left-aligns module names within one block.
const pad = (names: string[]) => (n: string) =>
  n.padEnd(Math.max(...names.map((m) => m.length)));

/** Human-readable `module update --dry-run` output; `failed` when blocked. */
export function renderUpdatePlan(plan: UpdatePlan): {
  lines: string[];
  failed: boolean;
} {
  if (!plan.ok) {
    return {
      failed: true,
      lines: [
        'Cannot update:',
        ...plan.conflicts.map((c) => `  ${c.module}: ${c.reason}`),
        '',
        'Nothing was changed.',
      ],
    };
  }

  const heldBack = plan.roots.filter((r) => r.heldBack);
  const blocks: string[][] = [];
  if (plan.changes.length > 0) {
    const name = pad(plan.changes.map((c) => c.module));
    blocks.push([
      'Would update:',
      ...plan.changes.map((c) => {
        if (c.from === null && c.to === null) {
          return `  ${name(c.module)}    (unversioned)  refetched`;
        }
        const flag = c.breaking ? '  (breaking)' : '';
        return `  ${name(c.module)}    ${c.from ?? '(new)'}  →  ${c.to ?? '(unversioned)'}${flag}`;
      }),
    ]);
  }
  if (plan.removed.length > 0) {
    blocks.push(['Would remove:', ...plan.removed.map((m) => `  ${m}`)]);
  }
  if (plan.rangeWrites.length > 0) {
    const name = pad(plan.rangeWrites.map((w) => w.module));
    blocks.push([
      'Would record version ranges:',
      ...plan.rangeWrites.map((w) => `  ${name(w.module)}    ${w.range}`),
    ]);
  }
  const acts = blocks.length > 0;
  if (heldBack.length > 0) {
    const name = pad(heldBack.map((r) => r.module));
    blocks.push([
      'Held back by the declared range:',
      ...heldBack.map(
        (r) =>
          `  ${name(r.module)}    ${r.latest} available (range ${r.range})`,
      ),
    ]);
  }
  if (blocks.length === 0) blocks.push(['All modules are up to date.']);

  const lines = blocks.flatMap((b, i) => (i === 0 ? b : ['', ...b]));
  if (acts) {
    lines.push(
      '',
      'Migration and schema compatibility is only checked when applying; the update can still be refused.',
      'Nothing was changed. To apply, run the same command without --dry-run.',
    );
  }
  return { lines, failed: false };
}
