// testing
import { expect } from 'chai';
import { after, describe, it } from 'mocha';

// node
import { rmSync } from 'node:fs';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  copyDir,
  deleteDir,
  deleteFile,
  getFilesSync,
  pathExists,
  resolveTilde,
  stripExtension,
} from '../../src/utils/file-utils.js';

const baseDir = dirname(fileURLToPath(import.meta.url));
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
});
