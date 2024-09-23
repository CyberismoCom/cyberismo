// testing
import { expect } from 'chai';

// node
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// cyberismo
import { CardsOptions, Cmd, Commands } from '../src/command-handler.js';
import { Show } from '../src/show.js';
import { copyDir } from '../src/utils/file-utils.js';

// Create test artifacts in a temp folder.
const baseDir = dirname(fileURLToPath(import.meta.url));
const testDir = join(baseDir, 'tmp-command-handler-rank-tests');

const decisionRecordsPath = join(testDir, 'valid/decision-records');

const commandHandler: Commands = new Commands();
const options: CardsOptions = { projectPath: decisionRecordsPath };

describe('rank command', () => {
  let rootCardKey: string;
  let childCardKey: string;

  before(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data', testDir);
  });

  after(() => {
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

  beforeEach(async () => {
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
    childCardKey = childResult.affectsCards![0];
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

      const details = await new Show().showCardDetails(
        options.projectPath!,
        { metadata: true },
        rankBefore,
      );
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

      const details = await new Show().showCardDetails(
        options.projectPath!,
        { metadata: true, content: true },
        rankBefore,
      );
      expect(details.metadata?.rank).to.equal('0|d');
    });
    // Note: this tests depends on the previous test
    it('rank card first(success)', async () => {
      const key = 'decision_5';
      const result = await commandHandler.command(
        Cmd.rank,
        ['card', key, 'first'],
        options,
      );
      expect(result.statusCode).to.equal(200);

      const details = await new Show().showCardDetails(
        options.projectPath!,
        { metadata: true, content: true },
        key,
      );

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
    it('rebalance root(success)', async () => {
      const result = await commandHandler.command(
        Cmd.rank,
        ['rebalance', ''],
        options,
      );
      expect(result.statusCode).to.equal(200);
    });
    it('rebalance card(success)', async () => {
      const result = await commandHandler.command(
        Cmd.rank,
        ['rebalance', 'decision_5'],
        options,
      );
      expect(result.statusCode).to.equal(200);
    });
  });
});
