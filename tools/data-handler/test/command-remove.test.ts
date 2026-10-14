import { expect, it, describe, beforeEach, afterEach, vi } from 'vitest';

// node
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve as pathResolve } from 'node:path';

// cyberismo
import { Cmd, Commands, Workspace } from '../src/command-handler.js';
import { createProject } from '../src/directory/create-project.js';
import { copyDir } from '../src/utils/file-utils.js';
import {
  MODULE_LIST_FULL_PATH,
  type ModuleListFile,
} from '../src/commands/fetch.js';
import { getTestBaseDir, getTestProject } from './helpers/test-utils.js';
import { makeFakeModuleFixture } from './helpers/module-fixtures.js';

import type * as Undici from 'undici';

// Hub requests go out through egressFetch, which uses undici's fetch rather
import { findCard } from '../src/cards/read.js';

// than the global one, so the stub belongs here.
const undiciFetch = vi.hoisted(() => vi.fn());
vi.mock('undici', async (importOriginal) => {
  const actual = await importOriginal<typeof Undici>();
  return { ...actual, fetch: undiciFetch };
});
import { CardNotFoundError } from '../src/exceptions/index.js';
import { SYSTEM_ACTOR } from '../src/utils/tx-record.js';
import { openTestWorkspace } from './helpers/open-test-workspace.js';

// Create test artifacts in a temp folder.
const baseDir = getTestBaseDir(import.meta.dirname, import.meta.url);
const testDir = join(baseDir, 'tmp-command-handler-remove-tests');

const decisionRecordsPath = join(testDir, 'valid/decision-records');

const options = { projectPath: decisionRecordsPath };

describe('remove command', () => {
  const commandHandler: Commands = new Commands();

  describe('removal attempts', () => {
    beforeEach(async () => {
      mkdirSync(testDir, { recursive: true });
      await copyDir('test/test-data', testDir);
    });

    afterEach(() => {
      rmSync(testDir, { recursive: true, force: true });
    });
    it('try to remove unknown type', async () => {
      const cardId = 'decision_5';
      const result = await commandHandler.command(
        Cmd.remove,
        ['i-dont-exist', cardId],
        options,
      );
      expect(result.statusCode).toBe(400);
    });
    it('try to remove non-existing attachment', async () => {
      const cardId = 'decision_5';
      const checkout = getTestProject(decisionRecordsPath);
      await checkout.populateCaches();
      await expect(
        Workspace.over(checkout, SYSTEM_ACTOR).cards.removeAttachment(
          cardId,
          '',
        ),
      ).rejects.toThrow();
    });
    it('try to remove attachment from non-existing card', async () => {
      const cardId = 'decision_999';
      const checkout = getTestProject(decisionRecordsPath);
      await checkout.populateCaches();
      await expect(
        Workspace.over(checkout, SYSTEM_ACTOR).cards.removeAttachment(
          cardId,
          'the-needle.heic',
        ),
      ).rejects.toThrow();
    });
    it('try to remove non-existing module', async () => {
      const checkout = getTestProject(decisionRecordsPath);
      await checkout.populateCaches();
      const removeCmd = Workspace.over(checkout, SYSTEM_ACTOR).modules;

      await expect(removeCmd.remove('i-dont-exist')).rejects.toThrow();
    });
  });
});

