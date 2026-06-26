import { describe, it, expect } from 'vitest';
import {
  checkLinearity,
  computeChain,
} from '../../../src/mutations/replay/chain.js';
import type { SealFile } from '../../../src/mutations/replay/seal-files.js';

const seal = (from: string, to: string): SealFile => ({
  from,
  to,
  fileName: `migrationLog_${from}_${to}.jsonl`,
});

describe('checkLinearity', () => {
  it('passes when installed seals are a subset of target seals', () => {
    const installed = [seal('0.0.0', '2.0.0'), seal('2.0.0', '2.6.0')];
    const target = [...installed, seal('2.6.0', '3.0.0')];
    expect(checkLinearity(installed, target)).toEqual([]);
  });

  it('reports seals the target does not know about (diverged branch)', () => {
    // Consumer sealed 2.6→2.7; target 3.0 was cut from 2.6 and has 2.6→3.0.
    const installed = [seal('2.0.0', '2.6.0'), seal('2.6.0', '2.7.0')];
    const target = [seal('2.0.0', '2.6.0'), seal('2.6.0', '3.0.0')];
    expect(checkLinearity(installed, target)).toEqual([
      'migrationLog_2.6.0_2.7.0.jsonl',
    ]);
  });

  it('passes trivially with no installed seals (pre-replay era)', () => {
    expect(checkLinearity([], [seal('0.0.0', '1.0.0')])).toEqual([]);
  });

  it('reports every missing seal, not just the first', () => {
    const installed = [
      seal('1.0.0', '1.1.0'),
      seal('1.1.0', '1.2.0'),
      seal('1.2.0', '1.3.0'),
    ];
    const target = [seal('1.0.0', '1.1.0')];
    expect(checkLinearity(installed, target)).toEqual([
      'migrationLog_1.1.0_1.2.0.jsonl',
      'migrationLog_1.2.0_1.3.0.jsonl',
    ]);
  });

  it('passes with an empty target when nothing is installed', () => {
    expect(checkLinearity([], [])).toEqual([]);
  });
});

describe('computeChain', () => {
  // Dense, contiguous seal set: every minor/major seals, patches don't.
  const target = [
    seal('0.0.0', '1.0.0'),
    seal('1.0.0', '1.1.0'),
    seal('1.1.0', '2.0.0'),
    seal('2.0.0', '2.1.0'),
  ];

  it('selects seals with to in (from, to], ascending', () => {
    expect(computeChain(target, '1.0.0', '2.0.0').map((s) => s.to)).toEqual([
      '1.1.0',
      '2.0.0',
    ]);
  });

  it('selects the full chain from 0.0.0', () => {
    expect(computeChain(target, '0.0.0', '2.1.0').map((s) => s.to)).toEqual([
      '1.0.0',
      '1.1.0',
      '2.0.0',
      '2.1.0',
    ]);
  });

  it('excludes seals whose to equals from (already applied)', () => {
    expect(computeChain(target, '1.1.0', '2.0.0').map((s) => s.to)).toEqual([
      '2.0.0',
    ]);
  });

  it('sorts unordered input ascending before linking', () => {
    const shuffled = [target[3], target[1], target[0], target[2]];
    expect(computeChain(shuffled, '0.0.0', '2.1.0').map((s) => s.to)).toEqual([
      '1.0.0',
      '1.1.0',
      '2.0.0',
      '2.1.0',
    ]);
  });

  it('installed at a patch: first seal may start below from', () => {
    // 1.0.3 never sealed; it sits inside the 1.0.0→1.1.0 seal range.
    expect(computeChain(target, '1.0.3', '1.1.0').map((s) => s.to)).toEqual([
      '1.1.0',
    ]);
  });

  it('patch target: chain reaches the enclosing minor', () => {
    // Updating to patch 2.1.4 is covered by reaching its minor 2.1.0.
    expect(computeChain(target, '2.0.0', '2.1.4').map((s) => s.to)).toEqual([
      '2.1.0',
    ]);
  });

  it('empty chain for a patch jump within one minor', () => {
    expect(computeChain(target, '2.0.0', '2.0.4')).toEqual([]);
  });

  it('no-op update yields an empty chain', () => {
    expect(computeChain(target, '2.1.0', '2.1.0')).toEqual([]);
  });

  it('throws on a downgrade', () => {
    expect(() => computeChain(target, '2.1.0', '1.0.0')).toThrow(/downgrade/i);
  });

  it('throws on a patch downgrade within a minor', () => {
    expect(() => computeChain(target, '1.0.5', '1.0.2')).toThrow(/downgrade/i);
  });

  it('throws when an unsealed target crosses a minor boundary', () => {
    expect(() => computeChain([], '1.0.0', '2.0.0')).toThrow(/gap/i);
  });

  it('throws on a gap between seals', () => {
    const gappy = [seal('0.0.0', '1.0.0'), seal('1.1.0', '2.0.0')];
    expect(() => computeChain(gappy, '0.5.0', '2.0.0')).toThrow(/gap/i);
  });

  it('throws when the first seal starts above from', () => {
    expect(() =>
      computeChain([seal('1.1.0', '2.0.0')], '1.0.0', '2.0.0'),
    ).toThrow(/gap/i);
  });

  it('throws when the top seal is missing (chain stops below the target)', () => {
    const partial = [seal('0.0.0', '1.0.0'), seal('1.0.0', '1.1.0')];
    expect(() => computeChain(partial, '1.0.0', '2.0.0')).toThrow(/gap/i);
  });

  it('throws when an empty range crosses a minor boundary', () => {
    expect(() =>
      computeChain([seal('0.0.0', '1.0.0')], '1.0.0', '2.0.0'),
    ).toThrow(/gap/i);
  });
});
