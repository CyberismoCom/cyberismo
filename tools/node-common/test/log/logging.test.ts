// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { afterEach, expect, test } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  configureLogging,
  getLogger,
  projectLogFile,
} from '../../src/log/index.js';

const sink = () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lines: any[] = [];
  return { lines, stream: { write: (s: string) => lines.push(JSON.parse(s)) } };
};

afterEach(() => configureLogging([]));

test('a logger obtained before configuration logs after it', () => {
  const logger = getLogger({ module: 'early' });
  logger.info('dropped');
  const { lines, stream } = sink();
  configureLogging([{ stream }]);
  logger.info('kept');
  expect(lines).toMatchObject([{ module: 'early', msg: 'kept', level: 30 }]);
});

test('each destination filters by its own level', () => {
  const all = sink();
  const warn = sink();
  configureLogging([
    { stream: all.stream },
    { stream: warn.stream, level: 'warn' },
  ]);
  const logger = getLogger();
  logger.debug('d');
  logger.warn('w');
  expect(all.lines.map((l) => l.msg)).toEqual(['d', 'w']);
  expect(warn.lines.map((l) => l.msg)).toEqual(['w']);
});

test('reconfiguring replaces the destinations', () => {
  const first = sink();
  const second = sink();
  const logger = getLogger({ module: 'm' });
  configureLogging([{ stream: first.stream }]);
  configureLogging([{ stream: second.stream }]);
  logger.info('x');
  expect(first.lines).toEqual([]);
  expect(second.lines).toHaveLength(1);
});

test('a file destination is readable right after the call and ignores itself', () => {
  const dir = mkdtempSync(join(tmpdir(), 'log-'));
  const file = projectLogFile(dir, new Date(2026, 10, 10));
  expect(file).toBe(join(dir, '.logs', 'cyberismo-2026-11-10.log'));
  configureLogging([{ file }]);
  getLogger().info('on disk');
  expect(readFileSync(file, 'utf8')).toContain('"msg":"on disk"');
  expect(readFileSync(join(dir, '.logs', '.gitignore'), 'utf8')).toBe('*\n');
});

test('an unusable file destination is dropped, the others still log', () => {
  const blocker = join(mkdtempSync(join(tmpdir(), 'log-')), 'file');
  writeFileSync(blocker, '');
  const { lines, stream } = sink();
  expect(() =>
    configureLogging([{ file: join(blocker, '.logs', 'x.log') }, { stream }]),
  ).not.toThrow();
  getLogger().info('still');
  expect(lines).toHaveLength(1);
});
