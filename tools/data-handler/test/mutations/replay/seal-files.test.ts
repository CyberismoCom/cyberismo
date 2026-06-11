import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  formatSealFileName,
  lastSealedVersion,
  listSealFiles,
  parseSealFileName,
} from '../../../src/mutations/replay/seal-files.js';

const tmpDir = join(import.meta.dirname, 'tmp-seal-files');

describe('seal file names', () => {
  it('parses migrationLog_<from>_<to>.jsonl', () => {
    expect(parseSealFileName('migrationLog_2.6.0_3.0.0.jsonl')).toEqual({
      from: '2.6.0',
      to: '3.0.0',
      fileName: 'migrationLog_2.6.0_3.0.0.jsonl',
    });
  });
  it('rejects the old single-version format', () => {
    expect(parseSealFileName('migrationLog_2.6.0.jsonl')).toBeUndefined();
  });
  it('rejects non-semver segments', () => {
    expect(parseSealFileName('migrationLog_abc_3.0.0.jsonl')).toBeUndefined();
  });
  it('rejects unrelated files', () => {
    expect(parseSealFileName('current')).toBeUndefined();
    expect(parseSealFileName('migrationLog.jsonl')).toBeUndefined();
  });
  it('formats round-trip', () => {
    expect(formatSealFileName('1.0.0', '1.1.0')).toBe(
      'migrationLog_1.0.0_1.1.0.jsonl',
    );
  });
});

describe('listSealFiles / lastSealedVersion', () => {
  beforeEach(async () => {
    await mkdir(tmpDir, { recursive: true });
  });
  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('lists new-format seals ascending, ignoring everything else', async () => {
    for (const f of [
      'migrationLog_2.0.0_2.6.0.jsonl',
      'migrationLog_0.0.0_2.0.0.jsonl',
      'migrationLog_1.5.0.jsonl', // old format: ignored
      'notes.txt',
    ]) {
      await writeFile(join(tmpDir, f), '');
    }
    const seals = await listSealFiles(tmpDir);
    expect(seals.map((s) => s.to)).toEqual(['2.0.0', '2.6.0']);
  });

  it('returns [] and 0.0.0 for a missing folder', async () => {
    const missing = join(tmpDir, 'nope');
    expect(await listSealFiles(missing)).toEqual([]);
    expect(await lastSealedVersion(missing)).toBe('0.0.0');
  });

  it('lastSealedVersion returns the highest sealed to', async () => {
    // listing must not validate chain linkage; the chain here is inconsistent
    // on purpose to keep that out of scope
    for (const f of [
      'migrationLog_0.0.0_1.0.0.jsonl',
      'migrationLog_1.0.0_1.10.0.jsonl',
      'migrationLog_1.10.0_1.9.0.jsonl',
    ]) {
      await writeFile(join(tmpDir, f), '');
    }
    // semver compare: 1.10.0 > 1.9.0 — guards against lexicographic sorting
    const seals = await listSealFiles(tmpDir);
    expect(seals.map((s) => s.to)).toEqual(['1.0.0', '1.9.0', '1.10.0']);
    expect(await lastSealedVersion(tmpDir)).toBe('1.10.0');
  });
});
