// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { expect, afterAll, describe, it, beforeAll } from 'vitest';

import { existsSync, rmSync } from 'node:fs';
import { access, mkdir, symlink, writeFile } from 'node:fs/promises';
import { join, sep } from 'node:path';

import {
  copyDir,
  deleteDir,
  deleteFile,
  getFilesSync,
  pathExists,
  readFileNoFollow,
  readFileNoFollowSync,
  symlinkBelow,
  resolveTilde,
  stripExtension,
} from '../../../src/shared/utils/file-utils.js';

describe('file utils', () => {
  const baseDir = import.meta.dirname;
  const testDir = join(baseDir, 'tmp-file-utils-tests');

  beforeAll(async () => {
    await mkdir(testDir, { recursive: true });
    await copyDir('test/test-data/', testDir);
  });

  afterAll(async () => {
    await deleteDir(testDir);
  });
  it('copyDir (success)', async () => {
    const destination = join(testDir, 'this-temp');
    afterAll(() => {
      rmSync(destination, { recursive: true, force: true });
    });
    await mkdir(destination, { recursive: true });
    await copyDir('test/test-data/valid/minimal', destination);
    await expect(access(destination)).resolves.toBeUndefined();
  });
  it('copyDir with hierarchy (success)', async () => {
    const destination = join(testDir, 'some/hierarchy/that/is/rather/deep');
    afterAll(() => {
      rmSync(destination, { recursive: true, force: true });
    });
    await copyDir('test/test-data/valid/minimal/', destination);
    await expect(access(destination)).resolves.toBeUndefined();
  });
  it.skipIf(process.platform === 'win32')(
    'copyDir rejects a symlinked file or folder',
    async () => {
      const outside = join(testDir, 'outside');
      await mkdir(outside, { recursive: true });
      await writeFile(join(outside, 'secret.txt'), 'secret');
      for (const [name, target] of [
        ['file-link', join(outside, 'secret.txt')],
        ['dir-link', outside],
      ]) {
        const source = join(testDir, `source-${name}`);
        const destination = join(testDir, `dest-${name}`);
        await mkdir(source, { recursive: true });
        await symlink(target, join(source, name));

        await expect(copyDir(source, destination)).rejects.toThrow(
          `Cannot copy symbolic link '${join(source, name)}'`,
        );
        expect(existsSync(join(destination, name))).toBe(false);
      }
    },
  );
  it.skipIf(process.platform === 'win32')(
    'symlinkBelow refuses a symlink or a path outside the base',
    async () => {
      const real = join(testDir, 'real-project');
      const alias = join(testDir, 'alias-project');
      await mkdir(join(real, 'cardRoot'), { recursive: true });
      await mkdir(join(real, 'moved'), { recursive: true });
      await symlink(real, alias);
      await symlink(join(real, 'moved'), join(real, 'linked'));
      const outside = join(testDir, 'elsewhere');

      // Clean, whether spelled through the base's alias or its real name.
      expect(symlinkBelow(alias, join(alias, 'cardRoot'))).toBeUndefined();
      expect(symlinkBelow(alias, join(real, 'cardRoot'))).toBeUndefined();
      expect(symlinkBelow(real, join(real, 'missing'))).toBeUndefined();
      // Refused: a symlink below the base, however spelled, or outside it.
      expect(symlinkBelow(alias, join(real, 'linked'))).toBe(
        join(real, 'linked'),
      );
      expect(symlinkBelow(alias, join(alias, 'linked', 'c'))).toBe(
        join(real, 'linked'),
      );
      expect(symlinkBelow(real, outside)).toBe(outside);
    },
  );
  it.skipIf(process.platform === 'win32')(
    'readFileNoFollow refuses a symlink',
    async () => {
      const real = join(testDir, 'real.txt');
      const link = join(testDir, 'link.txt');
      await writeFile(real, 'secret');
      await symlink(real, link);

      expect((await readFileNoFollow(real)).toString()).toBe('secret');
      await expect(readFileNoFollow(link)).rejects.toThrow('ELOOP');
      expect(() => readFileNoFollowSync(link)).toThrow('ELOOP');
    },
  );
  it('deleteDir (success)', async () => {
    const targetDir = join(testDir, 'this-temp');
    await mkdir(targetDir, { recursive: true });
    await deleteDir(targetDir);
    await expect(access(targetDir)).rejects.toThrow(
      `ENOENT: no such file or directory,`,
    );
  });
  it('deleteFile (success)', async () => {
    const target = 'testfile.txt';

    beforeAll(() => {
      rmSync(target);
    });

    await writeFile(target, 'data');
    const success = await deleteFile(target);
    expect(success).toBe(true);
    await expect(access(target)).rejects.toThrow();
  });
  it('deleteFile - file missing', async () => {
    const target = '';
    const success = await deleteFile(target);
    expect(success).toBe(false);
  });
  it('getFilesSync (success)', () => {
    const files = getFilesSync('test/test-data/valid/minimal');
    expect(files.length).toBeGreaterThan(0);
  });
  it('getFilesSync - wrong path', () => {
    const files = getFilesSync('test/test-data/valid/non-existing');
    expect(files.length).toBe(0);
  });
  it('pathExists (success)', () => {
    const path = '/';
    expect(pathExists(path)).toBe(true);
  });
  it('pathExists - not found', () => {
    const path = '/i-do-not-exist';
    const retVal = pathExists(path);
    expect(retVal).toBe(false);
  });
  it('resolveTilde - no tilde in path', () => {
    const path = '/tmp/test';
    const retVal = resolveTilde(path);
    expect(retVal).toBe(path);
  });
  it('resolveTilde - tilde in filename', () => {
    const path = '~tmp/test';
    const retVal = resolveTilde(path);
    expect(retVal).toBe(path);
  });
  it('resolveTilde - tilde in path', () => {
    const path = '~/tmp/test';
    const retVal = resolveTilde(path);
    expect(retVal).not.toBe(path);
  });
  it('resolveTilde - only tilde', () => {
    const path = '~';
    const retVal = resolveTilde(path);
    expect(retVal).not.toBe(path);
  });
  it('stripExtension, - various filenames', () => {
    const filenamesWithExtensions: Map<string, string> = new Map([
      ['myTemplate.json', 'myTemplate'],
      ['myFile.withStrangeExtension', 'myFile'],
      ['myFile.with.multiple.dots', 'myFile.with.multiple'],
      ['myFile.with.trailing.dot.', 'myFile.with.trailing.dot'],
      [`templates${sep}myTemplate.json`, `templates${sep}myTemplate`],
      [
        `~${sep}templates${sep}myTemplate.json`,
        `~${sep}templates${sep}myTemplate`,
      ],
      [
        `.cards${sep}local${sep}templates${sep}myTemplate.json`,
        `.cards${sep}local${sep}templates${sep}myTemplate`,
      ],
      [`.cards${sep}local${sep}.sec.ret`, `.cards${sep}local${sep}.sec`],
    ]);
    const filenamesWithoutExtensions = [
      'myFile',
      `.cards${sep}local${sep}templates${sep}myTemplate`,
      `files${sep}.secretFile`,
      `.cards${sep}local${sep}.secret`,
      `..${sep}test`,
      `test${sep}.${sep}test`,
      '.',
      '..',
      `..${sep}..`,
    ];
    for (const filename of filenamesWithExtensions) {
      expect(stripExtension(filename[0])).toBe(filename[1]);
    }
    for (const filename of filenamesWithoutExtensions) {
      expect(stripExtension(filename)).toBe(filename);
    }
  });
});
