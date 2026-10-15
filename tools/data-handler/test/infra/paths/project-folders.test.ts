import { expect, describe, it, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { projectFolders } from '../../../src/infra/paths/project-folders.js';

describe('projectFolders', () => {
  const baseDir = import.meta.dirname;
  const testDir = join(baseDir, 'tmp-project-folders-tests');

  function createProject(
    parentDir: string,
    dirName: string,
    prefix: string,
    name: string,
  ): string {
    const projectDir = join(parentDir, dirName);
    const configDir = join(projectDir, '.cards', 'local');
    mkdirSync(configDir, { recursive: true });
    mkdirSync(join(projectDir, 'cardRoot'), { recursive: true });
    writeFileSync(
      join(configDir, 'cardsConfig.json'),
      JSON.stringify({ cardKeyPrefix: prefix, name }),
    );
    return projectDir;
  }

  // The folders' names, sorted.
  const names = (paths: string[]) => paths.map((p) => basename(p)).sort();

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('detects a direct project directory', async () => {
    createProject(testDir, 'proj', 'TST', 'Test Project');
    expect(await projectFolders(join(testDir, 'proj'))).to.deep.equal([
      resolve(testDir, 'proj'),
    ]);
  });

  it('scans collection directory for projects', async () => {
    createProject(testDir, 'alpha', 'AAA', 'Alpha');
    createProject(testDir, 'beta', 'BBB', 'Beta');
    expect(names(await projectFolders(testDir))).to.deep.equal([
      'alpha',
      'beta',
    ]);
  });

  it('returns empty array for empty collection directory', async () => {
    expect(await projectFolders(testDir)).to.deep.equal([]);
  });

  it('skips non-directory entries', async () => {
    createProject(testDir, 'proj', 'TST', 'Test');
    writeFileSync(join(testDir, 'readme.txt'), 'not a project');
    expect(names(await projectFolders(testDir))).to.deep.equal(['proj']);
  });

  it('skips directories without project structure', async () => {
    mkdirSync(join(testDir, 'not-a-project'), { recursive: true });
    createProject(testDir, 'real', 'REAL', 'Real Project');
    expect(names(await projectFolders(testDir))).to.deep.equal(['real']);
  });

  // The configuration is the directory's to read: it skips a malformed one.
  it('finds projects with malformed cardsConfig.json', async () => {
    createProject(testDir, 'good', 'GOOD', 'Good');
    const badDir = join(testDir, 'bad');
    mkdirSync(join(badDir, '.cards', 'local'), { recursive: true });
    mkdirSync(join(badDir, 'cardRoot'), { recursive: true });
    writeFileSync(
      join(badDir, '.cards', 'local', 'cardsConfig.json'),
      JSON.stringify({ invalid: true }),
    );
    expect(names(await projectFolders(testDir))).to.deep.equal(['bad', 'good']);
  });

  // The directory keeps the first of a prefix.
  it('finds every project of a duplicate prefix', async () => {
    createProject(testDir, 'aaa-first', 'DUP', 'First');
    createProject(testDir, 'zzz-second', 'DUP', 'Second');
    expect(names(await projectFolders(testDir))).to.deep.equal([
      'aaa-first',
      'zzz-second',
    ]);
  });

  it('throws for non-existent path', async () => {
    await expect(
      projectFolders(join(testDir, 'does-not-exist')),
    ).rejects.toThrow('does not exist or is not a directory');
  });

  it('finds projects nested one level inside a non-project subdirectory', async () => {
    const group = join(testDir, 'group');
    mkdirSync(group, { recursive: true });
    createProject(group, 'nested', 'NST', 'Nested Project');
    expect(await projectFolders(testDir)).to.deep.equal([
      resolve(group, 'nested'),
    ]);
  });

  it('finds projects at both level 1 and level 2', async () => {
    createProject(testDir, 'top-proj', 'TOP', 'Top');
    const group = join(testDir, 'group');
    mkdirSync(group, { recursive: true });
    createProject(group, 'deep-proj', 'DEEP', 'Deep');
    expect(names(await projectFolders(testDir))).to.deep.equal([
      'deep-proj',
      'top-proj',
    ]);
  });

  it('does not scan deeper than 2 levels', async () => {
    const level2 = join(testDir, 'a', 'b');
    mkdirSync(level2, { recursive: true });
    createProject(level2, 'too-deep', 'NOPE', 'Too Deep');
    expect(await projectFolders(testDir)).to.deep.equal([]);
  });

  it('does not recurse into project directories', async () => {
    const outer = createProject(testDir, 'outer', 'OUT', 'Outer');
    createProject(outer, 'inner', 'INN', 'Inner');
    expect(names(await projectFolders(testDir))).to.deep.equal(['outer']);
  });

  it('finds a project of the same prefix at another depth', async () => {
    createProject(testDir, 'first', 'DUP', 'First');
    const group = join(testDir, 'group');
    mkdirSync(group, { recursive: true });
    createProject(group, 'second', 'DUP', 'Second');
    expect(names(await projectFolders(testDir))).to.deep.equal([
      'first',
      'second',
    ]);
  });
});
