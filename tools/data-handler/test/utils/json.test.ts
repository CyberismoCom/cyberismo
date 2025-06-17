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

describe('Json', () => {
  it('readJsonFile (success)', () => {
    const path = join(process.cwd(), 'test', 'test-data', 'test-template.json');
    const op = readJsonFileSync(path);
    expect(op).to.not.equal(null);
  });
  it('readJsonFile not found', async () => {
    const path = join(
      process.cwd(),
      'test',
      'test-data',
      'i-do-not-exist.json',
    );
    expect(() => readJsonFileSync(path)).to.throw('no such file');
    await expect(readJsonFile(path)).to.be.rejectedWith('no such file');
  });
  it('readAdocFile not found', () => {
    const path = join(
      process.cwd(),
      'test',
      'test-data',
      'i-do-not-exist.json',
    );
    expect(() => readADocFileSync(path)).to.throw(`Adoc file`);
  });
  it('readJsonFile non-JSON content', () => {
    const path = join(
      process.cwd(),
      'test',
      'test-data',
      'non-valid-template-not-json.txt',
    );
    expect(() => readJsonFileSync(path)).to.throw('Unexpected token');
  });
  it('formatJson', () => {
    const referenceJson =
      '{\n    "title": "Untitled",\n    "cardType": "page"\n}';
    const formattedJson = formatJson({ title: 'Untitled', cardType: 'page' });

    expect(formattedJson).to.equal(referenceJson);
  });
  it('formatJson - trim', () => {
    const referenceJson =
      '{\n    "title": "Untitled",\n    "cardType": "page"\n}';
    const formattedJson = formatJson({
      title: ' Untitled ',
      cardType: ' page ',
    });

    expect(formattedJson).to.equal(referenceJson);
  });
});
