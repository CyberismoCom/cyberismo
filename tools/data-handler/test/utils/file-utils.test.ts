import { expect, afterAll, describe, it, beforeAll } from 'vitest';

import { rmSync } from 'node:fs';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { join, sep } from 'node:path';

import {
  copyDir,
  deleteDir,
  deleteFile,
  getFilesSync,
  pathExists,
  resolveTilde,
  stripExtension,
} from '../../src/utils/file-utils.js';

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
