// testing
import { expect, it, describe, beforeEach, afterEach, vi } from 'vitest';

// node
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

// cyberismo
import { copyDir } from '../src/utils/file-utils.js';
import { Cmd, Commands } from '../src/command-handler.js';

// Create test artifacts in a temp folder.
const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-command-handler-transition-tests');
const decisionRecordsPath = join(testDir, 'valid/decision-records');

const commandHandler: Commands = new Commands();
const options = { projectPath: decisionRecordsPath };

describe('transition command', () => {
  beforeEach(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data', testDir);
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('transition to new state - success()', async () => {
    // Get card details before transition using command handler
    const cardResult = await commandHandler.command(
      Cmd.show,
      ['card', 'decision_5'],
      options,
    );
    const card = cardResult.payload as {
      metadata?: { lastTransitioned?: unknown; lastUpdated?: unknown };
    };

    // Execute transition
    const result = await commandHandler.command(
      Cmd.transition,
      ['decision_5', 'Approve'],
      options,
    );

    expect(result.statusCode).toBe(200);

    // Get card details after transition using command handler
    const card2Result = await commandHandler.command(
      Cmd.show,
      ['card', 'decision_5'],
      options,
    );
    const card2 = card2Result.payload as {
      metadata?: { lastTransitioned?: unknown; lastUpdated?: unknown };
    };

    expect(card2.metadata!.lastTransitioned).not.toBe(
      card.metadata!.lastTransitioned,
    );
    expect(card2.metadata!.lastUpdated).not.toBe(card.metadata!.lastUpdated);
  });
  it('transition to new state with multiple "fromStates" - success()', async () => {
    const result = await commandHandler.command(
      Cmd.transition,
      ['decision_6', 'Reject'],
      options,
    );
    expect(result.statusCode).toBe(200);
  });
  it('transition to new state with wildcard workflow transition - success()', async () => {
    const result = await commandHandler.command(
      Cmd.transition,
      ['decision_6', 'Reopen'],
      options,
    );
    expect(result.statusCode).toBe(200);
  });
  it('missing project', async () => {
    vi.spyOn(commandHandler, 'setProjectPath').mockResolvedValueOnce('path'); // simulate missing project path
    await expect(
      commandHandler.command(Cmd.transition, ['decision_5', 'Created'], {}),
    ).resolves.toEqual({
      message: "Input validation error: cannot find project ''",
      statusCode: 400,
    });
  });
  it('missing card', async () => {
    const result = await commandHandler.command(
      Cmd.transition,
      ['', 'Create'],
      options,
    );
    expect(result.statusCode).toBe(400);
  });
  it('wrong state - no such state', async () => {
    const result = await commandHandler.command(
      Cmd.transition,
      ['decision_5', 'IDontExist'],
      options,
    );
    expect(result.statusCode).toBe(400);
  });
  it('wrong state - illegal transition', async () => {
    // cannot move from approved (earlier test moves state from create to approved) back to created
    const result = await commandHandler.command(
      Cmd.transition,
      ['decision_5', 'Create'],
      options,
    );
    expect(result.statusCode).toBe(400);
  });
  it('transition to same state', async () => {
    // an error is shown if card is already in a given state
    let result = await commandHandler.command(
      Cmd.transition,
      ['decision_6', 'Reject'],
      options,
    );
    expect(result.statusCode).toBe(200);
    result = await commandHandler.command(
      Cmd.transition,
      ['decision_6', 'Reject'],
      options,
    );
    expect(result.statusCode).toBe(200);
  });
});
