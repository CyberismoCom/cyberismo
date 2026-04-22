// testing
import {
  expect,
  it,
  describe,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  vi,
} from 'vitest';

import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { Cmd, Commands } from '../src/command-handler.js';
import { copyDir } from '../src/utils/file-utils.js';
import { Fetch } from '../src/commands/fetch.js';
import { Project } from '../src/containers/project.js';

const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-command-handler-fetch-tests');
const decisionRecordsPath = join(testDir, 'valid/decision-records');
const commandHandler: Commands = new Commands();
const options = { projectPath: decisionRecordsPath };

describe('fetch command', () => {
  beforeAll(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data', testDir);
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('fetch hubs (success)', async () => {
    const result = await commandHandler.command(Cmd.fetch, ['hubs'], options);
    expect(result.statusCode).toBe(200);
  });
  it('try to fetch incorrect type', async () => {
    const result = await commandHandler.command(
      Cmd.fetch,
      ['unknown'],
      options,
    );
    expect(result.statusCode).toBe(400);
  });

  describe('hub versions', () => {
    let fetchStub: ReturnType<typeof vi.spyOn>;
    let project: Project;
    let fetchCmd: Fetch;
    let fetchModuleListStub: ReturnType<typeof vi.spyOn>;

    beforeEach(async () => {
      project = new Project(decisionRecordsPath);
      await project.populateCaches();
      fetchCmd = new Fetch(project);
      fetchStub = vi.spyOn(global, 'fetch');
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should fetch when remote version is newer than local version', async () => {
      const originalHubs = project.configuration.hubs;
      project.configuration.hubs = [{ location: 'https://test.com/hub1' }];

      // return true; indicating fetch is needed
      fetchModuleListStub = vi
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .spyOn(fetchCmd as any, 'fetchModuleList')
        .mockResolvedValue(true);

      // Remote hub returns module list with version 2 (schema-compliant)
      fetchStub.mockResolvedValue({
        ok: true,
        json: async () => ({
          description: 'Test hub',
          displayName: 'Test Hub',
          version: 2,
          modules: [
            {
              name: 'base',
              location: 'https://github.com/test/module-base.git',
            },
            {
              name: 'newmodule',
              location: 'https://github.com/test/new-module.git',
            },
          ],
        }),
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      await fetchCmd.fetchHubs();

      expect(fetchModuleListStub).toHaveBeenCalledTimes(1);
      expect(fetchStub).toHaveBeenCalledTimes(1);
      project.configuration.hubs = originalHubs;
    });
    it('should skip fetch when local version matches remote version', async () => {
      // no fetch needed
      fetchModuleListStub = vi
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .spyOn(fetchCmd as any, 'fetchModuleList')
        .mockResolvedValue(false);

      await fetchCmd.fetchHubs();

      expect(fetchModuleListStub).toHaveBeenCalledTimes(1);
      expect(fetchStub).not.toHaveBeenCalled();
    });
    it('should fetch when local file does not exist', async () => {
      const originalHubs = project.configuration.hubs;
      project.configuration.hubs = [{ location: 'https://test.com/hub1' }];

      // file doesn't exist locally
      fetchModuleListStub = vi
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .spyOn(fetchCmd as any, 'fetchModuleList')
        .mockResolvedValue(true);

      // Remote hub response
      fetchStub.mockResolvedValue({
        ok: true,
        json: async () => ({
          description: 'Test hub',
          displayName: 'Test Hub',
          version: 1,
          modules: [
            {
              name: 'base',
              location: 'https://github.com/test/module-base.git',
            },
          ],
        }),
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      await fetchCmd.fetchHubs();

      expect(fetchModuleListStub).toHaveBeenCalledTimes(1);
      expect(fetchStub).toHaveBeenCalledTimes(1);
      project.configuration.hubs = originalHubs;
    });

    it('should fetch when any hub has a newer version (multiple hubs)', async () => {
      // one hub has newer version
      fetchModuleListStub = vi
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .spyOn(fetchCmd as any, 'fetchModuleList')
        .mockResolvedValue(true);

      // Actual fetches for both hubs
      fetchStub.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          description: 'Test hub 1',
          displayName: 'Test Hub 1',
          version: 1,
          modules: [{ name: 'modulea', location: 'https://git.com/m1.git' }],
        }),
        headers: new Headers({ 'content-type': 'application/json' }),
      } as Response);

      fetchStub.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          description: 'Test hub 2',
          displayName: 'Test Hub 2',
          version: 2,
          modules: [{ name: 'moduleb', location: 'https://git.com/m2.git' }],
        }),
        headers: new Headers({ 'content-type': 'application/json' }),
      } as Response);

      // Project with two hubs
      const originalHubs = project.configuration.hubs;
      project.configuration.hubs = [
        { location: 'https://test.com/hub1' },
        { location: 'https://test.com/hub2' },
      ];

      await fetchCmd.fetchHubs();

      expect(fetchModuleListStub).toHaveBeenCalledTimes(1);
      expect(fetchStub).toHaveBeenCalledTimes(2);

      project.configuration.hubs = originalHubs;
    });
  });
});
