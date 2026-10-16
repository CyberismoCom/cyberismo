// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { expect, describe, it, beforeEach, afterEach } from 'vitest';

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { HubSetting, ModuleSetting } from '@cyberismo/model';

import { ProjectConfiguration } from '../../../src/state/checkout/project-settings.js';
import { SCHEMA_VERSION } from '@cyberismo/migrations';
import { readJsonFileSync } from '../../../src/shared/utils/json.js';

describe('project settings', () => {
  const baseDir = import.meta.dirname;
  const testDir = join(baseDir, 'tmp-project-settings-tests');

  // Helper function to create a test config file
  function createTestConfig(
    filename: string,
    overrides: {
      schemaVersion?: number;
      cardKeyPrefix?: string;
      name?: string;
      modules?: ModuleSetting[];
      hubs?: HubSetting[];
      category?: string;
      description?: string;
    } = {},
  ): string {
    const configPath = join(testDir, filename);
    const config = {
      schemaVersion: SCHEMA_VERSION,
      cardKeyPrefix: 'test',
      name: 'Test Project',
      description: undefined,
      category: undefined,
      modules: [],
      hubs: [],
      ...overrides,
    };
    writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    return configPath;
  }

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('should load valid configuration file', () => {
    const configPath = createTestConfig('test-config-load.json');
    const projectSettings = new ProjectConfiguration(configPath);

    expect(projectSettings).not.toBeUndefined();
    expect(projectSettings.cardKeyPrefix).toBe('test');
    expect(projectSettings.name).toBe('Test Project');
    expect(projectSettings.schemaVersion).toBe(SCHEMA_VERSION);
    expect(projectSettings.modules).to.deep.equal([]);
    expect(projectSettings.hubs).to.deep.equal([]);
    expect(projectSettings.category).toBe(undefined);
    expect(projectSettings.description).toBe('');
  });

  it('should load configuration with category and description', () => {
    const configPath = createTestConfig('test-config-with-category-desc.json', {
      category: 'Development',
      description: 'A test project with category and description',
    });
    const projectSettings = new ProjectConfiguration(configPath);

    expect(projectSettings.category).toBe('Development');
    expect(projectSettings.description).toBe(
      'A test project with category and description',
    );
  });

  it('should handle empty category and description', () => {
    const configPath = createTestConfig(
      'test-config-empty-category-desc.json',
      {
        category: '',
        description: '',
      },
    );
    const projectSettings = new ProjectConfiguration(configPath);

    expect(projectSettings.category).toBe('');
    expect(projectSettings.description).toBe('');
  });

  it('should not modify file when schema version is missing', () => {
    const configPath = createTestConfig('test-config-no-schema.json', {
      schemaVersion: undefined as unknown as number,
    });

    const config = new ProjectConfiguration(configPath);
    expect(config.schemaVersion).toBe(undefined);
    const savedConfig = readJsonFileSync(configPath);
    expect(savedConfig.schemaVersion).toBe(undefined);
  });

  it('should not modify file when schema version already exists', () => {
    const configPath = createTestConfig('test-config-with-schema.json');
    const initialContent = readJsonFileSync(configPath);
    new ProjectConfiguration(configPath);
    const finalContent = readJsonFileSync(configPath);
    expect(finalContent).to.deep.equal(initialContent);
  });

  it('should remove a module successfully', async () => {
    const configPath = createTestConfig('test-config-remove-module.json', {
      modules: [{ name: 'test-module', location: 'https://example.com' }],
    });
    const projectSettings = new ProjectConfiguration(configPath);
    expect(projectSettings.modules.length).toBe(1);

    await projectSettings.removeModule('test-module');
    expect(projectSettings.modules.length).toBe(0);

    const savedConfig = readJsonFileSync(configPath);
    expect(savedConfig.modules.length).toBe(0);
  });

  it('should reject removing non-existent module', async () => {
    const configPath = createTestConfig('test-config-remove-missing.json');
    const projectSettings = new ProjectConfiguration(configPath);

    await expect(projectSettings.removeModule('non-existent')).rejects.toThrow(
      "Module 'non-existent' is not imported",
    );
  });

  it('should reject removing module with empty name', async () => {
    const configPath = createTestConfig('test-config-remove-empty.json');
    const projectSettings = new ProjectConfiguration(configPath);

    await expect(projectSettings.removeModule('')).rejects.toThrow(
      'Name must be provided to remove module',
    );
  });

  it('should set valid card prefix', async () => {
    const configPath = createTestConfig('test-config-set-prefix.json', {
      cardKeyPrefix: 'old',
    });
    const projectSettings = new ProjectConfiguration(configPath);
    await projectSettings.setCardPrefix('newprefix');
    expect(projectSettings.cardKeyPrefix).toBe('newprefix');

    const savedConfig = readJsonFileSync(configPath);
    expect(savedConfig.cardKeyPrefix).toBe('newprefix');
  });

  it('should reject invalid card prefix', async () => {
    const configPath = createTestConfig('test-config-invalid-prefix.json', {
      cardKeyPrefix: 'valid',
    });
    const projectSettings = new ProjectConfiguration(configPath);
    await expect(projectSettings.setCardPrefix('UPPERCASE')).rejects.toThrow(
      'is not valid prefix',
    );
    await expect(projectSettings.setCardPrefix('has-hyphen')).rejects.toThrow(
      'is not valid prefix',
    );
    await expect(
      projectSettings.setCardPrefix('toolongprefix'),
    ).rejects.toThrow('is not valid prefix');
  });

  it('should report compatible when schema versions match', () => {
    const configPath = createTestConfig('test-config-schema-match.json');
    const projectSettings = new ProjectConfiguration(configPath);
    const result = projectSettings.checkSchemaVersion();
    expect(result.isCompatible).toBe(true);
    expect(result.message).toBe('');
  });

  it('should report incompatible when schema version is undefined', () => {
    const configPath = createTestConfig('test-config-schema-undefined.json', {
      schemaVersion: undefined as unknown as number,
    });
    const projectSettings = new ProjectConfiguration(configPath);
    const result = projectSettings.checkSchemaVersion();
    expect(result.isCompatible).toBe(false);
    expect(result.message).to.include("no 'schemaVersion'");
  });

  it('should report incompatible when project schema is older', () => {
    const configPath = createTestConfig('test-config-schema-old.json', {
      schemaVersion: SCHEMA_VERSION - 1,
    });
    const projectSettings = new ProjectConfiguration(configPath);
    const result = projectSettings.checkSchemaVersion();
    expect(result.isCompatible).toBe(false);
    expect(result.message).to.include("Run 'cyberismo migrate'");
  });

  it('should report incompatible when project schema is newer', () => {
    const configPath = createTestConfig('test-config-schema-new.json', {
      schemaVersion: SCHEMA_VERSION + 1,
    });
    const projectSettings = new ProjectConfiguration(configPath);
    const result = projectSettings.checkSchemaVersion();
    expect(result.isCompatible).toBe(false);
    expect(result.message).to.include('Upgrade cyberismo');
  });

  it('should reject saving with empty card prefix', async () => {
    const configPath = createTestConfig('test-config-empty-prefix.json', {
      cardKeyPrefix: 'valid',
    });
    const projectSettings = new ProjectConfiguration(configPath);
    projectSettings.cardKeyPrefix = '';
    await expect(projectSettings.save()).rejects.toThrow('wrong configuration');
  });

  it('upsertModule keeps a same-location declaration under a different name', async () => {
    // A prefix is a module's identity, so two declarations sharing a source
    // are two modules. Dropping the older one would delete an installation
    // the project still has; `module update` names the fix instead.
    const configPath = createTestConfig('test-config-upsert-rename.json', {
      modules: [
        {
          name: 'oldname',
          location: 'https://example.com/mod.git',
          version: '^1.0.0',
        },
        { name: 'other', location: 'https://example.com/other.git' },
      ],
    });
    const projectSettings = new ProjectConfiguration(configPath);

    await projectSettings.upsertModule({
      name: 'newname',
      location: 'https://example.com/mod.git',
      version: '^2.0.0',
    });

    expect(projectSettings.modules.map((m) => m.name).sort()).toEqual([
      'newname',
      'oldname',
      'other',
    ]);
    const savedConfig = readJsonFileSync(configPath) as {
      modules: ModuleSetting[];
    };
    expect(savedConfig.modules.map((m) => m.name).sort()).toEqual([
      'newname',
      'oldname',
      'other',
    ]);
  });

  it('should persist all configuration changes', async () => {
    const configPath = createTestConfig('test-config-persist.json');
    const projectSettings = new ProjectConfiguration(configPath);
    await projectSettings.upsertModule({
      name: 'module1',
      location: 'https://example.com',
    });
    await projectSettings.addHub('https://hub.example.com');
    projectSettings.category = 'Infrastructure';
    projectSettings.description = 'Infrastructure management project';
    await projectSettings.save();
    const savedConfig = readJsonFileSync(configPath);
    expect(savedConfig.modules.length).toBe(1);
    expect(savedConfig.hubs.length).toBe(1);
    expect(savedConfig.schemaVersion).toBe(SCHEMA_VERSION);
    expect(savedConfig.category).toBe('Infrastructure');
    expect(savedConfig.description).toBe('Infrastructure management project');
  });
});
