import { expect, afterAll, describe, it, beforeAll } from 'vitest';

import { rmSync } from 'node:fs';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { join, sep } from 'node:path';

import {
  copyDir,
  deleteDir,
  deleteFile,
  folderSize,
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

  describe('folderSize', () => {
    it('should calculate size of directory with files', async () => {
      const tempDir = join(testDir, 'folder-size-test');
      await mkdir(tempDir, { recursive: true });

      // Create some test files
      const file1Content = 'Hello World';
      const file2Content = 'This is a test file with more content';
      await writeFile(join(tempDir, 'file1.txt'), file1Content);
      await writeFile(join(tempDir, 'file2.txt'), file2Content);

      const size = await folderSize(tempDir);
      const expectedSize = file1Content.length + file2Content.length;

      expect(size).toBe(expectedSize);
    });

    it('should calculate size including subdirectories', async () => {
      const tempDir = join(testDir, 'folder-size-test-nested');
      const subDir = join(tempDir, 'subdir');
      await mkdir(subDir, { recursive: true });

      // Create files in root and subdirectory
      const rootFileContent = 'Root file';
      const subFileContent = 'Subdirectory file';
      await writeFile(join(tempDir, 'root.txt'), rootFileContent);
      await writeFile(join(subDir, 'sub.txt'), subFileContent);

      const size = await folderSize(tempDir);
      const expectedSize = rootFileContent.length + subFileContent.length;

      expect(size).toBe(expectedSize);
    });

    it('should return 0 for non-existent directory', async () => {
      const nonExistentDir = join(testDir, 'does-not-exist');
      const size = await folderSize(nonExistentDir);
      expect(size).toBe(0);
    });

    it('should return 0 for empty directory', async () => {
      const emptyDir = join(testDir, 'empty-dir');
      await mkdir(emptyDir, { recursive: true });

      const size = await folderSize(emptyDir);
      expect(size).toBe(0);
    });

    it('should handle deeply nested directory structure', async () => {
      const baseFolder = join(testDir, 'deep-structure');
      const deepPath = join(baseFolder, 'level1', 'level2', 'level3');
      await mkdir(deepPath, { recursive: true });

      // Create files at different levels
      const content1 = 'Level 1';
      const content2 = 'Level 2 content';
      const content3 = 'Level 3 deep content';
      await writeFile(join(baseFolder, 'level1', 'file1.txt'), content1);
      await writeFile(
        join(baseFolder, 'level1', 'level2', 'file2.txt'),
        content2,
      );
      await writeFile(join(deepPath, 'file3.txt'), content3);

      const size = await folderSize(baseFolder);
      const expectedSize = content1.length + content2.length + content3.length;

      expect(size).toBe(expectedSize);
    });
  });
});
