import { expect } from 'chai';

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, sep } from 'node:path';
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

  before(() => {
    mkdirSync(testDir, { recursive: true });
  });

  after(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('should load valid configuration file', () => {
    const configPath = createTestConfig('test-config-load.json');
    const projectSettings = new ProjectConfiguration(configPath, false);

    expect(projectSettings).to.not.equal(undefined);
    expect(projectSettings.cardKeyPrefix).to.equal('test');
    expect(projectSettings.name).to.equal('Test Project');
    expect(projectSettings.schemaVersion).to.equal(SCHEMA_VERSION);
    expect(projectSettings.modules).to.deep.equal([]);
    expect(projectSettings.hubs).to.deep.equal([]);
    expect(projectSettings.category).to.equal(undefined);
    expect(projectSettings.description).to.equal('');
  });

  it('should load configuration with category and description', () => {
    const configPath = createTestConfig('test-config-with-category-desc.json', {
      category: 'Development',
      description: 'A test project with category and description',
    });
    const projectSettings = new ProjectConfiguration(configPath, false);

    expect(projectSettings.category).to.equal('Development');
    expect(projectSettings.description).to.equal(
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
    const projectSettings = new ProjectConfiguration(configPath, false);

    expect(projectSettings.category).to.equal('');
    expect(projectSettings.description).to.equal('');
  });

  // Test disabled for now to avoid getting the schemaVersion to test files.
  it('should auto-add schema version when missing', () => {
    const configPath = createTestConfig('test-config-no-schema.json', {
      schemaVersion: undefined as unknown as number,
    });

    const config = new ProjectConfiguration(configPath, true);
    expect(config.schemaVersion).to.equal(SCHEMA_VERSION);
    const savedConfig = readJsonFileSync(configPath);
    expect(savedConfig.schemaVersion).to.equal(SCHEMA_VERSION);
  });

  it('should not modify file when schema version already exists', () => {
    const configPath = createTestConfig('test-config-with-schema.json');
    const initialContent = readJsonFileSync(configPath);
    new ProjectConfiguration(configPath, false);
    const finalContent = readJsonFileSync(configPath);
    expect(finalContent).to.deep.equal(initialContent);
  });

  it('should add a module successfully', async () => {
    const configPath = createTestConfig('test-config-add-module.json');
    const projectSettings = new ProjectConfiguration(configPath, false);
    await projectSettings.addModule({
      name: 'test-module',
      location: 'https://example.com/module',
    });

    expect(projectSettings.modules.length).to.equal(1);
    expect(projectSettings.modules[0].name).to.equal('test-module');
    const savedConfig = readJsonFileSync(configPath);
    expect(savedConfig.modules.length).to.equal(1);
  });

  it('should normalize file paths when adding modules', async () => {
    const configPath = createTestConfig('test-config-module-path.json');
    const projectSettings = new ProjectConfiguration(configPath, false);
    await projectSettings.addModule({
      name: 'test-module',
      location: `file:${['relative', 'path'].join(sep)}`,
    });

    expect(projectSettings.modules[0].location).to.include('file:');
    expect(projectSettings.modules[0].location).to.not.equal(
      `file:${['relative', 'path'].join(sep)}`,
    );
  });

  it('should reject adding duplicate module', async () => {
    const configPath = createTestConfig('test-config-duplicate-module.json', {
      modules: [{ name: 'existing-module', location: 'https://example.com' }],
    });
    const projectSettings = new ProjectConfiguration(configPath, false);

    await expect(
      projectSettings.addModule({
        name: 'existing-module',
        location: 'https://example.com',
      }),
    ).to.be.rejectedWith("Module 'existing-module' already imported");
  });

  it('should remove a module successfully', async () => {
    const configPath = createTestConfig('test-config-remove-module.json', {
      modules: [{ name: 'test-module', location: 'https://example.com' }],
    });
    const projectSettings = new ProjectConfiguration(configPath, false);
    expect(projectSettings.modules.length).to.equal(1);

    await projectSettings.removeModule('test-module');
    expect(projectSettings.modules.length).to.equal(0);

    const savedConfig = readJsonFileSync(configPath);
    expect(savedConfig.modules.length).to.equal(0);
  });

  it('should reject removing non-existent module', async () => {
    const configPath = createTestConfig('test-config-remove-missing.json');
    const projectSettings = new ProjectConfiguration(configPath, false);

    await expect(
      projectSettings.removeModule('non-existent'),
    ).to.be.rejectedWith("Module 'non-existent' is not imported");
  });

  it('should reject removing module with empty name', async () => {
    const configPath = createTestConfig('test-config-remove-empty.json');
    const projectSettings = new ProjectConfiguration(configPath, false);

    await expect(projectSettings.removeModule('')).to.be.rejectedWith(
      'Name must be provided to remove module',
    );
  });

  it('should add a hub with valid URL', async () => {
    const configPath = createTestConfig('test-config-add-hub.json');
    const projectSettings = new ProjectConfiguration(configPath, false);
    await projectSettings.addHub('https://example.com/hub');

    expect(projectSettings.hubs.length).to.equal(1);
    expect(projectSettings.hubs[0].location).to.equal(
      'https://example.com/hub',
    );

    const savedConfig = readJsonFileSync(configPath);
    expect(savedConfig.hubs.length).to.equal(1);
  });

  it('should trim whitespace from hub URL', async () => {
    const configPath = createTestConfig('test-config-hub-trim.json');
    const projectSettings = new ProjectConfiguration(configPath, false);
    await projectSettings.addHub('  https://example.com/hub  ');

    expect(projectSettings.hubs[0].location).to.equal(
      'https://example.com/hub',
    );
  });

  it('should reject empty hub URL', async () => {
    const configPath = createTestConfig('test-config-hub-empty.json');
    const projectSettings = new ProjectConfiguration(configPath, false);

    await expect(projectSettings.addHub('')).to.be.rejectedWith(
      'Cannot add empty hub to the project',
    );
    await expect(projectSettings.addHub('   ')).to.be.rejectedWith(
      'Cannot add empty hub to the project',
    );
  });

  it('should reject duplicate hub', async () => {
    const configPath = createTestConfig('test-config-hub-duplicate.json', {
      hubs: [{ location: 'https://example.com/hub' }],
    });
    const projectSettings = new ProjectConfiguration(configPath, false);

    await expect(
      projectSettings.addHub('https://example.com/hub'),
    ).to.be.rejectedWith(
      "Hub 'https://example.com/hub' already exists as a hub for the project",
    );
  });

  it('should reject invalid hub URL', async () => {
    const configPath = createTestConfig('test-config-hub-invalid.json');
    const projectSettings = new ProjectConfiguration(configPath, false);

    await expect(projectSettings.addHub('not-a-valid-url')).to.be.rejectedWith(
      'Invalid hub URL',
    );
  });

  it('should reject non-HTTP/HTTPS protocols', async () => {
    const configPath = createTestConfig('test-config-hub-protocol.json');
    const projectSettings = new ProjectConfiguration(configPath, false);

    await expect(
      projectSettings.addHub('ftp://example.com/hub'),
    ).to.be.rejectedWith('Invalid URL protocol');
  });

  it('should remove a hub successfully', async () => {
    const configPath = createTestConfig('test-config-remove-hub.json', {
      hubs: [{ location: 'https://example.com/hub' }],
    });
    const projectSettings = new ProjectConfiguration(configPath, false);
    expect(projectSettings.hubs.length).to.equal(1);

    await projectSettings.removeHub('https://example.com/hub');
    expect(projectSettings.hubs.length).to.equal(0);

    const savedConfig = readJsonFileSync(configPath);
    expect(savedConfig.hubs.length).to.equal(0);
  });

  it('should reject removing non-existent hub', async () => {
    const configPath = createTestConfig('test-config-remove-missing-hub.json');
    const projectSettings = new ProjectConfiguration(configPath, false);

    await expect(
      projectSettings.removeHub('https://example.com/hub'),
    ).to.be.rejectedWith(
      "Hub 'https://example.com/hub' not part of the project",
    );
  });

  it('should set valid card prefix', async () => {
    const configPath = createTestConfig('test-config-set-prefix.json', {
      cardKeyPrefix: 'old',
    });
    const projectSettings = new ProjectConfiguration(configPath, false);
    await projectSettings.setCardPrefix('newprefix');
    expect(projectSettings.cardKeyPrefix).to.equal('newprefix');

    const savedConfig = readJsonFileSync(configPath);
    expect(savedConfig.cardKeyPrefix).to.equal('newprefix');
  });

  it('should reject invalid card prefix', async () => {
    const configPath = createTestConfig('test-config-invalid-prefix.json', {
      cardKeyPrefix: 'valid',
    });
    const projectSettings = new ProjectConfiguration(configPath, false);
    await expect(projectSettings.setCardPrefix('UPPERCASE')).to.be.rejectedWith(
      'is not valid prefix',
    );
    await expect(
      projectSettings.setCardPrefix('has-hyphen'),
    ).to.be.rejectedWith('is not valid prefix');
    await expect(
      projectSettings.setCardPrefix('toolongprefix'),
    ).to.be.rejectedWith('is not valid prefix');
  });

  it('should report compatible when schema versions match', () => {
    const configPath = createTestConfig('test-config-schema-match.json');
    const projectSettings = new ProjectConfiguration(configPath, false);
    const result = projectSettings.checkSchemaVersion();
    expect(result.isCompatible).to.equal(true);
    expect(result.message).to.equal('');
  });

  it('should report compatible when schema version is undefined', () => {
    const configPath = createTestConfig('test-config-schema-undefined.json', {
      schemaVersion: undefined as unknown as number,
    });
    const projectSettings = new ProjectConfiguration(configPath, false);
    const result = projectSettings.checkSchemaVersion();
    expect(result.isCompatible).to.equal(true);
  });

  it('should report incompatible when project schema is older', () => {
    const configPath = createTestConfig('test-config-schema-old.json', {
      schemaVersion: SCHEMA_VERSION - 1,
    });
    const projectSettings = new ProjectConfiguration(configPath, false);
    const result = projectSettings.checkSchemaVersion();
    expect(result.isCompatible).to.equal(false);
    expect(result.message).to.include('older');
    expect(result.message).to.include('migration');
  });

  it('should report incompatible when project schema is newer', () => {
    const configPath = createTestConfig('test-config-schema-new.json', {
      schemaVersion: SCHEMA_VERSION + 1,
    });
    const projectSettings = new ProjectConfiguration(configPath, false);
    const result = projectSettings.checkSchemaVersion();
    expect(result.isCompatible).to.equal(false);
    expect(result.message).to.include('newer');
    expect(result.message).to.include('update the application');
  });

  it('should reject saving with empty card prefix', async () => {
    const configPath = createTestConfig('test-config-empty-prefix.json', {
      cardKeyPrefix: 'valid',
    });
    const projectSettings = new ProjectConfiguration(configPath, false);
    projectSettings.cardKeyPrefix = '';
    await expect(projectSettings.save()).to.be.rejectedWith(
      'wrong configuration',
    );
  });

  it('should persist all configuration changes', async () => {
    const configPath = createTestConfig('test-config-persist.json');
    const projectSettings = new ProjectConfiguration(configPath, false);
    await projectSettings.addModule({
      name: 'module1',
      location: 'https://example.com',
    });
    await projectSettings.addHub('https://hub.example.com');
    projectSettings.category = 'Infrastructure';
    projectSettings.description = 'Infrastructure management project';
    await projectSettings.save();
    const savedConfig = readJsonFileSync(configPath);
    expect(savedConfig.modules.length).to.equal(1);
    expect(savedConfig.hubs.length).to.equal(1);
    expect(savedConfig.schemaVersion).to.equal(SCHEMA_VERSION);
    expect(savedConfig.category).to.equal('Infrastructure');
    expect(savedConfig.description).to.equal(
      'Infrastructure management project',
    );
  });
});
