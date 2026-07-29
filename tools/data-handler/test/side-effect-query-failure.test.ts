// testing
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

// node
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

// cyberismo
import { Cmd } from '../src/command-handler.js';
import { CalculationEngine } from '../src/containers/project/calculation-engine.js';
import {
  cardState,
  setupSideEffectProject,
} from './helpers/side-effect-fixture.js';

const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-side-effect-query-failure-tests');

beforeAll(() => {
  mkdirSync(testDir, { recursive: true });
});

afterAll(() => {
  rmSync(testDir, { recursive: true, force: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('side-effect query failure', () => {
  it('completes the primary transition when the side-effect query fails', async () => {
    const { commands, options } = await setupSideEffectProject(
      testDir,
      'query-failure',
      '% no facts',
    );
    const original = CalculationEngine.prototype.runQuery;
    vi.spyOn(CalculationEngine.prototype, 'runQuery').mockImplementation(
      async function (
        this: CalculationEngine,
        ...args: Parameters<CalculationEngine['runQuery']>
      ) {
        if (args[0] === 'onTransition') {
          throw new Error('simulated broken module calculation');
        }
        return original.apply(this, args);
      } as CalculationEngine['runQuery'],
    );
    const result = await commands.command(
      Cmd.transition,
      ['decision_5', 'Approve'],
      options,
    );
    expect(result.statusCode).toBe(200);
    expect(await cardState(commands, options, 'decision_5')).toBe('Approved');
  });
});
