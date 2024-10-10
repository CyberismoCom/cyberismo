// testing
import { expect } from 'chai';
import { describe, it } from 'mocha';

// ismo
import {
  createAdmonition,
  createHtmlPlaceholder,
  handleMacros,
  registerMacros,
  validateMacroContent,
  validateMacros,
} from '../../src/macros/index.js';
import { Validator } from 'jsonschema';
import Handlebars from 'handlebars';
import BaseMacro from '../../src/macros/BaseMacro.js';
import { MacroGenerationContext } from '../../src/macros/common.js';

class TestMacro extends BaseMacro {
  constructor(schema: string) {
    super({
      name: 'testName',
      tagName: 'test-tag-name',
      schema,
    });
  }

  handleStatic = async (_: MacroGenerationContext, data: string) => {
    return 'test-static: ' + data;
  };

  handleInject = async (_: MacroGenerationContext, data: string) => {
    return 'test-static: ' + data;
  };
}

const macro = new TestMacro('test-schema');
const macroMissingSchema = new TestMacro('wrong-schema');

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
      const result = validateMacroContent(macro.metadata, data, validator);
      expect(result).to.deep.equal({ test: 'test' });
    });
    it('try validateMacroContent using wrong value', () => {
      const data = '{"test": 1}';
      expect(() =>
        validateMacroContent(macro.metadata, data, validator),
      ).to.throw();
    });
    it('try validateMacroContent using wrong schema', () => {
      const data = '{"test": "test"}';
      expect(() =>
        validateMacroContent(macroMissingSchema.metadata, data, validator),
      ).to.throw();
    });
    it('try validateMacroContent using wrong data', () => {
      const data = '{"test": "test"';
      expect(() =>
        validateMacroContent(macro.metadata, data, validator),
      ).to.throw();
    });
    it('try validateMacroContent using wrong key', () => {
      const data = '{"test2": "test"}';
      expect(() =>
        validateMacroContent(macro.metadata, data, validator),
      ).to.throw();
    });
  });
  describe('handleMacros', () => {
    describe('createCards', () => {
      it('createCards inject (success)', async () => {
        const result = await handleMacros(validAdoc, {
          mode: 'inject',
          projectPath: '',
          cardKey: '',
        });
        expect(result).to.contain('<create-cards');
      });
      it('createCards static (success)', async () => {
        const result = await handleMacros(validAdoc, {
          mode: 'static',
          projectPath: '',
          cardKey: '',
        });
        expect(result).to.not.contain('<create-cards>');
      });
    });
  });
  describe('validateMacros', () => {
    it('validateMacros (success)', () => {
      const result = validateMacros(validAdoc);
      expect(result).to.equal(null);
    });
    it('try validateMacros', () => {
      const result = validateMacros(invalidAdoc);
      expect(result).to.not.equal(null);
    });
  });
  describe('registerMacros', () => {
    it('registerMacros (success)', () => {
      const handlebars = Handlebars.create();
      registerMacros(handlebars, {
        mode: 'inject',
        projectPath: '',
        cardKey: '',
      });
      expect(handlebars.helpers).to.have.property('createCards');
      expect(handlebars.helpers).to.have.property('report');
    });
  });
  describe('adoc helpers', () => {
    it('createHtmlPlaceholder (success)', () => {
      const result = createHtmlPlaceholder(macro.metadata, {
        test: 'test-data',
      });
      expect(result).to.equal(
        '++++\n<test-tag-name test="test-data"></test-tag-name>\n++++',
      );
    });
    it('createHtmlPlaceholder (success) without data', () => {
      const result = createHtmlPlaceholder(macro.metadata, {});
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
