import { expect, it, describe, beforeEach, afterEach } from 'vitest';

import { mkdirSync, rmSync } from 'node:fs';
import { join, sep } from 'node:path';

import { Cmd, CommandManager, Commands } from '../src/command-handler.js';
import { copyDir } from '../src/utils/file-utils.js';
import { Fetch, Show } from '../src/commands/index.js';
import { getTestBaseDir, getTestProject } from './helpers/test-utils.js';

// Create test artifacts in a temp folder.
let commandHandler: Commands;
let options: { projectPath: string };

// Creates similarly named card. For example if the tested card has key 'decision_5,
// this will create a card whose key starts with 'decision_5', but the rest of the card
// key will be randomized. For example, 'decision_5skjdh3d'.
async function createSimilarCard(
  template: string,
  parent?: string,
): Promise<string | undefined> {
  let descendant: string | undefined;
  let attempts = 0;
  const maxAttempts = 100;

  while (!descendant && attempts < maxAttempts) {
    const done = await commandHandler.command(
      Cmd.create,
      ['card', template, parent || ''],
      options,
    );
    const createdKey = done.affectsCards?.at(0);
    if (createdKey && createdKey.startsWith('decision_5')) {
      descendant = createdKey;
      return descendant;
    }
    attempts++;
  }
}

