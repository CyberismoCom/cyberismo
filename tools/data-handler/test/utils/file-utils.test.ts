// testing
import { expect } from 'chai';
import { after, describe, it } from 'mocha';

// node
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

const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-file-utils-tests');

before(async () => {
  await mkdir(testDir, { recursive: true });
  await copyDir('test/test-data/', testDir);
});

after(async () => {
  await deleteDir(testDir);
});

describe('file utils', () => {
  it('copyDir (success)', async () => {
    const destination = join(testDir, 'this-temp');
    after(() => {
      rmSync(destination, { recursive: true, force: true });
    });
    await mkdir(destination, { recursive: true });
    await copyDir('test/test-data/valid/minimal', destination);
    await expect(access(destination)).to.be.fulfilled;
  });
  it('copyDir with hierarchy (success)', async () => {
    const destination = join(testDir, 'some/hierarchy/that/is/rather/deep');
    after(() => {
      rmSync(destination, { recursive: true, force: true });
    });
    await copyDir('test/test-data/valid/minimal/', destination);
    await expect(access(destination)).to.be.fulfilled;
  });
  it('deleteDir (success)', async () => {
    const targetDir = join(testDir, 'this-temp');
    await mkdir(targetDir, { recursive: true });
    await deleteDir(targetDir);
    await expect(access(targetDir)).to.be.rejectedWith(
      `ENOENT: no such file or directory,`,
    );
  });
  it('deleteFile (success)', async () => {
    const target = 'testfile.txt';

    before(() => {
      rmSync(target);
    });

    await writeFile(target, 'data');
    const success = await deleteFile(target);
    expect(success).to.equal(true);
    await expect(access(target)).to.be.rejected;
  });
  it('deleteFile - file missing', async () => {
    const target = '';
    const success = await deleteFile(target);
    expect(success).to.equal(false);
  });
  it('getFilesSync (success)', () => {
    const files = getFilesSync('test/test-data/valid/minimal');
    expect(files.length).to.be.greaterThan(0);
  });
  it('getFilesSync - wrong path', () => {
    const files = getFilesSync('test/test-data/valid/non-existing');
    expect(files.length).to.equal(0);
  });
  it('pathExists (success)', () => {
    const path = '/';
    expect(pathExists(path)).to.equal(true);
  });
  it('pathExists - not found', () => {
    const path = '/i-do-not-exist';
    const retVal = pathExists(path);
    expect(retVal).to.equal(false);
  });
  it('resolveTilde - no tilde in path', () => {
    const path = '/tmp/test';
    const retVal = resolveTilde(path);
    expect(retVal).to.equal(path);
  });
  it('resolveTilde - tilde in filename', () => {
    const path = '~tmp/test';
    const retVal = resolveTilde(path);
    expect(retVal).to.equal(path);
  });
  it('resolveTilde - tilde in path', () => {
    const path = '~/tmp/test';
    const retVal = resolveTilde(path);
    expect(retVal).to.not.equal(path);
  });
  it('resolveTilde - only tilde', () => {
    const path = '~';
    const retVal = resolveTilde(path);
    expect(retVal).to.not.equal(path);
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
      expect(stripExtension(filename[0])).to.equal(filename[1]);
    }
    for (const filename of filenamesWithoutExtensions) {
      expect(stripExtension(filename)).to.equal(filename);
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

      expect(size).to.equal(expectedSize);
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

      expect(size).to.equal(expectedSize);
    });

    it('should return 0 for non-existent directory', async () => {
      const nonExistentDir = join(testDir, 'does-not-exist');
      const size = await folderSize(nonExistentDir);
      expect(size).to.equal(0);
    });

    it('should return 0 for empty directory', async () => {
      const emptyDir = join(testDir, 'empty-dir');
      await mkdir(emptyDir, { recursive: true });

      const size = await folderSize(emptyDir);
      expect(size).to.equal(0);
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

      expect(size).to.equal(expectedSize);
    });
  });
});
