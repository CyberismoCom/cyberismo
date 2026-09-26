import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CommandManager } from '../src/command-manager.js';
import { copyDir } from '../src/utils/file-utils.js';

describe('Project.reload', () => {
  let dir: string;
  let projectPath: string;
  let commands: CommandManager;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'project-reload-test-'));
    projectPath = join(dir, 'decision-records');
    await copyDir('test/test-data/valid/decision-records', projectPath);
    commands = new CommandManager(projectPath);
    await commands.initialize();
  });

  afterEach(async () => {
    commands.project.dispose();
    await rm(dir, { recursive: true, force: true });
  });

  it('picks up files changed underneath the project', async () => {
    const card5 = join(projectPath, 'cardRoot', 'decision_5');
    await writeFile(join(card5, 'index.adoc'), 'Merged content');
    const metadataPath = join(card5, 'index.json');
    const metadata = JSON.parse(await readFile(metadataPath, 'utf-8'));
    await writeFile(
      metadataPath,
      JSON.stringify({ ...metadata, title: 'Merged title' }),
    );
    await rm(join(card5, 'c', 'decision_6'), { recursive: true });
    const configPath = join(projectPath, '.cards', 'local', 'cardsConfig.json');
    const config = JSON.parse(await readFile(configPath, 'utf-8'));
    await writeFile(
      configPath,
      JSON.stringify({ ...config, name: 'Merged name' }),
    );

    const project = commands.project;
    expect(project.findCard('decision_5').content).not.toBe('Merged content');

    await project.lock.write(() => project.reload());

    const card = project.findCard('decision_5');
    expect(card.content).toBe('Merged content');
    expect(card.metadata?.title).toBe('Merged title');
    expect(() => project.findCard('decision_6')).toThrow();
    expect(project.configuration.name).toBe('Merged name');
  });
});
