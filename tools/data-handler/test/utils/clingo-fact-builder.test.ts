import { expect } from 'chai';
import {
  ClingoFactBuilder,
  encodeClingoValue,
} from '../../src/utils/clingo-fact-builder.js';

describe('ClingoFactBuilder', () => {
  it('should generate fact with addArgument', () => {
    const builder = new ClingoFactBuilder('test');
    builder.addArgument('test2');
    expect(builder.build()).to.equal('test("test2").');
  });

  it('should generate fact with addArguments', () => {
    const builder = new ClingoFactBuilder('test');
    builder.addArguments('test2', 'test3');
    expect(builder.build()).to.equal('test("test2", "test3").');
  });

  it('should add a literal argument without quotes', () => {
    const builder = new ClingoFactBuilder('test');
    builder.addLiteralArgument('literal');
    expect(builder.build()).to.equal('test(literal).');
  });

  it('should add multiple literal arguments without quotes', () => {
    const builder = new ClingoFactBuilder('test');
    builder.addLiteralArguments('literal1', 'literal2');
    expect(builder.build()).to.equal('test(literal1, literal2).');
  });

  it('should handle boolean arguments correctly', () => {
    const builder = new ClingoFactBuilder('test');
    builder.addArguments(true, false);
    expect(builder.build()).to.equal('test(true, false).');
  });

  it('should handle number arguments correctly without quotes', () => {
    const builder = new ClingoFactBuilder('test');
    builder.addArgument(42);
    expect(builder.build()).to.equal('test(42).');
  });

  it('should handle nested ClingoFactBuilder instances as arguments', () => {
    const nestedBuilder = new ClingoFactBuilder('nested', '').addArgument(
      'inner',
    );
    const builder = new ClingoFactBuilder('test');
    builder.addArgument(nestedBuilder);
    expect(builder.build()).to.equal('test(nested("inner")).');
  });

  it('should handle mixed argument types', () => {
    const builder = new ClingoFactBuilder('test');
    builder.addArguments('string', 42, true, false);
    expect(builder.build()).to.equal('test("string", 42, true, false).');
  });

  it('should encode special characters in string arguments', () => {
    const builder = new ClingoFactBuilder('test');
    builder.addArgument('line\nbreak');
    expect(builder.build()).to.equal('test("line\\nbreak").');
  });

  it('should use encodeClingoValue to escape characters', () => {
    expect(encodeClingoValue('line\nbreak\\quote"')).to.equal(
      'line\\nbreak\\\\quote\\"',
    );
  });

  it('should handle array arguments correctly', () => {
    const builder = new ClingoFactBuilder('test');
    builder.addArgument(['item1', 'item2']);
    expect(builder.build()).to.equal('test("item1,item2").');
  });

  it('should handle a mix of arrays and single arguments', () => {
    const builder = new ClingoFactBuilder('test');
    builder.addArguments(['item1', 'item2'], 'single');
    expect(builder.build()).to.equal('test("item1,item2", "single").');
  });

  it('should correctly handle an empty predicate', () => {
    const builder = new ClingoFactBuilder('');
    builder.addArgument('test2');
    expect(builder.build()).to.equal('("test2").');
  });

  it('should correctly handle an empty end character', () => {
    const builder = new ClingoFactBuilder('test', '');
    builder.addArgument('test2');
    expect(builder.build()).to.equal('test("test2")');
  });

  it('should correctly handle no arguments', () => {
    const builder = new ClingoFactBuilder('noArgs');
    expect(builder.build()).to.equal('noArgs().');
  });

  it('should correctly add null arguments', () => {
    const builder = new ClingoFactBuilder('test');
    builder.addArguments(null, 'valid');
    expect(builder.build()).to.equal('test("valid").');
  });
});
