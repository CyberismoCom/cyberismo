import { expect } from 'chai';
import ClingoParser, {
  decodeClingoValue,
} from '../../src/utils/clingo-parser.js';
import { encodeClingoValue } from '../../src/utils/clingo-fact-builder.js';

const encodingTests = [
  ['\n', '\\n'],
  ['\\', '\\\\'],
  ['"', '\\"'],
];

const fieldTypeTests = [
  ['shortText', 'test', 'test'],
  ['longText', 'test2', 'test2'],
  ['enum', 'test3', 'test3'],
  ['person', 'test3@cyberismo.com', 'test3@cyberismo.com'],
  ['date', new Date(100).toISOString(), new Date(100).toISOString()],
  ['dateTime', new Date(100).toISOString(), new Date(100).toISOString()],
  ['number', '4324.432', 4324.432],
  ['integer', '3242', 3242],
  ['boolean', 'true', true],
  ['boolean', 'false', false],
  ['list', 'test,test2,test3', ['test', 'test2', 'test3']],
] as const;

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('ClingoParser', () => {
  const parser = new ClingoParser();

  encodingTests.forEach(([input, expected]) => {
    it(`should encode special value ${input} to ${expected}`, () => {
      const res = encodeClingoValue(input);

      expect(res).to.equal(expected);
    });

    it(`should decode special value ${expected} to ${input}`, () => {
      const res = decodeClingoValue(expected);

      expect(res).to.equal(input);
    });
  });

  it('should parse query_error correctly with 4 params', async () => {
    const input =
      'queryError("An error occurred", "param1", "param2", "param3", "param4")';
    const result = await parser.parseInput(input);
    expect(result.error).to.equal(
      'An error occurred param1, param2, param3, param4',
    );
  });

  it('should parse query_error correctly with 0 params', async () => {
    const input = 'queryError("An error occurred")';
    const result = await parser.parseInput(input);
    expect(result.error).to.equal('An error occurred');
  });

  it('should parse result correctly', async () => {
    const input = 'result("key1")';
    const result = await parser.parseInput(input);
    expect(result.results).to.have.lengthOf(1);
    expect(result.results[0].key).to.equal('key1');
  });

  it('should parse childResult correctly', async () => {
    const input =
      'result("parentKey")\nchildResult("parentKey", "childKey", "results")';
    const result: any = await parser.parseInput(input);
    expect(result.results).to.have.lengthOf(1);
    expect(result.results[0].key).to.equal('parentKey');
    expect(result.results[0].results).to.have.lengthOf(1);
    expect(result.results[0].results[0].key).to.equal('childKey');
  });

  it('should parse childResult correctly with different collection', async () => {
    const input =
      'result("parentKey")\nchildResult("parentKey", "childKey", "results2")';
    const result: any = await parser.parseInput(input);
    expect(result.results).to.have.lengthOf(1);
    expect(result.results[0].key).to.equal('parentKey');
    expect(result.results[0].results2).to.have.lengthOf(1);
    expect(result.results[0].results2[0].key).to.equal('childKey');
  });

  it('should parse field correctly', async () => {
    const input = `result("key1")\nfield("key1", "fieldName", "${encodeClingoValue('fieldValue')}", "shortText")`;
    const result = await parser.parseInput(input);
    expect(result.results[0].fieldName).to.equal('fieldValue');
  });

  fieldTypeTests.forEach((test) => {
    const [type, value, expected] = test;
    it(`should parse field with type ${type} correctly`, async () => {
      const fieldValue = encodeClingoValue(value.toString());
      const input = `result("key1")\nfield("key1", "fieldName", "${fieldValue}", "${type}")`;
      const result = await parser.parseInput(input);
      expect(result.results[0].fieldName).to.deep.equal(expected);
    });
  });
  it('should parse field correctly which has special characters', async () => {
    const fieldValue = 'fieldValueä)"()="()()()=\n';
    const input = `result("key1")\nfield("key1", "fieldName", "${encodeClingoValue(fieldValue)}", "shortText")`;
    const result = await parser.parseInput(input);
    expect(result.results[0].fieldName).to.equal(fieldValue);
  });

  it('should parse field correctly when last argument is an empty string', async () => {
    const fieldValue = '';
    const input = `result("key1")\nfield("key1", "fieldName", "${encodeClingoValue(fieldValue)}", "shortText")`;
    const result = await parser.parseInput(input);
    expect(result.results[0].fieldName).to.equal(fieldValue);
  });

  it('should parse label correctly', async () => {
    const input = 'result("key1")\nlabel("key1", "label1")';
    const result = await parser.parseInput(input);
    expect(result.results[0].labels).to.include('label1');
  });

  it('should parse link correctly', async () => {
    const input =
      'result("key1")\nlink("key1", "cardKey", "title", "linkType", "displayName", "inbound", "linkDescription")';
    const result = await parser.parseInput(input);
    expect(result.results[0].links).to.have.lengthOf(1);
    expect(result.results[0].links[0]).to.deep.equal({
      key: 'cardKey',
      linkType: 'linkType',
      title: 'title',
      displayName: 'displayName',
      linkDescription: 'linkDescription',
      direction: 'inbound',
    });
  });

  it('should parse link without linkDescription correctly', async () => {
    const input =
      'result("key1")\nlink("key1", "cardKey", "title", "linkType", "displayName", "inbound")';
    const result = await parser.parseInput(input);
    expect(result.results[0].links).to.have.lengthOf(1);
    expect(result.results[0].links[0]).to.deep.equal({
      key: 'cardKey',
      linkType: 'linkType',
      title: 'title',
      displayName: 'displayName',
      linkDescription: undefined,
      direction: 'inbound',
    });
  });

  it('should parse transitionDenied correctly', async () => {
    const input =
      'result("key1")\ntransitionDenied("key1", "transitionName", "errorMessage")';
    const result = await parser.parseInput(input);
    expect(result.results[0].deniedOperations.transition).to.have.lengthOf(1);
    expect(result.results[0].deniedOperations.transition[0]).to.deep.equal({
      transitionName: 'transitionName',
      errorMessage: 'errorMessage',
    });
  });

  it('should parse movingCardDenied correctly', async () => {
    const input = 'result("key1")\nmovingCardDenied("key1", "errorMessage")';
    const result = await parser.parseInput(input);
    expect(result.results[0].deniedOperations.move).to.have.lengthOf(1);
    expect(result.results[0].deniedOperations.move[0].errorMessage).to.equal(
      'errorMessage',
    );
  });

  it('should parse deletingCardDenied correctly', async () => {
    const input = 'result("key1")\ndeletingCardDenied("key1", "errorMessage")';
    const result = await parser.parseInput(input);
    expect(result.results[0].deniedOperations.delete).to.have.lengthOf(1);
    expect(result.results[0].deniedOperations.delete[0].errorMessage).to.equal(
      'errorMessage',
    );
  });

  it('should parse editingFieldDenied correctly', async () => {
    const input =
      'result("key1")\neditingFieldDenied("key1", "fieldName", "errorMessage")';
    const result = await parser.parseInput(input);
    expect(result.results[0].deniedOperations.editField).to.have.lengthOf(1);
    expect(result.results[0].deniedOperations.editField[0]).to.deep.equal({
      fieldName: 'fieldName',
      errorMessage: 'errorMessage',
    });
  });

  it('should parse editingContentDenied correctly', async () => {
    const input =
      'result("key1")\neditingContentDenied("key1", "errorMessage")';
    const result = await parser.parseInput(input);
    expect(result.results[0].deniedOperations.editContent).to.have.lengthOf(1);
    expect(
      result.results[0].deniedOperations.editContent[0].errorMessage,
    ).to.equal('errorMessage');
  });

  it('should parse policyCheckFailure correctly', async () => {
    const input =
      'result("key1")\npolicyCheckFailure("key1", "category", "title", "errorMessage")';
    const result = await parser.parseInput(input);
    expect(result.results[0].policyChecks.failures).to.have.lengthOf(1);
    expect(result.results[0].policyChecks.failures[0]).to.deep.equal({
      category: 'category',
      title: 'title',
      errorMessage: 'errorMessage',
    });
    expect(result.results[0].policyChecks.successes).to.have.lengthOf(0);
  });

  it('should parse policyCheckSuccess correctly', async () => {
    const input =
      'result("key1")\npolicyCheckSuccess("key1", "category", "title")';
    const result = await parser.parseInput(input);
    expect(result.results[0].policyChecks.successes).to.have.lengthOf(1);
    expect(result.results[0].policyChecks.successes[0]).to.deep.equal({
      category: 'category',
      title: 'title',
    });
    expect(result.results[0].policyChecks.failures).to.have.lengthOf(0);
  });

  it('should parse order correctly', async () => {
    const input = 'result("key1")\norder("1", "results", "0", "field", "ASC")';
    const result = await parser.parseInput(input);
    expect(result.results).to.have.lengthOf(1);
  });

  it('should handle multiple results correctly when sorting', async () => {
    const input = `
            result("key1")
            result("key2")
            field("key1", "field", "${encodeClingoValue('b')}", "shortText")
            field("key2", "field", "${encodeClingoValue('a')}", "shortText")
            order("1", "results", "0", "field", "ASC")`;
    const result = await parser.parseInput(input);

    expect(result.results).to.have.lengthOf(2);
    expect(result.results[0].field).to.equal('a');
    expect(result.results[1].field).to.equal('b');
  });

  it('should handle multiple results correctly when sorting in reverse', async () => {
    const input = `
            result("key1")
            result("key2")
            field("key1", "field", "${encodeClingoValue('a')}", "shortText")
            field("key2", "field", "${encodeClingoValue('b')}", "shortText")
            order("1", "results", "0", "field", "DESC")`;
    const result = await parser.parseInput(input);

    expect(result.results).to.have.lengthOf(2);
    expect(result.results[1].field).to.equal('a');
    expect(result.results[0].field).to.equal('b');
  });

  it('should handle order on multiple levels correctly', async () => {
    const input = `
        result("key1")
        childResult("key1", "key2", "results")
        field("key2", "field", "${encodeClingoValue('b')}", "shortText")
        childResult("key1", "key3", "results")
        field("key3", "field", "${encodeClingoValue('a')}", "shortText")
        childResult("key1", "key4", "results")
        field("key4", "field", "${encodeClingoValue('c')}", "shortText")
        order(2, "results", 1, "field", "ASC")
    `;

    const result: any = await parser.parseInput(input);
    expect(result.results).to.have.lengthOf(1);
    expect(result.results[0].results).to.have.lengthOf(3);
    expect(result.results[0].results[0].field).to.equal('a');
    expect(result.results[0].results[1].field).to.equal('b');
    expect(result.results[0].results[2].field).to.equal('c');
  });
  it('should handle order on multiple levels correctly in reverse', async () => {
    const input = `
        result("key1")
        childResult("key1", "key2", "results")
        field("key2", "field", "${encodeClingoValue('b')}", "shortText")
        childResult("key1", "key3", "results")
        field("key3", "field", "${encodeClingoValue('a')}", "shortText")
        childResult("key1", "key4", "results")
        field("key4", "field", "${encodeClingoValue('c')}", "shortText")
        order(2, "results", 1, "field", "DESC")
    `;

    const result: any = await parser.parseInput(input);
    expect(result.results).to.have.lengthOf(1);
    expect(result.results[0].results).to.have.lengthOf(3);
    expect(result.results[0].results[0].field).to.equal('c');
    expect(result.results[0].results[1].field).to.equal('b');
    expect(result.results[0].results[2].field).to.equal('a');
  });

  it('should handle oreder on 4th level correctly', async () => {
    const input = `
        result("key1")
        childResult("key1", "key2", "results")
        childResult("key2", "key3", "results")
        childResult("key3", "key4", "results")
        field("key4", "field", "${encodeClingoValue('b')}", "shortText")
        childResult("key3", "key5", "results")
        field("key5", "field", "${encodeClingoValue('a')}", "shortText")
        childResult("key3", "key6", "results")
        field("key6", "field", "${encodeClingoValue('c')}", "shortText")
        order(4, "results", 1, "field", "ASC")
    `;

    const result: any = await parser.parseInput(input);
    expect(result.results).to.have.lengthOf(1);
    expect(result.results[0].results).to.have.lengthOf(1);
    expect(result.results[0].results[0].results).to.have.lengthOf(1);
    expect(result.results[0].results[0].results[0].results).to.have.lengthOf(3);
    expect(result.results[0].results[0].results[0].results[0].field).to.equal(
      'a',
    );
    expect(result.results[0].results[0].results[0].results[1].field).to.equal(
      'b',
    );
    expect(result.results[0].results[0].results[0].results[2].field).to.equal(
      'c',
    );
  });

  it('should handle multiple commands correctly', async () => {
    const input = `
            result("key1")
            field("key1", "fieldName", "${encodeClingoValue('fieldValue')}", "shortText")
            label("key1", "label1")
            link("key1", "cardKey", "linkType", "linkDescription")
            transitionDenied("key1", "transitionName", "errorMessage")
            movingCardDenied("key1", "errorMessage")
            deletingCardDenied("key1", "errorMessage")
            editingFieldDenied("key1", "fieldName", "errorMessage")
            editingContentDenied("key1", "errorMessage")
            policyCheckFailure("key1", "category", "title", "errorMessage")
            policyCheckSuccess("key1", "category", "title")
            order("1", "results", "0", "field", "ASC")
        `;
    const result = await parser.parseInput(input);
    expect(result.results).to.have.lengthOf(1);
    const res = result.results[0];
    expect(res.fieldName).to.equal('fieldValue');
    expect(res.labels).to.include('label1');
    expect(res.links).to.have.lengthOf(1);
    expect(res.deniedOperations.transition).to.have.lengthOf(1);
    expect(res.deniedOperations.move).to.have.lengthOf(1);
    expect(res.deniedOperations.delete).to.have.lengthOf(1);
    expect(res.deniedOperations.editField).to.have.lengthOf(1);
    expect(res.deniedOperations.editContent).to.have.lengthOf(1);
    expect(res.policyChecks.failures).to.have.lengthOf(1);
    expect(res.policyChecks.successes).to.have.lengthOf(1);
  });
  it('should handle multiple parenthesis', async () => {
    const input = `
            result("key1")
            field("key1", "test", ("test", "testing something"), "shortText")
            field("key1", "test2", (("test1", test2), "testing something"), "shortText")
        `;
    const result = await parser.parseInput(input);
    expect(result.results).to.have.lengthOf(1);

    const res = result.results[0];

    expect(res.key).to.equal('key1');
    expect(res.test).to.equal('(test, testing something)');
    expect(res.test2).to.equal('((test1, test2), testing something)');
  });
});
