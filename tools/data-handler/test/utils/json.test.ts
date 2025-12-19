// testing
import { expect } from 'chai';
import { describe, it } from 'mocha';

// node
import { join } from 'node:path';

// ismo
import {
  escapeJsonString,
  readADocFileSync,
  readJsonFile,
  readJsonFileSync,
} from '../../src/utils/json.js';
import { formatJson } from '../../src/utils/json.js';

describe('Json', () => {
  it('should read JSON file', () => {
    const path = join(process.cwd(), 'test', 'test-data', 'test-template.json');
    const op = readJsonFileSync(path);
    expect(op).to.not.equal(null);
  });
  it('should throw when reading missing JSON file', async () => {
    const path = join(
      process.cwd(),
      'test',
      'test-data',
      'i-do-not-exist.json',
    );
    expect(() => readJsonFileSync(path)).to.throw('no such file');
    await expect(readJsonFile(path)).to.be.rejectedWith('no such file');
  });
  it('should throw when reading missing adoc file', () => {
    const path = join(
      process.cwd(),
      'test',
      'test-data',
      'i-do-not-exist.json',
    );
    expect(() => readADocFileSync(path)).to.throw(`Adoc file`);
  });
  it('should throw when JSON file contains non-JSON content', () => {
    const path = join(
      process.cwd(),
      'test',
      'test-data',
      'non-valid-template-not-json.txt',
    );
    expect(() => readJsonFileSync(path)).to.throw('Unexpected token');
  });
  it('should format JSON file', () => {
    const referenceJson =
      '{\n    "title": "Untitled",\n    "cardType": "page"\n}';
    const formattedJson = formatJson({ title: 'Untitled', cardType: 'page' });

    expect(formattedJson).to.equal(referenceJson);
  });
  it('should format and trim JSON file', () => {
    const referenceJson =
      '{\n    "title": "Untitled",\n    "cardType": "page"\n}';
    const formattedJson = formatJson({
      title: ' Untitled ',
      cardType: ' page ',
    });

    expect(formattedJson).to.equal(referenceJson);
  });
  it('should escape double quotes', () => {
    const input = 'Text with "quotes"';
    const result = escapeJsonString(input);
    expect(result).to.equal('Text with \\"quotes\\"');
  });

  it('should escape backslashes', () => {
    const input = 'Path\\to\\file';
    const result = escapeJsonString(input);
    expect(result).to.equal('Path\\\\to\\\\file');
  });

  it('should escape newlines', () => {
    const input = 'Line 1\nLine 2';
    const result = escapeJsonString(input);
    expect(result).to.equal('Line 1\\nLine 2');
  });

  it('should escape carriage returns', () => {
    const input = 'Line 1\rLine 2';
    const result = escapeJsonString(input);
    expect(result).to.equal('Line 1\\rLine 2');
  });

  it('should escape tabs', () => {
    const input = 'Col1\tCol2';
    const result = escapeJsonString(input);
    expect(result).to.equal('Col1\\tCol2');
  });

  it('should escape form feeds', () => {
    const input = 'Page1\fPage2';
    const result = escapeJsonString(input);
    expect(result).to.equal('Page1\\fPage2');
  });

  it('should escape backspaces', () => {
    const input = 'Text\bwith\bbackspace';
    const result = escapeJsonString(input);
    expect(result).to.equal('Text\\bwith\\bbackspace');
  });

  it('should escape multiple special characters', () => {
    const input = 'Line 1\nLine 2\t"quoted"\r\n\\backslash';
    const result = escapeJsonString(input);
    expect(result).to.equal(
      'Line 1\\nLine 2\\t\\"quoted\\"\\r\\n\\\\backslash',
    );
  });

  it('should handle empty string', () => {
    const result = escapeJsonString('');
    expect(result).to.equal('');
  });

  it('should handle string with no special characters', () => {
    const input = 'Simple text';
    const result = escapeJsonString(input);
    expect(result).to.equal('Simple text');
  });
});
