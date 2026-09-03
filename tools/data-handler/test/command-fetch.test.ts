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
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { Cmd, Commands } from '../src/command-handler.js';
import { CommandManager } from '../src/command-manager.js';
import { copyDir } from '../src/utils/file-utils.js';
import { Fetch, MODULE_LIST_FULL_PATH } from '../src/commands/fetch.js';
import { Show } from '../src/commands/show.js';
import { Project } from '../src/containers/project.js';

import type { HubSetting } from '../src/interfaces/project-interfaces.js';
import type * as Undici from 'undici';

// Hub requests go out through egressFetch, which uses undici's fetch rather
// than the global one, so the stub belongs here.
const undiciFetch = vi.hoisted(() => vi.fn());
vi.mock('undici', async (importOriginal) => {
  const actual = await importOriginal<typeof Undici>();
  return { ...actual, fetch: undiciFetch };
});

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

  describe('fetch hubs command', () => {
    let manager: CommandManager;
    let originalHubs: HubSetting[];
    const fetchStub = undiciFetch;

    function hubResponse(displayName: string, moduleName: string) {
      return {
        ok: true,
        json: async () => ({
          description: `${displayName} description`,
          displayName,
          version: 1,
          modules: [
            {
              name: moduleName,
              location: `https://github.com/test/${moduleName}.git`,
            },
          ],
        }),
        headers: new Headers({ 'content-type': 'application/json' }),
      };
    }

    beforeEach(async () => {
      manager = await CommandManager.getInstance(decisionRecordsPath);
      originalHubs = manager.project.configuration.hubs;
      fetchStub.mockReset();
    });

    afterEach(() => {
      manager.project.configuration.hubs = originalHubs;
      vi.restoreAllMocks();
    });

    it('fetches the hubs even when the cached module list is up to date', async () => {
      manager.project.configuration.hubs = [
        { location: 'https://test.com/hub-command' },
      ];
      const fetchModuleListStub = vi
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .spyOn(Fetch.prototype as any, 'fetchModuleList')
        .mockResolvedValue(false);
      fetchStub.mockResolvedValue(hubResponse('Test Hub', 'base'));

      const result = await commandHandler.command(Cmd.fetch, ['hubs'], options);

      expect(result.statusCode).toBe(200);
      expect(fetchModuleListStub).not.toHaveBeenCalled();
      expect(fetchStub).toHaveBeenCalledTimes(1);
    });

    it('fails when a hub cannot be read', async () => {
      manager.project.configuration.hubs = [
        { location: 'https://broken.test.com/hub' },
        { location: 'https://working.test.com/hub' },
      ];
      fetchStub
        .mockRejectedValueOnce(new Error('network down'))
        .mockResolvedValue(hubResponse('Working hub', 'base'));

      const result = await commandHandler.command(Cmd.fetch, ['hubs'], options);

      expect(result.statusCode).toBe(500);
      expect(result.message).toContain('https://broken.test.com/hub');
      expect(result.message).toContain('network down');
      expect(result.message).toContain(
        'Modules from the hubs that could be read were refreshed.',
      );
    });

    it('succeeds when every hub can be read', async () => {
      manager.project.configuration.hubs = [
        { location: 'https://test.com/hub1' },
        { location: 'https://test.com/hub2' },
      ];
      fetchStub
        .mockResolvedValueOnce(hubResponse('Test Hub 1', 'modulea'))
        .mockResolvedValueOnce(hubResponse('Test Hub 2', 'moduleb'));

      const result = await commandHandler.command(Cmd.fetch, ['hubs'], options);

      expect(result.statusCode).toBe(200);
      expect(result.message).toBeUndefined();
      expect(fetchStub).toHaveBeenCalledTimes(2);
    });
  });

  describe('hub versions', () => {
    const fetchStub = undiciFetch;
    let project: Project;
    let fetchCmd: Fetch;
    let fetchModuleListStub: ReturnType<typeof vi.spyOn>;

    beforeEach(async () => {
      project = new Project(decisionRecordsPath);
      await project.populateCaches();
      fetchCmd = new Fetch(project);
      fetchStub.mockReset();
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

    it('should fetch when force is set even if cache is up to date', async () => {
      const originalHubs = project.configuration.hubs;
      project.configuration.hubs = [{ location: 'https://test.com/hub1' }];

      // would return false; indicating fetch is not needed
      fetchModuleListStub = vi
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .spyOn(fetchCmd as any, 'fetchModuleList')
        .mockResolvedValue(false);

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

      await fetchCmd.fetchHubs(true);

      expect(fetchModuleListStub).not.toHaveBeenCalled();
      expect(fetchStub).toHaveBeenCalledTimes(1);
      project.configuration.hubs = originalHubs;
    });

    it('should write per-hub modules and metadata to the cache', async () => {
      const originalHubs = project.configuration.hubs;
      project.configuration.hubs = [{ location: 'https://test.com/hub1' }];

      fetchStub.mockResolvedValue({
        ok: true,
        json: async () => ({
          description: 'Test hub description',
          displayName: 'Test Hub',
          version: 3,
          modules: [
            {
              name: 'base',
              location: 'https://github.com/test/module-base.git',
            },
            {
              name: 'other',
              location: 'https://github.com/test/module-other.git',
            },
          ],
        }),
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      await fetchCmd.fetchHubs(true);

      const moduleList = JSON.parse(
        await readFile(join(decisionRecordsPath, MODULE_LIST_FULL_PATH), {
          encoding: 'utf-8',
        }),
      );
      expect(moduleList.modules).toHaveLength(2);
      expect(moduleList.hubs).toHaveLength(1);
      expect(moduleList.hubs[0].location).toBe('https://test.com/hub1');
      expect(moduleList.hubs[0].version).toBe(3);
      expect(moduleList.hubs[0].displayName).toBe('Test Hub');
      expect(moduleList.hubs[0].description).toBe('Test hub description');
      expect(moduleList.hubs[0].modules).toHaveLength(2);
      expect(moduleList.hubs[0].modules[0].name).toBe('base');
      project.configuration.hubs = originalHubs;
    });

    it('should fetch when cached hub data is in an outdated format', async () => {
      const originalHubs = project.configuration.hubs;
      project.configuration.hubs = [{ location: 'https://test.com/hub1' }];

      // Cache without per-hub modules, as written by older versions.
      const moduleListPath = join(decisionRecordsPath, MODULE_LIST_FULL_PATH);
      await mkdir(join(decisionRecordsPath, '.temp'), { recursive: true });
      await writeFile(
        moduleListPath,
        JSON.stringify({
          modules: [],
          hubs: [{ location: 'https://test.com/hub1', version: 1 }],
        }),
      );

      // Remote version matches the cached version; the outdated format
      // alone must trigger the fetch.
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

      const moduleList = JSON.parse(
        await readFile(moduleListPath, { encoding: 'utf-8' }),
      );
      expect(moduleList.hubs[0].modules).toHaveLength(1);
      project.configuration.hubs = originalHubs;
    });

    it('showHubDetails returns hubs with their cached modules', async () => {
      const originalHubs = project.configuration.hubs;
      project.configuration.hubs = [
        { location: 'https://test.com/hub-details' },
      ];

      fetchStub.mockResolvedValue({
        ok: true,
        json: async () => ({
          description: 'Test hub description',
          displayName: 'Test Hub',
          version: 1,
          modules: [
            {
              name: 'base',
              displayName: 'Base module',
              location: 'https://github.com/test/module-base.git',
            },
          ],
        }),
        headers: new Headers({ 'content-type': 'application/json' }),
      });
      await fetchCmd.fetchHubs(true);

      const showCmd = new Show(project);
      const hubs = await showCmd.showHubDetails();

      expect(hubs).toHaveLength(1);
      expect(hubs[0].location).toBe('https://test.com/hub-details');
      expect(hubs[0].displayName).toBe('Test Hub');
      expect(hubs[0].description).toBe('Test hub description');
      expect(hubs[0].modules).toHaveLength(1);
      expect(hubs[0].modules[0].name).toBe('base');
      expect(hubs[0].modules[0].displayName).toBe('Base module');
      project.configuration.hubs = originalHubs;
    });

    it('showHubDetails does not contact the hub', async () => {
      const originalHubs = project.configuration.hubs;
      project.configuration.hubs = [
        { location: 'https://unreachable.test.com/hub' },
      ];

      // Without cached data there is nothing to list the hub's modules from.
      rmSync(join(decisionRecordsPath, MODULE_LIST_FULL_PATH), {
        force: true,
      });
      fetchStub.mockRejectedValue(new Error('network down'));

      const showCmd = new Show(project);
      const hubs = await showCmd.showHubDetails();

      expect(hubs).toHaveLength(1);
      expect(hubs[0].location).toBe('https://unreachable.test.com/hub');
      expect(hubs[0].modules).toHaveLength(0);
      expect(fetchStub).not.toHaveBeenCalled();
      project.configuration.hubs = originalHubs;
    });

    // A location without a trailing slash used to resolve moduleList.json
    // against the parent directory, so only one of these three forms worked.
    it.each([
      ['with a trailing slash', 'https://test.com/hub/'],
      ['without a trailing slash', 'https://test.com/hub'],
      ['pointing at the file', 'https://test.com/hub/moduleList.json'],
    ])('reads a hub location %s', async (_name, location) => {
      const originalHubs = project.configuration.hubs;
      project.configuration.hubs = [{ location }];
      rmSync(join(decisionRecordsPath, MODULE_LIST_FULL_PATH), {
        force: true,
      });

      fetchStub.mockResolvedValue({
        ok: true,
        json: async () => ({
          description: 'Test hub description',
          displayName: 'Test Hub',
          version: 1,
          modules: [
            { name: 'base', location: 'https://github.com/test/base.git' },
          ],
        }),
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const failures = await fetchCmd.fetchHubs(true);

      expect(failures).toHaveLength(0);
      expect(fetchStub).toHaveBeenCalledWith(
        'https://test.com/hub/moduleList.json',
        expect.anything(),
      );
      project.configuration.hubs = originalHubs;
    });

    it('keeps fetching the other hubs when one cannot be read', async () => {
      const originalHubs = project.configuration.hubs;
      project.configuration.hubs = [
        { location: 'https://broken.test.com/hub' },
        { location: 'https://working.test.com/hub' },
      ];
      rmSync(join(decisionRecordsPath, MODULE_LIST_FULL_PATH), {
        force: true,
      });

      fetchStub
        .mockRejectedValueOnce(new Error('network down'))
        .mockResolvedValue({
          ok: true,
          json: async () => ({
            description: 'Working hub',
            displayName: 'Working hub',
            version: 1,
            modules: [
              { name: 'base', location: 'https://github.com/test/base.git' },
            ],
          }),
          headers: new Headers({ 'content-type': 'application/json' }),
        });

      const failures = await fetchCmd.fetchHubs(true);

      expect(failures).toHaveLength(1);
      expect(failures[0].location).toBe('https://broken.test.com/hub');

      const moduleList = JSON.parse(
        await readFile(join(decisionRecordsPath, MODULE_LIST_FULL_PATH), {
          encoding: 'utf-8',
        }),
      );
      // The reachable hub is cached and its modules stay importable.
      expect(moduleList.hubs).toHaveLength(1);
      expect(moduleList.hubs[0].location).toBe('https://working.test.com/hub');
      expect(
        moduleList.modules.map((mod: { name: string }) => mod.name),
      ).toEqual(['base']);

      project.configuration.hubs = originalHubs;
    });

    it('keeps cached modules of a hub when a later fetch of it fails', async () => {
      const originalHubs = project.configuration.hubs;
      project.configuration.hubs = [{ location: 'https://flaky.test.com/hub' }];

      fetchStub.mockResolvedValue({
        ok: true,
        json: async () => ({
          description: 'Flaky hub',
          displayName: 'Flaky hub',
          version: 1,
          modules: [
            { name: 'base', location: 'https://github.com/test/base.git' },
          ],
        }),
        headers: new Headers({ 'content-type': 'application/json' }),
      });
      await fetchCmd.fetchHubs(true);

      fetchStub.mockRejectedValue(new Error('network down'));
      const failures = await fetchCmd.fetchHubs(true);

      expect(failures).toHaveLength(1);
      const moduleList = JSON.parse(
        await readFile(join(decisionRecordsPath, MODULE_LIST_FULL_PATH), {
          encoding: 'utf-8',
        }),
      );
      // Degraded to stale, not to gone.
      expect(moduleList.hubs[0].modules).toHaveLength(1);
      expect(moduleList.modules).toHaveLength(1);

      project.configuration.hubs = originalHubs;
    });

    it('ensureModuleListExists fetches only when no cache is present', async () => {
      const originalHubs = project.configuration.hubs;
      project.configuration.hubs = [{ location: 'https://test.com/hub-once' }];

      fetchStub.mockResolvedValue({
        ok: true,
        json: async () => ({
          description: 'Test hub description',
          displayName: 'Test Hub',
          version: 1,
          modules: [
            { name: 'base', location: 'https://github.com/test/base.git' },
          ],
        }),
        headers: new Headers({ 'content-type': 'application/json' }),
      });
      rmSync(join(decisionRecordsPath, MODULE_LIST_FULL_PATH), {
        force: true,
      });

      await fetchCmd.ensureModuleListExists();
      expect(fetchStub).toHaveBeenCalledTimes(1);

      await fetchCmd.ensureModuleListExists();
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
