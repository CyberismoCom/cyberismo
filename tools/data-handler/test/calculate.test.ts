import { expect, use } from 'chai';
import { dirname, join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

import { Calculate } from '../src/calculate.js';
import { copyDir } from '../src/utils/file-utils.js';
import { fileURLToPath } from 'node:url';

import chaiAsPromised from 'chai-as-promised';
use(chaiAsPromised);

const calculate = new Calculate();

describe('calculate', () => {
  const baseDir = dirname(fileURLToPath(import.meta.url));
  const testDir = join(baseDir, 'tmp-calculate-tests');
  const decisionRecordsPath = join(testDir, 'valid/decision-records');

  before(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data/', testDir);
  });

  after(() => {
    rmSync(testDir, { recursive: true, force: true });
  });
  it('run named query successfully', async () => {
    const query = 'tree';

    const res = await calculate.runQuery(decisionRecordsPath, query);

    expect(res.results).to.have.length.above(0);
    expect(res.error).to.eq(null);
  });
  it('try to run non-existing query', async () => {
    return expect(
      calculate.runQuery(decisionRecordsPath, 'non-existing'),
    ).to.be.rejectedWith('Query file non-existing not found');
  });
  it('try to run non-existing file', async () => {
    return expect(
      calculate.run(decisionRecordsPath, 'non-existing.lp'),
    ).to.be.rejectedWith('Clingo error');
  });
});
