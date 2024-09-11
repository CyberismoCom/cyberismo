import { expect } from 'chai';
import ClingoParser from '../../src/utils/clingo-parser.js';
import { Project } from '../../src/containers/project.js';

describe('ClingoParser', () => {
  const parser: ClingoParser = new ClingoParser({
    linkType: () => ({
      outboundDisplayName: 'testing',
    }),
  } as unknown as Project);

  it('should parse query_error correctly with 4 params', async () => {
    const input =
      'query_error("An error occurred", "param1", "param2", "param3", "param4")';
    const result = await parser.parseInput(input);
    expect(result.error).to.equal(
      'An error occurred param1, param2, param3, param4',
    );
  });

  it('should parse query_error correctly with 0 params', async () => {
    const input = 'query_error("An error occurred")';
    const result = await parser.parseInput(input);
    expect(result.error).to.equal('An error occurred');
  });

  it('should parse result correctly', async () => {
    const input = 'result("key1")';
    const result = await parser.parseInput(input);
    expect(result.results).to.have.lengthOf(1);
    expect(result.results[0].key).to.equal('key1');
  });

  it('should parse child_result correctly', async () => {
    const input = 'result("parentKey")\nchild_result("parentKey", "childKey")';
    const result = await parser.parseInput(input);
    expect(result.results).to.have.lengthOf(1);
    expect(result.results[0].key).to.equal('parentKey');
    expect(result.results[0].results).to.have.lengthOf(1);
    expect(result.results[0].results[0].key).to.equal('childKey');
  });

  it('should parse field correctly', async () => {
    const input = 'result("key1")\nfield("key1", "fieldName", "fieldValue")';
    const result = await parser.parseInput(input);
    expect(result.results[0].fieldName).to.equal('fieldValue');
  });

  it('should parse label correctly', async () => {
    const input = 'result("key1")\nlabel("key1", "label1")';
    const result = await parser.parseInput(input);
    expect(result.results[0].labels).to.include('label1');
  });

  it('should parse link correctly', async () => {
    const input =
      'result("key1")\nlink("key1", "cardKey", "linkType", "linkDescription")';
    const result = await parser.parseInput(input);
    expect(result.results[0].links).to.have.lengthOf(1);
    expect(result.results[0].links[0]).to.deep.equal({
      key: 'cardKey',
      linkType: 'linkType',
      displayName: 'testing',
      linkDescription: 'linkDescription',
    });
  });

  it('should parse link without linkDescription correctly', async () => {
    const input = 'result("key1")\nlink("key1", "cardKey", "linkType")';
    const result = await parser.parseInput(input);
    expect(result.results[0].links).to.have.lengthOf(1);
    expect(result.results[0].links[0]).to.deep.equal({
      key: 'cardKey',
      linkType: 'linkType',
      displayName: 'testing',
      linkDescription: undefined,
    });
  });

  it('should parse transition_denied correctly', async () => {
    const input =
      'result("key1")\ntransition_denied("key1", "transitionName", "errorMessage")';
    const result = await parser.parseInput(input);
    expect(result.results[0].deniedOperations.transition).to.have.lengthOf(1);
    expect(result.results[0].deniedOperations.transition[0]).to.deep.equal({
      transitionName: 'transitionName',
      errorMessage: 'errorMessage',
    });
  });

  it('should parse moving_card_denied correctly', async () => {
    const input = 'result("key1")\nmoving_card_denied("key1", "errorMessage")';
    const result = await parser.parseInput(input);
    expect(result.results[0].deniedOperations.move).to.have.lengthOf(1);
    expect(result.results[0].deniedOperations.move[0].errorMessage).to.equal(
      'errorMessage',
    );
  });

  it('should parse deleting_card_denied correctly', async () => {
    const input =
      'result("key1")\ndeleting_card_denied("key1", "errorMessage")';
    const result = await parser.parseInput(input);
    expect(result.results[0].deniedOperations.delete).to.have.lengthOf(1);
    expect(result.results[0].deniedOperations.delete[0].errorMessage).to.equal(
      'errorMessage',
    );
  });

  it('should parse editing_field_denied correctly', async () => {
    const input =
      'result("key1")\nediting_field_denied("key1", "fieldName", "errorMessage")';
    const result = await parser.parseInput(input);
    expect(result.results[0].deniedOperations.editField).to.have.lengthOf(1);
    expect(result.results[0].deniedOperations.editField[0]).to.deep.equal({
      fieldName: 'fieldName',
      errorMessage: 'errorMessage',
    });
  });

  it('should parse editing_content_denied correctly', async () => {
    const input =
      'result("key1")\nediting_content_denied("key1", "errorMessage")';
    const result = await parser.parseInput(input);
    expect(result.results[0].deniedOperations.editContent).to.have.lengthOf(1);
    expect(
      result.results[0].deniedOperations.editContent[0].errorMessage,
    ).to.equal('errorMessage');
  });

  it('should parse policy_check_failure correctly', async () => {
    const input =
      'result("key1")\npolicy_check_failure("key1", "testSuite", "testCase", "errorMessage")';
    const result = await parser.parseInput(input);
    expect(result.results[0].policyChecks.failures).to.have.lengthOf(1);
    expect(result.results[0].policyChecks.failures[0]).to.deep.equal({
      testSuite: 'testSuite',
      testCase: 'testCase',
      errorMessage: 'errorMessage',
    });
    expect(result.results[0].policyChecks.successes).to.have.lengthOf(0);
  });

  it('should parse policy_check_success correctly', async () => {
    const input =
      'result("key1")\npolicy_check_success("key1", "testSuite", "testCase")';
    const result = await parser.parseInput(input);
    expect(result.results[0].policyChecks.successes).to.have.lengthOf(1);
    expect(result.results[0].policyChecks.successes[0]).to.deep.equal({
      testSuite: 'testSuite',
      testCase: 'testCase',
    });
    expect(result.results[0].policyChecks.failures).to.have.lengthOf(0);
  });

  it('should parse order correctly', async () => {
    const input = 'result("key1")\norder("1", "0", "field", "ASC")';
    const result = await parser.parseInput(input);
    expect(result.results).to.have.lengthOf(1);
  });

  it('should handle multiple results correctly when sorting', async () => {
    const input = `
            result("key1")
            result("key2")
            field("key1", "field", "b")
            field("key2", "field", "a")
            order("1", "0", "field", "ASC")`;
    const result = await parser.parseInput(input);

    expect(result.results).to.have.lengthOf(2);
    expect(result.results[0].field).to.equal('a');
    expect(result.results[1].field).to.equal('b');
  });

  it('should handle multiple results correctly when sorting in reverse', async () => {
    const input = `
            result("key1")
            result("key2")
            field("key1", "field", "b")
            field("key2", "field", "a")
            order("1", "0", "field", "DESC")`;
    const result = await parser.parseInput(input);

    expect(result.results).to.have.lengthOf(2);
    expect(result.results[1].field).to.equal('a');
    expect(result.results[0].field).to.equal('b');
  });

  it('should handle order on multiple levels correctly', async () => {
    const input = `
        result("key1")
        child_result("key1", "key2")
        field("key2", "field", "b")
        child_result("key1", "key3")
        field("key3", "field", "a")
        child_result("key1", "key4")
        field("key4", "field", "c")
        order(2, 1, "field", "ASC")
    `;

    const result = await parser.parseInput(input);
    expect(result.results).to.have.lengthOf(1);
    expect(result.results[0].results).to.have.lengthOf(3);
    expect(result.results[0].results[0].field).to.equal('a');
    expect(result.results[0].results[1].field).to.equal('b');
    expect(result.results[0].results[2].field).to.equal('c');
  });
  it('should handle order on multiple levels correctly in reverse', async () => {
    const input = `
        result("key1")
        child_result("key1", "key2")
        field("key2", "field", "b")
        child_result("key1", "key3")
        field("key3", "field", "a")
        child_result("key1", "key4")
        field("key4", "field", "c")
        order(2, 1, "field", "DESC")
    `;

    const result = await parser.parseInput(input);
    expect(result.results).to.have.lengthOf(1);
    expect(result.results[0].results).to.have.lengthOf(3);
    expect(result.results[0].results[0].field).to.equal('c');
    expect(result.results[0].results[1].field).to.equal('b');
    expect(result.results[0].results[2].field).to.equal('a');
  });

  it('should handle oreder on 4th level correctly', async () => {
    const input = `
        result("key1")
        child_result("key1", "key2")
        child_result("key2", "key3")
        child_result("key3", "key4")
        field("key4", "field", "b")
        child_result("key3", "key5")
        field("key5", "field", "a")
        child_result("key3", "key6")
        field("key6", "field", "c")
        order(4, 1, "field", "ASC")
    `;

    const result = await parser.parseInput(input);
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
            field("key1", "fieldName", "fieldValue")
            label("key1", "label1")
            link("key1", "cardKey", "linkType", "linkDescription")
            transition_denied("key1", "transitionName", "errorMessage")
            moving_card_denied("key1", "errorMessage")
            deleting_card_denied("key1", "errorMessage")
            editing_field_denied("key1", "fieldName", "errorMessage")
            editing_content_denied("key1", "errorMessage")
            policy_check_failure("key1", "testSuite", "testCase", "errorMessage")
            policy_check_success("key1", "testSuite", "testCase")
            order("1", "0", "field", "ASC")
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
});
