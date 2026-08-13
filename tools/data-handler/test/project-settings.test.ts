import { expect, describe, it, beforeEach, afterEach } from 'vitest';

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  HubSetting,
  ModuleSetting,
} from '../src/interfaces/project-interfaces.js';

import { ProjectConfiguration } from '../src/project-settings.js';
import { SCHEMA_VERSION } from '@cyberismo/assets';
import { readJsonFileSync } from '../src/utils/json.js';

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

  // Locations are stored as a directory URL: without the trailing slash,
  // resolving moduleList.json against them would drop the last segment.
  it.each([
    ['a plain URL', 'https://example.com/hub', 'https://example.com/hub/'],
    [
      'a URL that already ends in a slash',
      'https://example.com/hub/',
      'https://example.com/hub/',
    ],
    [
      'surrounding whitespace',
      '  https://example.com/hub  ',
      'https://example.com/hub/',
    ],
    [
      'a URL naming the file',
      'https://example.com/hub/moduleList.json',
      'https://example.com/hub/',
    ],
    [
      'repeated trailing slashes',
      'https://example.com/hub///',
      'https://example.com/hub/',
    ],
    [
      'a slash after the file',
      'https://example.com/hub/moduleList.json/',
      'https://example.com/hub/',
    ],
    // Only a whole segment names the module list; this one is a directory.
    [
      'a segment merely ending in the file name',
      'https://example.com/hub/foo-moduleList.json',
      'https://example.com/hub/foo-moduleList.json/',
    ],
  ])(
    'should store a hub given as %s canonically',
    async (name, input, expected) => {
      const configPath = createTestConfig(
        `test-config-add-hub-${name.replace(/\W/g, '-')}.json`,
      );
      const projectSettings = new ProjectConfiguration(configPath);
      await projectSettings.addHub(input);

      expect(projectSettings.hubs.length).toBe(1);
      expect(projectSettings.hubs[0].location).toBe(expected);

      const savedConfig = readJsonFileSync(configPath);
      expect(savedConfig.hubs.length).toBe(1);
    },
  );

  it('should reject duplicate hub that differs only by trailing slash', async () => {
    const configPath = createTestConfig(
      'test-config-hub-slash-duplicate.json',
      {
        hubs: [{ location: 'https://example.com/hub/' }],
      },
    );
    const projectSettings = new ProjectConfiguration(configPath);

    await expect(
      projectSettings.addHub('https://example.com/hub'),
    ).rejects.toThrow('already exists as a hub for the project');
    await expect(
      projectSettings.addHub('https://example.com/hub/moduleList.json'),
    ).rejects.toThrow('already exists as a hub for the project');
  });

  it('should reject empty hub URL', async () => {
    const configPath = createTestConfig('test-config-hub-empty.json');
    const projectSettings = new ProjectConfiguration(configPath);

    await expect(projectSettings.addHub('')).rejects.toThrow(
      'Cannot add empty hub to the project',
    );
    await expect(projectSettings.addHub('   ')).rejects.toThrow(
      'Cannot add empty hub to the project',
    );
  });

  it('should reject duplicate hub', async () => {
    const configPath = createTestConfig('test-config-hub-duplicate.json', {
      hubs: [{ location: 'https://example.com/hub' }],
    });
    const projectSettings = new ProjectConfiguration(configPath);

    await expect(
      projectSettings.addHub('https://example.com/hub'),
    ).rejects.toThrow(
      "Hub 'https://example.com/hub/' already exists as a hub for the project",
    );
  });

  it.each([
    ['a bare scheme', 'https://'],
    ['a bare http scheme', 'http://'],
    ['a string with no scheme', 'not-a-url'],
    ['a path only', '/hub/'],
  ])('should reject %s as a hub URL', async (name, input) => {
    const configPath = createTestConfig(
      `test-config-hub-invalid-${name.replace(/\W/g, '-')}.json`,
    );
    const projectSettings = new ProjectConfiguration(configPath);

    await expect(projectSettings.addHub(input)).rejects.toThrow(
      `Invalid hub URL '${input}'`,
    );
    expect(projectSettings.hubs).toEqual([]);
  });

  it('should reject non-HTTP/HTTPS protocols', async () => {
    const configPath = createTestConfig('test-config-hub-protocol.json');
    const projectSettings = new ProjectConfiguration(configPath);

    await expect(
      projectSettings.addHub('ftp://example.com/hub'),
    ).rejects.toThrow('Invalid URL protocol');
  });

  it('should remove a hub successfully', async () => {
    const configPath = createTestConfig('test-config-remove-hub.json', {
      hubs: [{ location: 'https://example.com/hub' }],
    });
    const projectSettings = new ProjectConfiguration(configPath);
    expect(projectSettings.hubs.length).toBe(1);

    await projectSettings.removeHub('https://example.com/hub');
    expect(projectSettings.hubs.length).toBe(0);

    const savedConfig = readJsonFileSync(configPath);
    expect(savedConfig.hubs.length).toBe(0);
  });

  it('should reject removing non-existent hub', async () => {
    const configPath = createTestConfig('test-config-remove-missing-hub.json');
    const projectSettings = new ProjectConfiguration(configPath);

    await expect(
      projectSettings.removeHub('https://example.com/hub'),
    ).rejects.toThrow("Hub 'https://example.com/hub' not part of the project");
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

  it('should set and persist category', async () => {
    const configPath = createTestConfig('test-config-set-category.json');
    const projectSettings = new ProjectConfiguration(configPath);
    await projectSettings.setCategory('Security');
    expect(projectSettings.category).toBe('Security');

    const savedConfig = readJsonFileSync(configPath);
    expect(savedConfig.category).toBe('Security');
  });

  it('should set and persist description', async () => {
    const configPath = createTestConfig('test-config-set-description.json');
    const projectSettings = new ProjectConfiguration(configPath);
    await projectSettings.setDescription('A detailed project description');
    expect(projectSettings.description).toBe('A detailed project description');

    const savedConfig = readJsonFileSync(configPath);
    expect(savedConfig.description).toBe('A detailed project description');
  });

  it('should clear category and description with empty string', async () => {
    const configPath = createTestConfig(
      'test-config-clear-category-desc.json',
      {
        category: 'Development',
        description: 'Some description',
      },
    );
    const projectSettings = new ProjectConfiguration(configPath);
    await projectSettings.setCategory('');
    await projectSettings.setDescription('');
    expect(projectSettings.category).toBe('');
    expect(projectSettings.description).toBe('');

    const savedConfig = readJsonFileSync(configPath);
    expect(savedConfig.category).toBe('');
    expect(savedConfig.description).toBe('');
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

  it('upsertModule drops a same-location declaration under a different name', async () => {
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
      'other',
    ]);
    const savedConfig = readJsonFileSync(configPath) as {
      modules: ModuleSetting[];
    };
    expect(savedConfig.modules.map((m) => m.name).sort()).toEqual([
      'newname',
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
