// testing
import { expect } from 'chai';
import { describe, it } from 'mocha';

// ismo
import {
  createAdmonition,
  createHtmlPlaceholder,
  evaluateMacros,
  registerMacros,
  validateMacroContent,
} from '../../src/macros/index.js';
import { Validator } from 'jsonschema';
import Handlebars from 'handlebars';
import BaseMacro from '../../src/macros/base-macro.js';
import { MacroGenerationContext } from '../../src/interfaces/macros.js';
import TaskQueue from '../../src/macros/task-queue.js';

class TestMacro extends BaseMacro {
  constructor(schema: string) {
    super(
      {
        name: 'testName',
        tagName: 'test-tag-name',
        schema,
      },
      new TaskQueue(),
    );
  }

  handleValidate = async (data: { content: string }) => {
    return 'test-static: ' + data.content;
  };

  handleStatic = async (
    _: MacroGenerationContext,
    data: { content: string },
  ) => {
    return 'test-static: ' + data.content;
  };

  handleInject = async (
    _: MacroGenerationContext,
    data: { content: string },
  ) => {
    return 'test-static: ' + data?.content;
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
{{#createCards}}"buttonLabel": "test-label", "template": "test-template", "cardKey": "test-key"{{/createCards}}`;

const invalidAdoc = `
== Title
{{#createCards}} '{"buttonLabel": "test-label", "template": "test-template", "cardKey": "test-key"}'`;

describe('macros', () => {
  describe('validateMacroContent', () => {
    it('validateMacroContent (success)', () => {
      const data = { test: 'test' };
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
        const result = await evaluateMacros(validAdoc, {
          mode: 'inject',
          projectPath: '',
          cardKey: '',
        });
        expect(result).to.contain('<create-cards');
      });
      it('createCards static (success)', async () => {
        const result = await evaluateMacros(validAdoc, {
          mode: 'static',
          projectPath: '',
          cardKey: '',
        });
        expect(result).to.not.contain('<create-cards>');
      });
    });

    describe('scoreCard', () => {
      it('scoreCard inject (success)', async () => {
        const macro = `{{#scoreCard}}"title": "Scorecard", "value": 99, "unit": "%", "legend": "complete"{{/scoreCard}}`;
        const result = await evaluateMacros(macro, {
          mode: 'inject',
          projectPath: '',
          cardKey: '',
        });
        expect(result).to.contain('<score-card');
      });
      it('scoreCard static (success)', async () => {
        const macro = `{{#scoreCard}}"title": "Open issues", "value": 0 {{/scoreCard}}`;
        const result = await evaluateMacros(macro, {
          mode: 'static',
          projectPath: '',
          cardKey: '',
        });
        expect(result).to.contain('----');
      });
      it('raw macro (success)', async () => {
        const macro = `{{#scoreCard}}"title": "Open issues", "value": 0 {{/scoreCard}}`;
        const withRaw = `{{#raw}}${macro}{{/raw}}`;
        const result = await evaluateMacros(withRaw, {
          mode: 'static',
          projectPath: '',
          cardKey: '',
        });
        expect(result).to.equal(
          '{{#scoreCard}}"title": "Open issues", "value": 0 {{/scoreCard}}',
        );
      });
    });
  });
  describe('validate macros', () => {
    it('validate macros (success)', async () => {
      // this should not throw an error
      const result = await evaluateMacros(validAdoc, {
        mode: 'validate',
        projectPath: '',
        cardKey: '',
      });
      expect(result).to.not.equal(null);
    });
    it('validate macros - failure', async () => {
      try {
        // this should throw an error
        await evaluateMacros(invalidAdoc, {
          mode: 'validate',
          projectPath: '',
          cardKey: '',
        });
        expect(true).to.equal(false);
      } catch (error) {
        expect(error).to.not.equal(null);
      }
    });
  });
  describe('registerMacros', () => {
    it('registerMacros (success)', () => {
      const handlebars = Handlebars.create();
      registerMacros(
        handlebars,
        {
          mode: 'inject',
          projectPath: '',
          cardKey: '',
        },
        new TaskQueue(),
      );
      expect(handlebars.helpers).to.have.property('createCards');
      expect(handlebars.helpers).to.have.property('scoreCard');
      expect(handlebars.helpers).to.have.property('report');
    });
  });
  describe('adoc helpers', () => {
    it('createHtmlPlaceholder (success)', () => {
      const result = createHtmlPlaceholder(macro.metadata, {
        test: 'test-data',
      });
      expect(result).to.match(
        /^\n\+{4}\n<test-tag-name test="test-data" key="macro-\d+"><\/test-tag-name>\n\+{4}$/,
      );
    });
    it('createHtmlPlaceholder (success) without data', () => {
      // note: depends on the order of execution
      const result = createHtmlPlaceholder(macro.metadata, {});
      expect(result).to.match(
        /^\n\+{4}\n<test-tag-name key="macro-\d+"><\/test-tag-name>\n\+{4}$/,
      );
    });
    it('createAdmonition (success)', () => {
      const result = createAdmonition('WARNING', 'test-title', 'test-content');
      expect(result).to.equal(
        '[WARNING]\n.test-title\n====\ntest-content\n====\n\n',
      );
    });
  });
});
