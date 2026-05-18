import { expect, describe, it, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { scanForProjects } from '../src/project-scanner.js';

describe('scanForProjects', () => {
  const baseDir = import.meta.dirname;
  const testDir = join(baseDir, 'tmp-project-scanner-tests');

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

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('detects a direct project directory', async () => {
    createProject(testDir, 'proj', 'TST', 'Test Project');
    const results = await scanForProjects(join(testDir, 'proj'));
    expect(results).to.have.length(1);
    expect(results[0].prefix).to.equal('TST');
    expect(results[0].name).to.equal('Test Project');
    expect(results[0].path).to.equal(resolve(testDir, 'proj'));
  });

  it('scans collection directory for projects', async () => {
    createProject(testDir, 'alpha', 'AAA', 'Alpha');
    createProject(testDir, 'beta', 'BBB', 'Beta');
    const results = await scanForProjects(testDir);
    expect(results).to.have.length(2);
    const prefixes = results.map((r) => r.prefix).sort();
    expect(prefixes).to.deep.equal(['AAA', 'BBB']);
  });

  it('returns empty array for empty collection directory', async () => {
    const results = await scanForProjects(testDir);
    expect(results).to.deep.equal([]);
  });

  it('skips non-directory entries', async () => {
    createProject(testDir, 'proj', 'TST', 'Test');
    writeFileSync(join(testDir, 'readme.txt'), 'not a project');
    const results = await scanForProjects(testDir);
    expect(results).to.have.length(1);
    expect(results[0].prefix).to.equal('TST');
  });

  it('skips directories without project structure', async () => {
    mkdirSync(join(testDir, 'not-a-project'), { recursive: true });
    createProject(testDir, 'real', 'REAL', 'Real Project');
    const results = await scanForProjects(testDir);
    expect(results).to.have.length(1);
    expect(results[0].prefix).to.equal('REAL');
  });

  it('skips projects with malformed cardsConfig.json', async () => {
    createProject(testDir, 'good', 'GOOD', 'Good');
    // Create a project directory structure with invalid config
    const badDir = join(testDir, 'bad');
    mkdirSync(join(badDir, '.cards', 'local'), { recursive: true });
    mkdirSync(join(badDir, 'cardRoot'), { recursive: true });
    writeFileSync(
      join(badDir, '.cards', 'local', 'cardsConfig.json'),
      JSON.stringify({ invalid: true }),
    );
    const results = await scanForProjects(testDir);
    expect(results).to.have.length(1);
    expect(results[0].prefix).to.equal('GOOD');
  });

  it('skips duplicate prefixes and keeps the first', async () => {
    createProject(testDir, 'aaa-first', 'DUP', 'First');
    createProject(testDir, 'zzz-second', 'DUP', 'Second');
    const results = await scanForProjects(testDir);
    expect(results).to.have.length(1);
    expect(results[0].prefix).to.equal('DUP');
  });

  it('throws for non-existent path', async () => {
    await expect(
      scanForProjects(join(testDir, 'does-not-exist')),
    ).rejects.toThrow('does not exist or is not a directory');
  });

  it('finds projects nested one level inside a non-project subdirectory', async () => {
    const group = join(testDir, 'group');
    mkdirSync(group, { recursive: true });
    createProject(group, 'nested', 'NST', 'Nested Project');
    const results = await scanForProjects(testDir);
    expect(results).to.have.length(1);
    expect(results[0].prefix).to.equal('NST');
    expect(results[0].path).to.equal(resolve(group, 'nested'));
  });

  it('finds projects at both level 1 and level 2', async () => {
    createProject(testDir, 'top-proj', 'TOP', 'Top');
    const group = join(testDir, 'group');
    mkdirSync(group, { recursive: true });
    createProject(group, 'deep-proj', 'DEEP', 'Deep');
    const results = await scanForProjects(testDir);
    expect(results).to.have.length(2);
    const prefixes = results.map((r) => r.prefix).sort();
    expect(prefixes).to.deep.equal(['DEEP', 'TOP']);
  });

  it('does not scan deeper than 2 levels', async () => {
    const level1 = join(testDir, 'a');
    const level2 = join(level1, 'b');
    mkdirSync(level2, { recursive: true });
    createProject(level2, 'too-deep', 'NOPE', 'Too Deep');
    const results = await scanForProjects(testDir);
    expect(results).to.deep.equal([]);
  });

  it('does not recurse into project directories', async () => {
    // A project with a nested project inside should only find the outer one
    const outer = createProject(testDir, 'outer', 'OUT', 'Outer');
    createProject(outer, 'inner', 'INN', 'Inner');
    const results = await scanForProjects(testDir);
    expect(results).to.have.length(1);
    expect(results[0].prefix).to.equal('OUT');
  });

  it('deduplicates across depths', async () => {
    createProject(testDir, 'first', 'DUP', 'First');
    const group = join(testDir, 'group');
    mkdirSync(group, { recursive: true });
    createProject(group, 'second', 'DUP', 'Second');
    const results = await scanForProjects(testDir);
    expect(results).to.have.length(1);
    expect(results[0].prefix).to.equal('DUP');
  });
});