describe('remove card', () => {
  const baseDir = getTestBaseDir(import.meta.dirname, import.meta.url);
  const testDir = join(baseDir, 'tmp-remove-tests');
  const decisionRecordsPath = join(testDir, 'valid/decision-records');
  let ws: Workspace;

  beforeEach(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data/', testDir);
    ws = await openTestWorkspace(decisionRecordsPath, {});
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('should remove links to children when parent card is removed', async () => {
    // Create a parent+child pair from the simplepage template
    const simplePageTemplate = 'decision/templates/simplepage';
    const createdCards = await ws.cards.create(simplePageTemplate);
    const parentCard = createdCards.find(
      (card) => card.parent === 'root' && card.children.length > 0,
    );
    expect(parentCard).not.toBeUndefined();
    const childKey = parentCard!.children[0];

    // Create another card and link it to the child
    const decisionTemplate = 'decision/templates/decision';
    const otherCards = await ws.cards.create(decisionTemplate);
    const otherCardKey = otherCards[0].key;

    const linkType = 'decision/linkTypes/test';
    await ws.cards.addLink(otherCardKey, childKey, linkType);

    // Verify the link exists
    let otherCard = findCard(ws.checkout, otherCardKey);
    const linksBefore = otherCard.metadata?.links?.filter(
      (l) => l.cardKey === childKey,
    );
    expect(linksBefore).toHaveLength(1);

    // Remove the parent card (which also removes its children)
    await ws.cards.remove(parentCard!.key);

    // The link from otherCard to the child should also be removed
    otherCard = findCard(ws.checkout, otherCardKey);
    const linksAfter = otherCard.metadata?.links?.filter(
      (l) => l.cardKey === childKey,
    );
    expect(linksAfter).toHaveLength(0);
  });

  it('should remove card that has children', async () => {
    const cardId = 'decision_5';
    await Workspace.over(ws.checkout, SYSTEM_ACTOR).cards.remove(cardId);

    expect(() => findCard(ws.checkout, cardId)).toThrow(CardNotFoundError);
    // Since decision_6 is decision_5's child, it should have been removed as well.
    expect(() => findCard(ws.checkout, 'decision_6')).toThrow(
      CardNotFoundError,
    );
  });

  it('should not delete template cards when removing project cards', async () => {
    // Use simple-page template which has a parent card (decision_3) with a child card (decision_4)
    const templateName = 'decision/templates/simplepage';
    await ws.checkout.populateCaches();
    const templateResource = ws.checkout.resources.byType(
      templateName,
      'templates',
    );

    // Get template cards
    const templateCardsBefore = templateResource.cardTree.cards();
    expect(templateCardsBefore.length).toBeGreaterThan(0);

    // Verify at least one template card has children
    const templateCardsWithChildren = templateCardsBefore.filter(
      (c) => c.children && c.children.length > 0,
    );
    expect(templateCardsWithChildren.length).toBeGreaterThan(0);

    // Create cards from template
    const createdCards = await ws.cards.create(templateName);
    expect(createdCards.length).toBeGreaterThan(0);

    const parentCardKey = createdCards.find(
      (card) => card.parent === 'root' && card.children.length > 0,
    )!.key;
    const parentCard = findCard(ws.checkout, parentCardKey);
    expect(parentCard.children.length).toBeGreaterThan(0);

    // Delete the created project cards
    await ws.cards.remove(parentCardKey!);

    // Verify project card and its children are deleted
    expect(() => findCard(ws.checkout, parentCardKey)).toThrow(
      CardNotFoundError,
    );

    for (const childKey of parentCard.children) {
      expect(() => findCard(ws.checkout, childKey)).toThrow(CardNotFoundError);
    }

    // Verify template cards still exist and were not deleted
    const templateCardsAfter = templateResource.cardTree.cards();
    expect(templateCardsAfter.length).toBe(templateCardsBefore.length);

    // Verify each template card still exists
    for (const templateCard of templateCardsBefore) {
      const foundCard = templateCardsAfter.find(
        (c) => c.key === templateCard.key,
      );
      expect(foundCard).not.toBeUndefined();
    }
  });
});

describe('remove module — spec behaviours', () => {
  const baseDir = getTestBaseDir(import.meta.dirname, import.meta.url);
  const testDir = join(baseDir, 'tmp-remove-module-tests');

  beforeEach(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data/', testDir);
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('removing a transitive-only module errors naming the parent that requires it', async () => {
    // A transitive-only installation has no top-level declaration, so
    // the command must reject — but the error must explain the module
    // is required by its parent rather than misleadingly claiming it
    // isn't part of the project.
    const depRoot = join(testDir, 'fake-trans-dep');
    makeFakeModuleFixture(depRoot, { cardKeyPrefix: 'trdep' });
    const hostRoot = join(testDir, 'fake-trans-host');
    makeFakeModuleFixture(hostRoot, {
      cardKeyPrefix: 'trhost',
      modules: [{ name: 'trdep', location: `file:${pathResolve(depRoot)}` }],
    });

    const projectDir = join(testDir, 'proj-trans-only');
    await createProject(
      projectDir,
      {
        name: 'trans-only-proj',
        prefix: 'trsp',
        skipDefaultHub: true,
      },
      SYSTEM_ACTOR,
    );

    const ws = await openTestWorkspace(projectDir, {});
    await ws.modules.install(hostRoot);
    // Both are installed; only `trhost` is a top-level declaration.
    expect(existsSync(join(projectDir, '.cards', 'modules', 'trhost'))).toBe(
      true,
    );
    expect(existsSync(join(projectDir, '.cards', 'modules', 'trdep'))).toBe(
      true,
    );
    const topLevelNames = ws.checkout.configuration.modules.map((m) => m.name);
    expect(topLevelNames).toEqual(['trhost']);

    await expect(ws.modules.remove('trdep')).rejects.toThrow(
      "Cannot remove module 'trdep' because it is required by 'trhost'. Remove the parent module(s) first.",
    );

    // Both installations still exist — the failed remove didn't
    // accidentally mutate the tree.
    expect(existsSync(join(projectDir, '.cards', 'modules', 'trhost'))).toBe(
      true,
    );
    expect(existsSync(join(projectDir, '.cards', 'modules', 'trdep'))).toBe(
      true,
    );
  });

  it('removing a module that is genuinely absent errors with "not part of the project"', async () => {
    // The "not part of the project" message must still apply when the
    // name truly does not exist anywhere — declared or installed.
    const projectDir = join(testDir, 'proj-truly-absent');
    await createProject(
      projectDir,
      {
        name: 'truly-absent-proj',
        prefix: 'tasp',
        skipDefaultHub: true,
      },
      SYSTEM_ACTOR,
    );

    const ws = await openTestWorkspace(projectDir, {});
    await expect(ws.modules.remove('never-imported')).rejects.toThrow(
      "Module 'never-imported' is not part of the project",
    );
  });

  it('removing a deep transitive chain cascades the orphan cleanup to a fixed point', async () => {
    // A → B → C. Removing A must ultimately remove B and C too, via the
    // fixed-point cascade in `cleanOrphans` (iterates until stable).
    const cRoot = join(testDir, 'fake-chain-C');
    makeFakeModuleFixture(cRoot, { cardKeyPrefix: 'chc' });
    const bRoot = join(testDir, 'fake-chain-B');
    makeFakeModuleFixture(bRoot, {
      cardKeyPrefix: 'chb',
      modules: [{ name: 'chc', location: `file:${pathResolve(cRoot)}` }],
    });
    const aRoot = join(testDir, 'fake-chain-A');
    makeFakeModuleFixture(aRoot, {
      cardKeyPrefix: 'cha',
      modules: [{ name: 'chb', location: `file:${pathResolve(bRoot)}` }],
    });

    const projectDir = join(testDir, 'proj-chain');
    await createProject(
      projectDir,
      { name: 'chain-proj', prefix: 'chpr', skipDefaultHub: true },
      SYSTEM_ACTOR,
    );

    const ws = await openTestWorkspace(projectDir, {});
    await ws.modules.install(aRoot);

    // A, B, C all installed.
    expect(existsSync(join(projectDir, '.cards', 'modules', 'cha'))).toBe(true);
    expect(existsSync(join(projectDir, '.cards', 'modules', 'chb'))).toBe(true);
    expect(existsSync(join(projectDir, '.cards', 'modules', 'chc'))).toBe(true);

    await ws.modules.remove('cha');

    // Fixed-point cascade removes all three.
    expect(existsSync(join(projectDir, '.cards', 'modules', 'cha'))).toBe(
      false,
    );
    expect(existsSync(join(projectDir, '.cards', 'modules', 'chb'))).toBe(
      false,
    );
    expect(existsSync(join(projectDir, '.cards', 'modules', 'chc'))).toBe(
      false,
    );
    // Top-level declaration gone too.
    const topLevelNames = ws.checkout.configuration.modules.map((m) => m.name);
    expect(topLevelNames).not.toContain('cha');
  });

  it('removing a module with transitives drops the orphaned prefixes from allModulePrefixes', async () => {
    // After the orphan-cleanup cascade has deleted `.cards/modules/<name>/`
    // for each orphaned transitive, the project's cached
    // `allModulePrefixes()` must no longer list them — `cleanOrphans`
    // refreshes that cache itself.
    const cRoot = join(testDir, 'fake-drop-C');
    makeFakeModuleFixture(cRoot, { cardKeyPrefix: 'drpc' });
    const bRoot = join(testDir, 'fake-drop-B');
    makeFakeModuleFixture(bRoot, {
      cardKeyPrefix: 'drpb',
      modules: [{ name: 'drpc', location: `file:${pathResolve(cRoot)}` }],
    });
    const aRoot = join(testDir, 'fake-drop-A');
    makeFakeModuleFixture(aRoot, {
      cardKeyPrefix: 'drpa',
      modules: [{ name: 'drpb', location: `file:${pathResolve(bRoot)}` }],
    });

    const projectDir = join(testDir, 'proj-drop-prefix');
    await createProject(
      projectDir,
      {
        name: 'drop-prefix-proj',
        prefix: 'dppr',
        skipDefaultHub: true,
      },
      SYSTEM_ACTOR,
    );

    const ws = await openTestWorkspace(projectDir, {});
    await ws.modules.install(aRoot);
    // All three transitives live in the cached prefix list.
    expect(ws.checkout.allModulePrefixes()).toContain('drpa');
    expect(ws.checkout.allModulePrefixes()).toContain('drpb');
    expect(ws.checkout.allModulePrefixes()).toContain('drpc');

    await ws.modules.remove('drpa');

    // Orphan cascade removed the transitives from disk *and* from the
    // cached prefix list.
    expect(ws.checkout.allModulePrefixes()).not.toContain('drpa');
    expect(ws.checkout.allModulePrefixes()).not.toContain('drpb');
    expect(ws.checkout.allModulePrefixes()).not.toContain('drpc');
  });
});

describe('remove hub', () => {
  const baseDir = getTestBaseDir(import.meta.dirname, import.meta.url);
  const testDir = join(baseDir, 'tmp-remove-hub-tests');
  const projectPath = join(testDir, 'valid/decision-records');
  const cachePath = join(projectPath, MODULE_LIST_FULL_PATH);

  const hubA = 'https://hub-a.test/hub/';
  const hubB = 'https://hub-b.test/hub/';

  const fetchStub = undiciFetch;

  function hubResponse(displayName: string, moduleNames: string[]) {
    return {
      ok: true,
      json: async () => ({
        description: `${displayName} description`,
        displayName,
        version: 1,
        modules: moduleNames.map((name) => ({
          name,
          location: `https://github.com/${displayName}/${name}.git`,
        })),
      }),
      headers: new Headers({ 'content-type': 'application/json' }),
    };
  }

  async function projectWithHubs(locations: string[]) {
    const checkout = getTestProject(projectPath);
    await checkout.populateCaches();
    checkout.configuration.hubs = locations.map((location) => ({ location }));
    const fetchCmd = Workspace.over(checkout, SYSTEM_ACTOR).modules;
    return {
      checkout,
      fetchCmd,
      hubs: Workspace.over(checkout, SYSTEM_ACTOR).settings.hubs,
    };
  }

  async function cachedList(): Promise<ModuleListFile> {
    return JSON.parse(await readFile(cachePath, 'utf-8'));
  }

  beforeEach(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data', testDir);
    fetchStub.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(testDir, { recursive: true, force: true });
  });

  it('drops the cached data of the removed hub, keeping the other hub', async () => {
    const { fetchCmd, hubs } = await projectWithHubs([hubA, hubB]);
    fetchStub
      .mockResolvedValueOnce(hubResponse('huba', ['alpha']))
      .mockResolvedValueOnce(hubResponse('hubb', ['beta']));
    await fetchCmd.fetchHubs(true);

    await hubs.remove(hubA);

    const cached = await cachedList();
    expect(cached.hubs.map((hub) => hub.location)).toEqual([hubB]);
    expect(cached.modules.map((module) => module.name)).toEqual(['beta']);
    // Pruning must not reach the network.
    expect(fetchStub).toHaveBeenCalledTimes(2);
  });

  it('succeeds when no module list has been cached', async () => {
    const { checkout, hubs } = await projectWithHubs([hubA, hubB]);
    expect(existsSync(cachePath)).toBe(false);

    await hubs.remove(hubA);

    expect(checkout.configuration.hubs.map((hub) => hub.location)).toEqual([
      hubB,
    ]);
    expect(existsSync(cachePath)).toBe(false);
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it('keeps a module that the remaining hub also offers', async () => {
    const { fetchCmd, hubs } = await projectWithHubs([hubA, hubB]);
    fetchStub
      .mockResolvedValueOnce(hubResponse('huba', ['shared', 'alpha']))
      .mockResolvedValueOnce(hubResponse('hubb', ['shared', 'beta']));
    await fetchCmd.fetchHubs(true);
    expect((await cachedList()).modules.map((module) => module.name)).toEqual([
      'shared',
      'alpha',
      'beta',
    ]);

    await hubs.remove(hubA);

    const cached = await cachedList();
    expect(cached.modules.map((module) => module.name)).toEqual([
      'shared',
      'beta',
    ]);
    // The surviving entry is the remaining hub's, not the removed hub's.
    expect(cached.modules[0].location).toBe(
      'https://github.com/hubb/shared.git',
    );
  });

  it('prunes a hub cached under a legacy spelling of its location', async () => {
    const legacyHubA = 'https://hub-a.test/hub';
    const { fetchCmd, hubs } = await projectWithHubs([legacyHubA, hubB]);
    fetchStub
      .mockResolvedValueOnce(hubResponse('huba', ['alpha']))
      .mockResolvedValueOnce(hubResponse('hubb', ['beta']));
    await fetchCmd.fetchHubs(true);
    expect((await cachedList()).hubs.map((hub) => hub.location)).toEqual([
      legacyHubA,
      hubB,
    ]);

    await hubs.remove(hubA);

    const cached = await cachedList();
    expect(cached.hubs.map((hub) => hub.location)).toEqual([hubB]);
    expect(cached.modules.map((module) => module.name)).toEqual(['beta']);
  });
});
