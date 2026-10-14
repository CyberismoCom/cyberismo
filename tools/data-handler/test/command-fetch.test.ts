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
import { Workspace } from '../src/workspace/workspace.js';
import { copyDir } from '../src/utils/file-utils.js';
import { Fetch, MODULE_LIST_FULL_PATH } from '../src/commands/fetch.js';
import { Checkout } from '../src/containers/project.js';

import type { HubSetting } from '@cyberismo/model';
import type * as Undici from 'undici';
import { SYSTEM_ACTOR } from '../src/utils/tx-record.js';
import { openTestWorkspace } from './helpers/open-test-workspace.js';

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
// The dispatcher runs on the handle the tests set up.
let manager: Workspace;
const commandHandler: Commands = new Commands(async () => manager);
const options = { projectPath: decisionRecordsPath };

describe('fetch command', () => {
  beforeAll(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data', testDir);
    manager = await openTestWorkspace(decisionRecordsPath);
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
      manager = await openTestWorkspace(decisionRecordsPath);
      originalHubs = manager.checkout.configuration.hubs;
      fetchStub.mockReset();
    });

    afterEach(() => {
      manager.checkout.configuration.hubs = originalHubs;
      vi.restoreAllMocks();
    });

    it('fetches the hubs even when the cached module list is up to date', async () => {
      manager.checkout.configuration.hubs = [
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
      manager.checkout.configuration.hubs = [
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
      manager.checkout.configuration.hubs = [
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
    let checkout: Checkout;
    let fetchCmd: Workspace['modules'];
    let fetchModuleListStub: ReturnType<typeof vi.spyOn>;

    beforeEach(async () => {
      checkout = new Checkout(decisionRecordsPath);
      await checkout.populateCaches();
      fetchCmd = Workspace.over(checkout, SYSTEM_ACTOR).modules;
      fetchStub.mockReset();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should fetch when cached hub data is in an outdated format', async () => {
      const originalHubs = checkout.configuration.hubs;
      checkout.configuration.hubs = [{ location: 'https://test.com/hub1' }];

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
      checkout.configuration.hubs = originalHubs;
    });

    it('drops a hub that is removed while it is being fetched', async () => {
      const originalHubs = checkout.configuration.hubs;
      const kept = { location: 'https://kept.test.com/hub' };
      checkout.configuration.hubs = [
        kept,
        { location: 'https://removed.test.com/hub' },
      ];
      fetchStub.mockImplementation(async (url: string) => {
        if (url.includes('removed')) checkout.configuration.hubs = [kept];
        return {
          ok: true,
          json: async () => ({
            description: 'A hub',
            displayName: 'A hub',
            version: 1,
            modules: [
              { name: 'base', location: 'https://github.com/test/base.git' },
            ],
          }),
          headers: new Headers({ 'content-type': 'application/json' }),
        };
      });

      await fetchCmd.fetchHubs(true);

      const moduleList = JSON.parse(
        await readFile(join(decisionRecordsPath, MODULE_LIST_FULL_PATH), {
          encoding: 'utf-8',
        }),
      );
      expect(moduleList.hubs.map((hub: HubSetting) => hub.location)).toEqual([
        kept.location,
      ]);

      checkout.configuration.hubs = originalHubs;
    });

    it('drops a hub that is removed while its list waits to be written', async () => {
      const originalHubs = checkout.configuration.hubs;
      const kept = { location: 'https://kept.test.com/hub' };
      checkout.configuration.hubs = [
        kept,
        { location: 'https://removed.test.com/hub' },
      ];
      fetchStub.mockResolvedValue({
        ok: true,
        json: async () => ({
          description: 'A hub',
          displayName: 'A hub',
          version: 1,
          modules: [],
        }),
        headers: new Headers({ 'content-type': 'application/json' }),
      });
      const proto = Fetch.prototype as unknown as {
        writeModuleList: (hubs: unknown[]) => Promise<void>;
      };
      const writeModuleList = proto.writeModuleList;
      vi.spyOn(proto, 'writeModuleList').mockImplementation(function (
        this: unknown,
        hubs,
      ) {
        checkout.configuration.hubs = [kept];
        return writeModuleList.call(this, hubs);
      });

      await fetchCmd.fetchHubs(true);

      const moduleList = JSON.parse(
        await readFile(join(decisionRecordsPath, MODULE_LIST_FULL_PATH), {
          encoding: 'utf-8',
        }),
      );
      expect(moduleList.hubs.map((hub: HubSetting) => hub.location)).toEqual([
        kept.location,
      ]);

      checkout.configuration.hubs = originalHubs;
    });

    it('should fetch when any hub has a newer version (multiple hubs)', async () => {
      // one hub has newer version
      fetchModuleListStub = vi
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .spyOn(Fetch.prototype as any, 'fetchModuleList')
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
      const originalHubs = checkout.configuration.hubs;
      checkout.configuration.hubs = [
        { location: 'https://test.com/hub1' },
        { location: 'https://test.com/hub2' },
      ];

      await fetchCmd.fetchHubs();

      expect(fetchModuleListStub).toHaveBeenCalledTimes(1);
      expect(fetchStub).toHaveBeenCalledTimes(2);

      checkout.configuration.hubs = originalHubs;
    });
  });
});
