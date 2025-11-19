// testing
import { expect } from 'chai';

// node
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

// cyberismo
import { copyDir } from '../src/utils/file-utils.js';
import { Cmd, Commands } from '../src/command-handler.js';
import { Show } from '../src/commands/index.js';
import { getTestProject } from './helpers/test-utils.js';

// Create test artifacts in a temp folder.
const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-command-handler-rank-tests');

const decisionRecordsPath = join(testDir, 'valid/decision-records');

const commandHandler: Commands = new Commands();
const options = { projectPath: decisionRecordsPath };

describe('rank command', () => {
  let rootCardKey: string;
  let childCardKey: string;

  beforeEach(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data', testDir);

    // Create a few cards to play with.
    const template = 'decision/templates/decision';
    const rootResult = await commandHandler.command(
      Cmd.create,
      ['card', template, ''],
      options,
    );
    rootCardKey = rootResult.affectsCards![0];

    const childResult = await commandHandler.command(
      Cmd.create,
      ['card', template, 'decision_5'],
      options,
    );

    // To avoid logged errors from clingo queries during tests, generate calculations.
    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    await project.calculationEngine.generate();

    childCardKey = childResult.affectsCards![0];
  });

  afterEach(() => {
    try {
      rmSync(testDir, { recursive: true, force: true, maxRetries: 5 });
    } catch (error) {
      if (error instanceof Error) {
        console.error(
          `There was an issue cleaning up after "rank" tests: ${error.message}`,
        );
      }
    }
  });

  describe('rank rank', () => {
    it('rank card (success)', async () => {
      const rankBefore = 'decision_6';
      // rank the new card
      const result = await commandHandler.command(
        Cmd.rank,
        ['card', rankBefore, childCardKey],
        options,
      );

      expect(result.statusCode).to.equal(200);

      const project = getTestProject(options.projectPath!);
      await project.populateCaches();
      const details = new Show(project).showCardDetails(rankBefore);
      expect(details.metadata?.rank).to.equal('0|c');
    });
    it('rank card in root (success)', async () => {
      const rankBefore = 'decision_5';

      // rank the new card
      const result = await commandHandler.command(
        Cmd.rank,
        ['card', rankBefore, rootCardKey],
        options,
      );

      expect(result.statusCode).to.equal(200);

      const project = getTestProject(options.projectPath!);
      await project.populateCaches();
      const details = new Show(project).showCardDetails(rankBefore);
      // Just verify that a rank was assigned (the exact value can vary based on existing cards)
      expect(details.metadata?.rank).to.match(/^0\|[a-z0-9]+$/);
    });
    it('rank card first (success)', async () => {
      const key = 'decision_5';
      const result = await commandHandler.command(
        Cmd.rank,
        ['card', key, 'first'],
        options,
      );
      expect(result.statusCode).to.equal(200);

      const project = getTestProject(options.projectPath!);
      await project.populateCaches();
      const details = new Show(project).showCardDetails(key);

      expect(details.metadata?.rank).to.equal('0|a');
    });
    it('rank template card in root (success)', async () => {
      const rankBefore = 'decision_2';
      const rootCardKey = 'decision_3';

      const result = await commandHandler.command(
        Cmd.rank,
        ['card', rankBefore, rootCardKey],
        options,
      );

      expect(result.statusCode).to.equal(200);

      // Use command handler to get card details for consistent project instance
      const detailsResult = await commandHandler.command(
        Cmd.show,
        ['card', rankBefore],
        { ...options, details: true },
      );
      expect(detailsResult.statusCode).to.equal(200);
      const cardDetails = detailsResult.payload as {
        metadata?: { rank?: string };
      };
      expect(cardDetails.metadata?.rank).to.equal('0|c');
    });
    it('rank template card first (success)', async () => {
      const key = 'decision_2';
      const result = await commandHandler.command(
        Cmd.rank,
        ['card', key, 'first'],
        options,
      );
      expect(result.statusCode).to.equal(200);
      const project = getTestProject(options.projectPath!);
      await project.populateCaches();
      const details = new Show(project).showCardDetails(key);
      expect(details.metadata?.rank).to.equal('0|a');
    });
  });

  describe('rank attempts - test data is not cleaned', () => {
    it('try rank card - project missing', async () => {
      const rankBefore = 'decision_6';
      const invalidProject = { projectPath: 'idontexist' };
      const result = await commandHandler.command(
        Cmd.rank,
        ['card', rankBefore, childCardKey],
        invalidProject,
      );
      expect(result.statusCode).to.equal(400);
    });
    it('try rank card - card not found', async () => {
      const rankBefore = 'decision_999';
      const result = await commandHandler.command(
        Cmd.rank,
        ['card', rankBefore, childCardKey],
        options,
      );
      expect(result.statusCode).to.equal(400);
    });

    it('try rank card - before itself', async () => {
      const rankBefore = 'decision_6';
      const result = await commandHandler.command(
        Cmd.rank,
        ['card', rankBefore, rankBefore],
        options,
      );
      expect(result.statusCode).to.equal(400);
    });
    it('try rank card - before card at different level', async () => {
      const rankBefore = 'decision_6';
      const result = await commandHandler.command(
        Cmd.rank,
        ['card', rankBefore, 'decision_5'],
        options,
      );
      expect(result.statusCode).to.equal(400);
    });
  });

  // note: these tests could be more detailed
  describe('rebalance', () => {
    it('rebalance (success)', async () => {
      const result = await commandHandler.command(
        Cmd.rank,
        ['rebalance'],
        options,
      );
      expect(result.statusCode).to.equal(200);
    });
    it('rebalance root (success)', async () => {
      const result = await commandHandler.command(
        Cmd.rank,
        ['rebalance', ''],
        options,
      );
      expect(result.statusCode).to.equal(200);
    });
    it('rebalance card (success)', async () => {
      const result = await commandHandler.command(
        Cmd.rank,
        ['rebalance', 'decision_5'],
        options,
      );
      expect(result.statusCode).to.equal(200);
    });
    it('rebalance template card (success)', async () => {
      const result = await commandHandler.command(
        Cmd.rank,
        ['rebalance', 'decision_1'],
        options,
      );
      expect(result.statusCode).to.equal(200);
    });
  });
});
