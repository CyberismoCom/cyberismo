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
  ['person', 'test3@cyberismo.com', 'test3@cyberismo.com'],
  ['date', new Date(100).toISOString(), new Date(100).toISOString()],
  ['dateTime', new Date(100).toISOString(), new Date(100).toISOString()],
  ['number', '4324.432', 4324.432],
  ['integer', '3242', 3242],
  ['boolean', 'true', true],
  ['boolean', 'false', false],
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
  it('should parse childResultCollection correctly', async () => {
    const input = `result("key1")\nchildResultCollection("key1", "list")`;
    const result = await parser.parseInput(input);
    expect(result.results[0].list).to.be.an('array');
    expect(result.results[0].list).to.have.lengthOf(0);
  });
  it('should parse childResultCollection correctly with items', async () => {
    const input = `result("key1")\nchildResultCollection("key1", "list")\nchildResult("key1", "item1", "list")\nfield("item1", "field", "${encodeClingoValue('item1')}", "shortText")`;
    const result: any = await parser.parseInput(input);
    expect(result.results[0].list).to.be.an('array');
    expect(result.results[0].list).to.have.lengthOf(1);
    expect(result.results[0].list[0].field).to.equal('item1');
  });
  it('should parse childResultCollection correctly with items in a stringList', async () => {
    const input = `result("key1")\nchildResultCollection("key1", "list")\nfield("key1", "list", "${encodeClingoValue('item1')}", "stringList")`;
    const result: any = await parser.parseInput(input);
    expect(result.results[0].list).to.be.an('array');
    expect(result.results[0].list).to.have.lengthOf(1);
    expect(result.results[0].list[0]).to.equal('item1');
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
            order("1", "results", "0", "field", "ASC")
        `;
    const result = await parser.parseInput(input);
    expect(result.results).to.have.lengthOf(1);
    const res = result.results[0];
    expect(res.fieldName).to.equal('fieldValue');
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

  describe('childObject', () => {
    it('should parse childObject correctly', async () => {
      const input = `
        result("parentKey")
        field("childKey", "name", "${encodeClingoValue('childName')}", "shortText")
        childObject("parentKey", "childKey", "child")
      `;
      const result: any = await parser.parseInput(input);
      expect(result.results).to.have.lengthOf(1);
      expect(result.results[0].key).to.equal('parentKey');
      expect(result.results[0].child).to.be.an('object');
      expect(result.results[0].child.key).to.equal('childKey');
      expect(result.results[0].child.name).to.equal('childName');
    });

    it('should handle multiple childObjects with different collections', async () => {
      const input = `
        result("parentKey")
        field("childKey1", "name", "${encodeClingoValue('child1')}", "shortText")
        field("childKey2", "name", "${encodeClingoValue('child2')}", "shortText")
        childObject("parentKey", "childKey1", "firstChild")
        childObject("parentKey", "childKey2", "secondChild")
      `;
      const result: any = await parser.parseInput(input);
      expect(result.results).to.have.lengthOf(1);
      expect(result.results[0].key).to.equal('parentKey');
      expect(result.results[0].firstChild).to.be.an('object');
      expect(result.results[0].secondChild).to.be.an('object');
      expect(result.results[0].firstChild.name).to.equal('child1');
      expect(result.results[0].secondChild.name).to.equal('child2');
    });

    it('should handle nested childObjects', async () => {
      const input = `
        result("grandparentKey")
        field("parentKey", "name", "${encodeClingoValue('parent')}", "shortText")
        field("childKey", "name", "${encodeClingoValue('child')}", "shortText")
        childObject("grandparentKey", "parentKey", "parent")
        childObject("parentKey", "childKey", "child")
      `;
      const result: any = await parser.parseInput(input);
      expect(result.results).to.have.lengthOf(1);
      expect(result.results[0].key).to.equal('grandparentKey');
      expect(result.results[0].parent).to.be.an('object');
      expect(result.results[0].parent.name).to.equal('parent');
      expect(result.results[0].parent.child).to.be.an('object');
      expect(result.results[0].parent.child.name).to.equal('child');
    });

    it('should handle childObject with complex field values', async () => {
      const input = `
        result("parentKey")
        field("childKey", "number", "42", "integer")
        field("childKey", "text", "${encodeClingoValue('complex\ntext')}", "shortText")
        field("childKey", "boolean", "true", "boolean")
        childObject("parentKey", "childKey", "child")
      `;
      const result: any = await parser.parseInput(input);
      expect(result.results).to.have.lengthOf(1);
      expect(result.results[0].child).to.be.an('object');
      expect(result.results[0].child.number).to.equal(42);
      expect(result.results[0].child.text).to.equal('complex\ntext');
      expect(result.results[0].child.boolean).to.equal(true);
    });

    it('should handle deeply nested childObject and childResult relationships', async () => {
      const input = `
        result("rootKey")
        field("rootKey", "name", "${encodeClingoValue('root')}", "shortText")
        
        field("objectKey", "name", "${encodeClingoValue('object')}", "shortText")
        childObject("rootKey", "objectKey", "mainObject")
        
        field("resultKey1", "name", "${encodeClingoValue('result1')}", "shortText")
        field("resultKey2", "name", "${encodeClingoValue('result2')}", "shortText")
        childResult("objectKey", "resultKey1", "results")
        childResult("objectKey", "resultKey2", "results")
        
        field("nestedObjectKey", "name", "${encodeClingoValue('nested')}", "shortText")
        childObject("resultKey1", "nestedObjectKey", "nestedObject")
      `;
      const result: any = await parser.parseInput(input);

      // Check root level
      expect(result.results).to.have.lengthOf(1);
      expect(result.results[0].key).to.equal('rootKey');
      expect(result.results[0].name).to.equal('root');

      // Check first level childObject
      expect(result.results[0].mainObject).to.be.an('object');
      expect(result.results[0].mainObject.name).to.equal('object');

      // Check second level childResult array
      expect(result.results[0].mainObject.results).to.be.an('array');
      expect(result.results[0].mainObject.results).to.have.lengthOf(2);
      expect(result.results[0].mainObject.results[0].name).to.equal('result1');
      expect(result.results[0].mainObject.results[1].name).to.equal('result2');

      // Check third level childObject
      expect(result.results[0].mainObject.results[0].nestedObject).to.be.an(
        'object',
      );
      expect(
        result.results[0].mainObject.results[0].nestedObject.name,
      ).to.equal('nested');
    });
  });
});
