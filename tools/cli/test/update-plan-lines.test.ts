import { describe, expect, it } from 'vitest';

import type { UpdatePlan } from '@cyberismo/data-handler';
import { renderUpdatePlan } from '../src/update-plan-lines.js';

const plan = (over: Partial<UpdatePlan> = {}): UpdatePlan => ({
  ok: true,
  changes: [],
  removed: [],
  conflicts: [],
  rangeWrites: [],
  roots: [],
  ...over,
});

const root = (over: Partial<UpdatePlan['roots'][number]>) => ({
  module: 'base',
  installed: '1.0.0',
  range: '^1.0.0',
  latest: '1.0.0',
  heldBack: false,
  versionSource: 'git' as const,
  ...over,
});

describe('renderUpdatePlan', () => {
  it('lists moves aligned, flags breaking, shows removals, range writes and the hint', () => {
    const { lines, failed } = renderUpdatePlan(
      plan({
        changes: [
          { module: 'base', from: '1.0.0', to: '1.3.0', breaking: false },
          { module: 'extension', from: '0.3.0', to: '0.4.0', breaking: true },
          { module: 'util', from: null, to: '1.0.0', breaking: false },
          { module: 'loc', from: null, to: null, breaking: false },
        ],
        removed: ['old'],
        rangeWrites: [{ module: 'base', range: '^1.3.0' }],
      }),
    );
    const out = lines.join('\n');
    expect(failed).toBe(false);
    expect(lines).toContain('  base         1.0.0  →  1.3.0');
    expect(lines).toContain('  extension    0.3.0  →  0.4.0  (breaking)');
    expect(lines).toContain('  util         (new)  →  1.0.0');
    expect(lines).toContain('  loc          (unversioned)  refetched');
    expect(out).toMatch(/Would remove:\n {2}old/);
    expect(out).toMatch(/Would record version ranges:\n {2}base {4}\^1\.3\.0/);
    expect(out).toContain('only checked when applying');
    expect(lines.at(-1)).toBe(
      'Nothing was changed. To apply, run the same command without --dry-run.',
    );
  });

  it('a blocked plan fails, lists conflicts and offers no apply hint', () => {
    const { lines, failed } = renderUpdatePlan(
      plan({
        ok: false,
        conflicts: [{ module: 'core', reason: 'no version satisfies' }],
      }),
    );
    expect(failed).toBe(true);
    expect(lines).toContain('  core: no version satisfies');
    expect(lines.join('\n')).not.toContain('To apply');
  });

  it('claims up to date only when nothing moves and nothing is held back', () => {
    expect(renderUpdatePlan(plan({ roots: [root({})] })).lines).toEqual([
      'All modules are up to date.',
    ]);
    const out = renderUpdatePlan(
      plan({ roots: [root({ heldBack: true, latest: '2.0.0' })] }),
    ).lines.join('\n');
    expect(out).toContain('base    2.0.0 available (range ^1.0.0)');
    expect(out).not.toContain('up to date');
    expect(out).not.toContain('To apply');
  });
});
