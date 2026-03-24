import { expect, describe, it } from 'vitest';
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

  it.each(encodingTests)(
    'should encode special value %s to %s',
    (input, expected) => {
      expect(encodeClingoValue(input)).toBe(expected);
    },
  );

  it.each(encodingTests)(
    'should decode special value %s to %s',
    (input, expected) => {
      expect(decodeClingoValue(expected)).toBe(input);
    },
  );

  it('should parse query_error correctly with 4 params', async () => {
    const input =
      'queryError("An error occurred", "param1", "param2", "param3", "param4")';
    const result = await parser.parseInput(input);
    expect(result.error).toBe(
      'An error occurred param1, param2, param3, param4',
    );
  });

  it('should parse query_error correctly with 0 params', async () => {
    const input = 'queryError("An error occurred")';
    const result = await parser.parseInput(input);
    expect(result.error).toBe('An error occurred');
  });

  it('should parse result correctly', async () => {
    const input = 'result("key1")';
    const result = await parser.parseInput(input);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].key).toBe('key1');
  });

  it('should parse childResult correctly', async () => {
    const input =
      'result("parentKey")\nchildResult("parentKey", "childKey", "results")';
    const result: any = await parser.parseInput(input);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].key).toBe('parentKey');
    expect(result.results[0].results).toHaveLength(1);
    expect(result.results[0].results[0].key).toBe('childKey');
  });

  it('should parse childResult correctly with different collection', async () => {
    const input =
      'result("parentKey")\nchildResult("parentKey", "childKey", "results2")';
    const result: any = await parser.parseInput(input);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].key).toBe('parentKey');
    expect(result.results[0].results2).toHaveLength(1);
    expect(result.results[0].results2[0].key).toBe('childKey');
  });

  it('should parse field correctly', async () => {
    const input = `result("key1")\nfield("key1", "fieldName", "${encodeClingoValue('fieldValue')}", "shortText")`;
    const result = await parser.parseInput(input);
    expect(result.results[0].fieldName).toBe('fieldValue');
  });

  fieldTypeTests.forEach((test) => {
    const [type, value, expected] = test;
    it(`should parse field with type ${type} correctly`, async () => {
      const fieldValue = encodeClingoValue(value.toString());
      const input = `result("key1")\nfield("key1", "fieldName", "${fieldValue}", "${type}")`;
      const result = await parser.parseInput(input);
      expect(result.results[0].fieldName).toEqual(expected);
    });
  });
  it('should parse field correctly which has special characters', async () => {
    const fieldValue = 'fieldValueä)"()="()()()=\n';
    const input = `result("key1")\nfield("key1", "fieldName", "${encodeClingoValue(fieldValue)}", "shortText")`;
    const result = await parser.parseInput(input);
    expect(result.results[0].fieldName).toBe(fieldValue);
  });

  it('should parse field correctly when last argument is an empty string', async () => {
    const fieldValue = '';
    const input = `result("key1")\nfield("key1", "fieldName", "${encodeClingoValue(fieldValue)}", "shortText")`;
    const result = await parser.parseInput(input);
    expect(result.results[0].fieldName).toBe(fieldValue);
  });
  it('should parse childResultCollection correctly', async () => {
    const input = `result("key1")\nchildResultCollection("key1", "list")`;
    const result = await parser.parseInput(input);
    expect(result.results[0].list).toBeInstanceOf(Array);
    expect(result.results[0].list).toHaveLength(0);
  });
  it('should parse childResultCollection correctly with items', async () => {
    const input = `result("key1")\nchildResultCollection("key1", "list")\nchildResult("key1", "item1", "list")\nfield("item1", "field", "${encodeClingoValue('item1')}", "shortText")`;
    const result: any = await parser.parseInput(input);
    expect(result.results[0].list).toBeInstanceOf(Array);
    expect(result.results[0].list).toHaveLength(1);
    expect(result.results[0].list[0].field).toBe('item1');
  });
  it('should parse childResultCollection correctly with items in a stringList', async () => {
    const input = `result("key1")\nchildResultCollection("key1", "list")\nfield("key1", "list", "${encodeClingoValue('item1')}", "stringList")`;
    const result: any = await parser.parseInput(input);
    expect(result.results[0].list).toBeInstanceOf(Array);
    expect(result.results[0].list).toHaveLength(1);
    expect(result.results[0].list[0]).toBe('item1');
  });

  it('should parse order correctly', async () => {
    const input = 'result("key1")\norder("1", "results", "0", "field", "ASC")';
    const result = await parser.parseInput(input);
    expect(result.results).toHaveLength(1);
  });

  it('should handle multiple results correctly when sorting', async () => {
    const input = `
            result("key1")
            result("key2")
            field("key1", "field", "${encodeClingoValue('b')}", "shortText")
            field("key2", "field", "${encodeClingoValue('a')}", "shortText")
            order("1", "results", "0", "field", "ASC")`;
    const result = await parser.parseInput(input);

    expect(result.results).toHaveLength(2);
    expect(result.results[0].field).toBe('a');
    expect(result.results[1].field).toBe('b');
  });

  it('should handle multiple results correctly when sorting in reverse', async () => {
    const input = `
            result("key1")
            result("key2")
            field("key1", "field", "${encodeClingoValue('a')}", "shortText")
            field("key2", "field", "${encodeClingoValue('b')}", "shortText")
            order("1", "results", "0", "field", "DESC")`;
    const result = await parser.parseInput(input);

    expect(result.results).toHaveLength(2);
    expect(result.results[1].field).toBe('a');
    expect(result.results[0].field).toBe('b');
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
    expect(result.results).toHaveLength(1);
    expect(result.results[0].results).toHaveLength(3);
    expect(result.results[0].results[0].field).toBe('a');
    expect(result.results[0].results[1].field).toBe('b');
    expect(result.results[0].results[2].field).toBe('c');
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
    expect(result.results).toHaveLength(1);
    expect(result.results[0].results).toHaveLength(3);
    expect(result.results[0].results[0].field).toBe('c');
    expect(result.results[0].results[1].field).toBe('b');
    expect(result.results[0].results[2].field).toBe('a');
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
    expect(result.results).toHaveLength(1);
    expect(result.results[0].results).toHaveLength(1);
    expect(result.results[0].results[0].results).toHaveLength(1);
    expect(result.results[0].results[0].results[0].results).toHaveLength(3);
    expect(result.results[0].results[0].results[0].results[0].field).toBe('a');
    expect(result.results[0].results[0].results[0].results[1].field).toBe('b');
    expect(result.results[0].results[0].results[0].results[2].field).toBe('c');
  });

  it('should handle multiple commands correctly', async () => {
    const input = `
            result("key1")
            field("key1", "fieldName", "${encodeClingoValue('fieldValue')}", "shortText")
            order("1", "results", "0", "field", "ASC")
        `;
    const result = await parser.parseInput(input);
    expect(result.results).toHaveLength(1);
    const res = result.results[0];
    expect(res.fieldName).toBe('fieldValue');
  });
  it('should handle multiple parenthesis', async () => {
    const input = `
            result("key1")
            field("key1", "test", ("test", "testing something"), "shortText")
            field("key1", "test2", (("test1", test2), "testing something"), "shortText")
        `;
    const result = await parser.parseInput(input);
    expect(result.results).toHaveLength(1);

    const res = result.results[0];

    expect(res.key).toBe('key1');
    expect(res.test).toBe('(test, testing something)');
    expect(res.test2).toBe('((test1, test2), testing something)');
  });

  describe('childObject', () => {
    it('should parse childObject correctly', async () => {
      const input = `
        result("parentKey")
        field("childKey", "name", "${encodeClingoValue('childName')}", "shortText")
        childObject("parentKey", "childKey", "child")
      `;
      const result: any = await parser.parseInput(input);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].key).toBe('parentKey');
      expect(result.results[0].child).toBeTypeOf('object');
      expect(result.results[0].child.key).toBe('childKey');
      expect(result.results[0].child.name).toBe('childName');
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
      expect(result.results).toHaveLength(1);
      expect(result.results[0].key).toBe('parentKey');
      expect(result.results[0].firstChild).toBeTypeOf('object');
      expect(result.results[0].secondChild).toBeTypeOf('object');
      expect(result.results[0].firstChild.name).toBe('child1');
      expect(result.results[0].secondChild.name).toBe('child2');
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
      expect(result.results).toHaveLength(1);
      expect(result.results[0].key).toBe('grandparentKey');
      expect(result.results[0].parent).toBeTypeOf('object');
      expect(result.results[0].parent.name).toBe('parent');
      expect(result.results[0].parent.child).toBeTypeOf('object');
      expect(result.results[0].parent.child.name).toBe('child');
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
      expect(result.results).toHaveLength(1);
      expect(result.results[0].child).toBeTypeOf('object');
      expect(result.results[0].child.number).toBe(42);
      expect(result.results[0].child.text).toBe('complex\ntext');
      expect(result.results[0].child.boolean).toBe(true);
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
      expect(result.results).toHaveLength(1);
      expect(result.results[0].key).toBe('rootKey');
      expect(result.results[0].name).toBe('root');

      // Check first level childObject
      expect(result.results[0].mainObject).toBeTypeOf('object');
      expect(result.results[0].mainObject.name).toBe('object');

      // Check second level childResult array
      expect(result.results[0].mainObject.results).toBeInstanceOf(Array);
      expect(result.results[0].mainObject.results).toHaveLength(2);
      expect(result.results[0].mainObject.results[0].name).toBe('result1');
      expect(result.results[0].mainObject.results[1].name).toBe('result2');

      // Check third level childObject
      expect(result.results[0].mainObject.results[0].nestedObject).toBeTypeOf(
        'object',
      );
      expect(result.results[0].mainObject.results[0].nestedObject.name).toBe(
        'nested',
      );
    });
  });
});
