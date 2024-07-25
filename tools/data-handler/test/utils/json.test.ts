// testing
import { expect } from 'chai';
import { describe, it } from 'mocha';

// node
import { join } from 'node:path';

// ismo
import {
  readADocFileSync,
  readJsonFile,
  readJsonFileSync,
} from '../../src/utils/json.js';
import { formatJson } from '../../src/utils/json.js';

describe('read Json files', () => {
  it('readJsonFile (success)', () => {
    const path = join(process.cwd(), 'test', 'test-data', 'test-template.json');
    const op = readJsonFileSync(path);
    expect(op).to.not.be.null;
  });
  it('readJsonFile not found', async () => {
    const path = join(
      process.cwd(),
      'test',
      'test-data',
      'i-do-not-exist.json',
    );
    try {
      readJsonFileSync(path);
    } catch (error) {
      if (error instanceof Error) {
        const err: Error = error;
        expect(err.message).to.contain('no such file');
      }
    }
    try {
      await readJsonFile(path);
    } catch (error) {
      if (error instanceof Error) {
        const err: Error = error;
        expect(err.message).to.contain('no such file');
      }
    }
  });
  it('readAdocFile not found', async () => {
    const path = join(
      process.cwd(),
      'test',
      'test-data',
      'i-do-not-exist.json',
    );
    try {
      readADocFileSync(path);
    } catch (error) {
      if (error instanceof Error) {
        const err: Error = error;
        expect(err.message).to.contain('not found');
      }
    }
  });
  it('readJsonFile non-JSON content', () => {
    const path = join(
      process.cwd(),
      'test',
      'test-data',
      'non-valid-template-not-json.txt',
    );
    try {
      readJsonFileSync(path);
    } catch (error) {
      if (error instanceof Error) {
        const err: Error = error;
        expect(err.message).to.contain('Unexpected token');
      }
    }
  });
  it('formatJson', () => {
    const referenceJson =
      '{\n    "title": "Untitled",\n    "cardtype": "page"\n}';
    const formattedJson = formatJson({ title: 'Untitled', cardtype: 'page' });

    expect(formattedJson).to.equal(referenceJson);
  });
});