describe('move command', () => {
  let testDir: string;
  let decisionRecordsPath: string;
  let createdCardKey: string;

  beforeEach(async () => {
    const baseDir = getTestBaseDir(import.meta.dirname, import.meta.url);
    // Unique testDir per test so the CommandManager singleton (keyed on
    // project path) is rebuilt and we don't see stale cache from a sibling test.
    testDir = join(
      baseDir,
      `tmp-command-handler-move-tests-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    decisionRecordsPath = join(testDir, 'valid/decision-records');
    options = { projectPath: decisionRecordsPath };

    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data', testDir);

    commandHandler = new Commands();

    // Create few more cards to play with (moved from first test)
    const template = 'decision/templates/decision';
    const parent = '';
    const done = await commandHandler.command(
      Cmd.create,
      ['card', template, parent],
      options,
    );
    if (done.statusCode !== 200) {
      throw new Error(`Failed to create test card: ${done.message}`);
    }

    // Store the created card key for use in tests
    createdCardKey = done.affectsCards?.[0] || '';
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('move card to root (success)', async () => {
    const project = getTestProject(options.projectPath!);
    await project.populateCaches();
    const fetchCmd = new Fetch(project);
    const cards = await new Show(project, fetchCmd).showProjectCards();

    // Use the card created in beforeEach
    const sourceId = cards[cards.length - 1].key;
    const destination = 'root';
    const result = await commandHandler.command(
      Cmd.move,
      [sourceId, destination],
      options,
    );
    expect(result.statusCode).toBe(200);
  });
  it('move card to another card (success)', async () => {
    const project = getTestProject(options.projectPath!);
    await project.populateCaches();
    const fetchCmd = new Fetch(project);
    const cards = await new Show(project, fetchCmd).showProjectCards();
    expect(cards).toHaveLength(2);

    const sourceId = cards[cards.length - 1].key;
    const destination = cards[cards.length - 2].key;
    const result = await commandHandler.command(
      Cmd.move,
      [sourceId, destination],
      options,
    );
    expect(result.statusCode).toBe(200);
  });
  it('move child card to another card (success)', async (context) => {
    // TODO: This test is flaky, remove skip when fixed
    context.skip();
    const sourceId = 'decision_6';
    const destination = createdCardKey;

    const result = await commandHandler.command(
      Cmd.move,
      [sourceId, destination],
      options,
    );
    expect(result.statusCode).toBe(200);
  });
  it('try to move card to itself', async () => {
    const sourceId = 'decision_6';
    const destination = 'decision_6';
    const result = await commandHandler.command(
      Cmd.move,
      [sourceId, destination],
      options,
    );
    expect(result.statusCode).toBe(400);
  });
  it('try to move card to inside itself', async () => {
    // create two root-level cards
    const template = 'decision/templates/decision';
    const parent = '';
    let done = await commandHandler.command(
      Cmd.create,
      ['card', template, parent],
      options,
    );
    const card1 = done.affectsCards!.at(0) as string;
    done = await commandHandler.command(
      Cmd.create,
      ['card', template, parent],
      options,
    );
    const card2 = done.affectsCards!.at(0) as string;

    // Move card2 to be under card1
    let result = await commandHandler.command(
      Cmd.move,
      [card1, card2],
      options,
    );
    expect(result.statusCode).toBe(200);

    // Try to move card1 under card2
    result = await commandHandler.command(Cmd.move, [card2, card1], options);
    expect(result.statusCode).toBe(400);
  });
  it('try to move card - project missing', async () => {
    const sourceId = 'decision_11';
    const destination = 'decision_12';
    const invalidProject = { projectPath: 'idontexist' };
    const result = await commandHandler.command(
      Cmd.move,
      [sourceId, destination],
      invalidProject,
    );
    expect(result.statusCode).toBe(400);
  });
  it('try to move card - source card not found', async () => {
    const sourceId = 'decision_999';
    const destination = 'decision_11';
    const result = await commandHandler.command(
      Cmd.move,
      [sourceId, destination],
      options,
    );
    expect(result.statusCode).toBe(400);
  });
  it('try to move card - destination card not found', async () => {
    const sourceId = 'decision_11';
    const destination = 'decision_999';
    const result = await commandHandler.command(
      Cmd.move,
      [sourceId, destination],
      options,
    );
    expect(result.statusCode).toBe(400);
  });
  it('move card from template to template', async () => {
    const sourceId = 'decision_2';
    const destination = 'decision_3';
    const result = await commandHandler.command(
      Cmd.move,
      [sourceId, destination],
      options,
    );
    expect(result.statusCode).toBe(200);
  });
  it('try to move card from template to project', async () => {
    const result = await commandHandler.command(
      Cmd.move,
      ['decision_3', createdCardKey],
      options,
    );
    expect(result.statusCode).toBe(400);
  });
  it('try to move card from project to template', async () => {
    const result = await commandHandler.command(
      Cmd.move,
      [createdCardKey, 'decision_3'],
      options,
    );
    expect(result.statusCode).toBe(400);
  });
  it('cross-template move between local templates (success)', async () => {
    // decision_4 lives in 'simplepage' template; decision_1 is root of 'decision' template.
    const result = await commandHandler.command(
      Cmd.move,
      ['decision_4', 'decision_1'],
      options,
    );
    expect(result.statusCode).toBe(200);
    const verify = getTestProject(options.projectPath!);
    await verify.populateCaches();
    const after = verify.findCard('decision_4');
    expect(after.parent).toBe('decision_1');
    expect(after.path).toContain(
      `templates${sep}decision${sep}c${sep}decision_1${sep}c${sep}decision_4`,
    );
  });
  it('try to move template card to project root via sentinel (rejected)', async () => {
    const result = await commandHandler.command(
      Cmd.move,
      ['decision_3', 'root:project'],
      options,
    );
    expect(result.statusCode).toBe(400);
  });
  it('try to move project card to a template root via sentinel (rejected)', async () => {
    const result = await commandHandler.command(
      Cmd.move,
      [createdCardKey, 'root:decision/templates/decision'],
      options,
    );
    expect(result.statusCode).toBe(400);
  });
  it('move card to a different local template root via sentinel', async () => {
    // decision_4 is in simplepage; move to root of 'decision' template via sentinel.
    const result = await commandHandler.command(
      Cmd.move,
      ['decision_4', 'root:decision/templates/decision'],
      options,
    );
    expect(result.statusCode).toBe(200);
    const verify = getTestProject(options.projectPath!);
    await verify.populateCaches();
    const after = verify.findCard('decision_4');
    expect(after.parent).toBe('root');
    expect(after.path).toContain(
      `templates${sep}decision${sep}c${sep}decision_4`,
    );
    expect(after.path).not.toContain('simplepage');
  });
  it('promote nested template card to its template root (success)', async () => {
    // decision_4 is a child of decision_3 inside the 'simplepage' template.
    // Moving it to 'root' should land it at simplepage's template root,
    // not project root.
    const result = await commandHandler.command(
      Cmd.move,
      ['decision_4', 'root'],
      options,
    );
    expect(result.statusCode).toBe(200);

    const verify = getTestProject(options.projectPath!);
    await verify.populateCaches();
    const after = verify.findCard('decision_4');
    expect(after.parent).toBe('root');
    // It now lives directly under simplepage/c, not under decision_3/c
    expect(after.path).toContain(
      `templates${sep}simplepage${sep}c${sep}decision_4`,
    );
    expect(after.path).not.toContain(`decision_3${sep}c${sep}decision_4`);
  });

  it('verify card cache after move operation', async () => {
    // First establish the command handler's project instance by running a command
    await commandHandler.command(Cmd.show, ['project'], options);

    // Get the CommandManager instance to access its project
    const commandManager = await CommandManager.getInstance(
      options.projectPath!,
    );
    const project = commandManager.project;

    // Create two cards - parent and child
    const template = 'decision/templates/decision';
    let result = await commandHandler.command(
      Cmd.create,
      ['card', template, ''],
      options,
    );
    const parentCardKey = result.affectsCards?.[0];
    expect(parentCardKey).toBeTypeOf('string');

    result = await commandHandler.command(
      Cmd.create,
      ['card', template, ''],
      options,
    );
    const childCardKey = result.affectsCards?.[0];
    expect(childCardKey).toBeTypeOf('string');

    // Verify initial state - both cards should be findable in the same project instance used by commandHandler
    const parentBefore = project.findCard(parentCardKey!);
    const childBefore = project.findCard(childCardKey!);
    const allCardsBefore = project.cards(undefined);

    expect(
      parentBefore,
      'Parent card should be findable after creation',
    ).toBeDefined();
    expect(
      childBefore,
      'Child card should be findable after creation',
    ).toBeDefined();
    expect(childBefore!.parent).toBe('root'); // Should be at root initially
    expect(
      allCardsBefore.some((c) => c.key === childCardKey),
      'Child should be found in project.cards() result',
    ).toBe(true);

    // Move child under parent
    result = await commandHandler.command(
      Cmd.move,
      [childCardKey!, parentCardKey!],
      options,
    );
    expect(result.statusCode).toBe(200);

    // Verify state after move
    const parentAfter = project.findCard(parentCardKey!);
    const childAfter = project.findCard(childCardKey!);
    const allCardsAfter = project.cards(undefined);

    // Verify expectations
    expect(
      childAfter,
      'Child card should still be findable after move',
    ).toBeDefined();
    expect(childAfter!.parent, 'Child card should have correct parent').toBe(
      parentCardKey,
    );
    expect(childAfter!.path, 'Child card should have correct path').toContain(
      `${parentCardKey}${sep}c${sep}${childCardKey}`,
    );
    expect(
      parentAfter!.children,
      'Parent should list child in children array',
    ).toContain(childCardKey);
    expect(
      allCardsAfter.some((c) => c.key === childCardKey),
      'Child should be found in project.cards() result after move',
    ).toBe(true);
  });

  it('verify descendant card paths are updated in cache after moving parent', async () => {
    // This test ensures that when a parent card with descendants is moved,
    // all descendant card paths and attachment paths are updated in the cache.
    // This prevents operations on descendants from targeting non-existent paths.

    // Get the CommandManager instance to access its project
    const commandManager = await CommandManager.getInstance(
      options.projectPath!,
    );
    const project = commandManager.project;

    const template = 'decision/templates/decision';

    // Create a tree: grandparent -> parent -> child -> grandchild
    let result = await commandHandler.command(
      Cmd.create,
      ['card', template, ''],
      options,
    );
    const grandparentKey = result.affectsCards?.[0];
    expect(grandparentKey).toBeTypeOf('string');

    result = await commandHandler.command(
      Cmd.create,
      ['card', template, grandparentKey!],
      options,
    );
    const parentKey = result.affectsCards?.[0];
    expect(parentKey).toBeTypeOf('string');

    result = await commandHandler.command(
      Cmd.create,
      ['card', template, parentKey!],
      options,
    );
    const childKey = result.affectsCards?.[0];
    expect(childKey).toBeTypeOf('string');

    result = await commandHandler.command(
      Cmd.create,
      ['card', template, childKey!],
      options,
    );
    const grandchildKey = result.affectsCards?.[0];
    expect(grandchildKey).toBeTypeOf('string');

    // Add an attachment to the child card
    const attachmentName = 'test-attachment.txt';
    const attachmentContent = Buffer.from('test attachment content');
    await commandManager.createCmd.createAttachment(
      childKey!,
      attachmentName,
      attachmentContent,
    );

    // Create a destination card at root level
    result = await commandHandler.command(
      Cmd.create,
      ['card', template, ''],
      options,
    );
    const destinationKey = result.affectsCards?.[0];
    expect(destinationKey).toBeTypeOf('string');

    // Get paths before move
    const grandparentBefore = project.findCard(grandparentKey!);
    const parentBefore = project.findCard(parentKey!);
    const childBefore = project.findCard(childKey!);
    const grandchildBefore = project.findCard(grandchildKey!);

    // Verify child has our attachment before move
    const ourAttachmentBefore = childBefore.attachments.find(
      (a) => a.fileName === attachmentName,
    );
    expect(ourAttachmentBefore, 'Our attachment should exist').toBeDefined();
    const attachmentPathBefore = ourAttachmentBefore!.path;
    expect(attachmentPathBefore).toContain(childKey!);

    // Verify initial tree structure
    expect(grandparentBefore.parent).toBe('root');
    expect(parentBefore.parent).toBe(grandparentKey);
    expect(childBefore.parent).toBe(parentKey);
    expect(grandchildBefore.parent).toBe(childKey);

    // Store old paths for comparison
    const oldGrandparentPath = grandparentBefore.path;

    // Move grandparent under destination
    result = await commandHandler.command(
      Cmd.move,
      [grandparentKey!, destinationKey!],
      options,
    );
    expect(result.statusCode).toBe(200);

    // Verify all descendant paths are updated in cache
    const grandparentAfter = project.findCard(grandparentKey!);
    const parentAfterMove = project.findCard(parentKey!);
    const childAfterMove = project.findCard(childKey!);
    const grandchildAfterMove = project.findCard(grandchildKey!);

    // Grandparent should have new path under destination
    expect(grandparentAfter.path).toContain(
      `${destinationKey}${sep}c${sep}${grandparentKey}`,
    );
    expect(grandparentAfter.path).not.toBe(oldGrandparentPath);

    // Parent's path should be updated (under new grandparent path)
    expect(parentAfterMove.path).toContain(
      `${grandparentKey}${sep}c${sep}${parentKey}`,
    );
    expect(parentAfterMove.path).toContain(destinationKey!);

    // Child's path should be updated
    expect(childAfterMove.path).toContain(
      `${parentKey}${sep}c${sep}${childKey}`,
    );
    expect(childAfterMove.path).toContain(destinationKey!);

    // Grandchild's path should be updated
    expect(grandchildAfterMove.path).toContain(
      `${childKey}${sep}c${sep}${grandchildKey}`,
    );
    expect(grandchildAfterMove.path).toContain(destinationKey!);

    // Verify attachment path is updated
    const ourAttachmentAfter = childAfterMove.attachments.find(
      (a) => a.fileName === attachmentName,
    );
    expect(
      ourAttachmentAfter,
      'Our attachment should exist after move',
    ).toBeDefined();
    const attachmentPathAfter = ourAttachmentAfter!.path;
    expect(attachmentPathAfter).not.toBe(attachmentPathBefore);
    expect(attachmentPathAfter).toContain(destinationKey!);
    expect(attachmentPathAfter).toContain(childKey!);

    // Verify that paths start with project path (sanity check that paths are valid)
    expect(grandparentAfter.path.startsWith(decisionRecordsPath)).toBe(true);
    expect(parentAfterMove.path.startsWith(decisionRecordsPath)).toBe(true);
    expect(childAfterMove.path.startsWith(decisionRecordsPath)).toBe(true);
    expect(grandchildAfterMove.path.startsWith(decisionRecordsPath)).toBe(true);
    expect(attachmentPathAfter.startsWith(decisionRecordsPath)).toBe(true);
  });
});

// Separate test group for similar key tests to avoid interference
describe('move command - similar key tests', () => {
  let testDir: string;
  let decisionRecordsPath: string;
  const commandHandler: Commands = new Commands();
  let options: { projectPath: string };

  beforeEach(async () => {
    // Use unique directory name to avoid conflicts
    const baseDir = getTestBaseDir(import.meta.dirname, import.meta.url);
    testDir = join(baseDir, `tmp-move-similar-key-tests-${Date.now()}`);
    decisionRecordsPath = join(testDir, 'valid/decision-records');
    options = { projectPath: decisionRecordsPath };

    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data', testDir);
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('try to move card to its own similarly named descendant', async () => {
    const template = 'decision/templates/decision';
    const parent = 'decision_5';
    const descendant = (await createSimilarCard(template, parent)) as string;
    // Try to move decision_5 under its own descendant - this should fail
    const result = await commandHandler.command(
      Cmd.move,
      [parent, descendant],
      options,
    );
    expect(result.statusCode).toBe(400);
  });
});
