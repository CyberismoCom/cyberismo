// testing
import { expect } from 'chai';
import { describe, it } from 'mocha';

// ismo
import {
  createAdmonition,
  createHtmlPlaceholder,
  handleMacros,
  Macro,
  registerMacros,
  validateMacroContent,
  validateMacros,
} from '../../../src/utils/macros/index.js';
import { Validator } from 'jsonschema';
import Handlebars from 'handlebars';

const macro: Macro = {
  name: 'testName',
  tagName: 'test-tag-name',
  schema: 'test-schema',
  handleStatic: (data: string) => {
    return 'test-static: ' + data;
  },
  handleInject: (data: string) => {
    return 'test-inject: ' + data;
  },
};

const testSchema = {
  $id: 'test-schema',
  type: 'object',
  properties: {
    test: {
      type: 'string',
    },
  },
  required: ['test'],
};

const validator = new Validator();
validator.addSchema(testSchema, 'test-schema');

const validAdoc = `
== Title
{{{createCards '{"buttonLabel": "test-label", "template": "test-template", "cardKey": "test-key"}'}}}`;

const invalidAdoc = `
== Title
{{{createCards '{"buttonLabel": "test-label", "template": "test-template", "cardKey": "test-key"}'`;

describe('macros', () => {
  describe('validateMacroContent', () => {
    it('validateMacroContent (success)', () => {
      const data = '{"test": "test"}';
      const result = validateMacroContent(macro, data, validator);
      expect(result).to.deep.equal({ test: 'test' });
    });
    it('try validateMacroContent using wrong value', () => {
      const data = '{"test": 1}';
      expect(() => validateMacroContent(macro, data, validator)).to.throw();
    });
    it('try validateMacroContent using wrong schema', () => {
      const data = '{"test": "test"}';
      macro.schema = 'wrong-schema';
      expect(() => validateMacroContent(macro, data, validator)).to.throw();
    });
    it('try validateMacroContent using wrong data', () => {
      const data = '{"test": "test"';
      expect(() => validateMacroContent(macro, data, validator)).to.throw();
    });
    it('try validateMacroContent using wrong key', () => {
      const data = '{"test2": "test"}';
      expect(() => validateMacroContent(macro, data, validator)).to.throw();
    });
  });
  describe('handleMacros', () => {
    describe('createCards', () => {
      it('createCards inject (success)', () => {
        const result = handleMacros(validAdoc, 'inject');
        expect(result).to.contain('<create-cards');
      });
      it('createCards static (success)', () => {
        const result = handleMacros(validAdoc, 'static');
        expect(result).to.not.contain('<create-cards>');
      });
    });
  });
  describe('validateMacros', () => {
    it('validateMacros (success)', () => {
      const result = validateMacros(validAdoc);
      expect(result).to.be.null;
    });
    it('try validateMacros', () => {
      const result = validateMacros(invalidAdoc);
      expect(result).to.not.be.null;
    });
  });
  describe('registerMacros', () => {
    it('registerMacros (success)', () => {
      const handlebars = Handlebars.create();
      registerMacros(handlebars, 'inject');
      expect(handlebars.helpers).to.have.property('createCards');
    });
  });
  describe('adoc helpers', () => {
    it('createHtmlPlaceholder (success)', () => {
      const result = createHtmlPlaceholder(macro, { test: 'test-data' });
      expect(result).to.equal(
        '++++\n<test-tag-name test="test-data"></test-tag-name>\n++++',
      );
    });
    it('createHtmlPlaceholder (success) without data', () => {
      const result = createHtmlPlaceholder(macro, {});
      expect(result).to.equal('++++\n<test-tag-name></test-tag-name>\n++++');
    });
    it('createAdmonition (success)', () => {
      const result = createAdmonition('WARNING', 'test-title', 'test-content');
      expect(result).to.equal(
        '[WARNING]\n.test-title\n====\ntest-content\n====\n\n',
      );
    });
  });
});
