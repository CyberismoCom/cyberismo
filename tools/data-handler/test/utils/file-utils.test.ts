// testing
import { expect } from 'chai';
import { after, describe, it } from 'mocha';

// node
import { rmSync } from 'node:fs';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// ismo
import {
  copyDir,
  deleteDir,
  deleteFile,
  getFilesSync,
  pathExists,
  resolveTilde,
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
    after(async () => {
      rmSync(destination, { recursive: true, force: true });
    });
    await mkdir(destination, { recursive: true });
    await copyDir('test/test-data/valid/minimal', destination);
    try {
      await access(destination);
      expect(true);
    } catch (error) {
      if (error instanceof Error) {
        expect(false);
      }
    }
  });
  it('copyDir with hierarchy (success)', async () => {
    const destination = join(testDir, 'some/hierarchy/that/is/rather/deep');
    after(async () => {
      rmSync(destination, { recursive: true, force: true });
    });
    await copyDir('test/test-data/valid/minimal/', destination);
    try {
      await access(destination);
      expect(true);
    } catch (error) {
      if (error instanceof Error) {
        expect(false);
      }
    }
  });
  it('deleteDir (success)', async () => {
    const targetDir = join(testDir, 'this-temp');
    await mkdir(targetDir, { recursive: true });
    await deleteDir(targetDir);
    try {
      await access(targetDir);
      expect(false);
    } catch (error) {
      if (error instanceof Error) {
        expect(true);
      }
    }
  });
  it('deleteFile (success)', async () => {
    const target = 'testfile.txt';

    before(() => {
      rmSync(target);
    });

    await writeFile(target, 'data');
    const success = await deleteFile(target);
    expect(success).to.equal(true);
    try {
      await access(target);
      expect(false);
    } catch (error) {
      if (error instanceof Error) {
        expect(true);
      }
    }
  });
  it('deleteFile - file missing', async () => {
    const target = '';
    const success = await deleteFile(target);
    expect(success).to.equal(false);
  });
  it('getFilesSync (success)', async () => {
    const files = getFilesSync('test/test-data/valid/minimal');
    expect(files.length).to.be.greaterThan(0);
  });
  it('pathExists (success)', async () => {
    const path = '/';
    expect(pathExists(path)).to.equal(true);
  });
  it('pathExists - not found', async () => {
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
});
