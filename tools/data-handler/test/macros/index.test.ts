// testing
import { expect } from 'chai';
import { describe, it } from 'mocha';

import {
  createAdmonition,
  createHtmlPlaceholder,
  evaluateMacros,
  registerMacros,
  validateMacroContent,
} from '../../src/macros/index.js';
import { copyDir } from '../../src/utils/file-utils.js';
import { dirname, join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';
import { Validator } from 'jsonschema';
import Handlebars from 'handlebars';
import BaseMacro from '../../src/macros/base-macro.js';
import type { MacroGenerationContext } from '../../src/interfaces/macros.js';
import TaskQueue from '../../src/macros/task-queue.js';

import { Calculate } from '../../src/commands/index.js';
import { fileURLToPath } from 'node:url';
import { Project } from '../../src/containers/project.js';

const baseDir = dirname(fileURLToPath(import.meta.url));
const testDir = join(baseDir, 'tmp-calculate-tests');
const decisionRecordsPath = join(testDir, 'valid/decision-records');
let calculate: Calculate;
let project: Project;

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
    before(async () => {
      mkdirSync(testDir, { recursive: true });
      await copyDir('test/test-data/', testDir);
      project = new Project(decisionRecordsPath);
      calculate = new Calculate(project);
      await calculate.generate();
    });

    after(() => {
      setTimeout(() => {
        rmSync(testDir, { recursive: true, force: true });
      }, 5000);
    });
    describe('createCards', () => {
      it('createCards inject (success)', async () => {
        const result = await evaluateMacros(
          validAdoc,
          {
            mode: 'inject',
            project: project,
            cardKey: '',
          },
          calculate,
        );
        expect(result).to.contain('<create-cards');
      });
      it('createCards static (success)', async () => {
        const result = await evaluateMacros(
          validAdoc,
          {
            mode: 'static',
            project: project,
            cardKey: '',
          },
          calculate,
        );
        expect(result).to.not.contain('<create-cards>');
      });
    });
    describe('scoreCard', () => {
      it('scoreCard inject (success)', async () => {
        const macro = `{{#scoreCard}}"title": "Scorecard", "value": 99, "unit": "%", "legend": "complete"{{/scoreCard}}`;
        const result = await evaluateMacros(
          macro,
          {
            mode: 'inject',
            project: project,
            cardKey: '',
          },
          calculate,
        );
        expect(result).to.contain('<score-card');
      });
      it('scoreCard static (success)', async () => {
        const macro = `{{#scoreCard}}"title": "Open issues", "value": 0 {{/scoreCard}}`;
        const result = await evaluateMacros(
          macro,
          {
            mode: 'static',
            project: project,
            cardKey: '',
          },
          calculate,
        );
        expect(result).to.contain('----');
      });
      it('raw macro (success)', async () => {
        const macro = `{{#scoreCard}}"title": "Open issues", "value": 0 {{/scoreCard}}`;
        const withRaw = `{{#raw}}${macro}{{/raw}}`;
        const result = await evaluateMacros(
          withRaw,
          {
            mode: 'static',
            project: project,
            cardKey: '',
          },
          calculate,
        );
        expect(result).to.equal(
          '{{#scoreCard}}"title": "Open issues", "value": 0 {{/scoreCard}}',
        );
      });
      it('raw macro with handlebars helpers (success)', async () => {
        const handlebarsContent = `{{#each results}}

* {{this.title}}
{{/each}}`;
        const withRaw = `{{#raw}}${handlebarsContent}{{/raw}}`;
        const result = await evaluateMacros(
          withRaw,
          {
            mode: 'static',
            project: project,
            cardKey: '',
          },
          calculate,
        );
        expect(result).to.equal(handlebarsContent);
      });
      it('raw macro with mixed content (success)', async () => {
        const mixedContent = `{{#each results}}
* {{this.title}}
{{/each}}

{{#scoreCard}}"title": "Test", "value": 42{{/scoreCard}}

{{#if condition}}
  This is conditional
{{/if}}`;
        const withRaw = `{{#raw}}${mixedContent}{{/raw}}`;
        const result = await evaluateMacros(
          withRaw,
          {
            mode: 'static',
            project: project,
            cardKey: '',
          },
          calculate,
        );
        expect(result).to.equal(mixedContent);
      });
      it('nested raw macros should preserve inner raw tags as literal text', async () => {
        const nestedContent = `{{#raw}}
Outer content
{{#raw}}
Inner content
{{/raw}}
More outer content
{{/raw}}`;
        const expectedResult = `
Outer content
{{#raw}}
Inner content
{{/raw}}
More outer content
`;
        const result = await evaluateMacros(
          nestedContent,
          {
            mode: 'static',
            project: project,
            cardKey: '',
          },
          calculate,
        );
        expect(result).to.equal(expectedResult);
      });
    });
  });
  describe('validate macros', () => {
    before(async () => {
      mkdirSync(testDir, { recursive: true });
      await copyDir('test/test-data/', testDir);
      project = new Project(decisionRecordsPath);
      calculate = new Calculate(project);
      await calculate.generate();
    });

    after(() => {
      setTimeout(() => {
        rmSync(testDir, { recursive: true, force: true });
      }, 5000);
    });
    it('validate macros (success)', async () => {
      // this should not throw an error
      const result = await evaluateMacros(
        validAdoc,
        {
          mode: 'validate',
          project: project,
          cardKey: '',
        },
        calculate,
      );
      expect(result).to.not.equal(null);
    });
    it('validate macros - failure', async () => {
      await expect(
        evaluateMacros(
          invalidAdoc,
          {
            mode: 'validate',
            project: project,
            cardKey: '',
          },
          calculate,
        ),
      ).to.be.rejected;
    });
  });
  describe('registerMacros', () => {
    it('registerMacros (success)', () => {
      const handlebars = Handlebars.create();
      registerMacros(
        handlebars,
        {
          mode: 'inject',
          project: project,
          cardKey: '',
        },
        new TaskQueue(),
        calculate,
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
        /^\n\+{3}\n<test-tag-name test="test-data" key="macro-\d+"><\/test-tag-name>\n\+{3}\n$/,
      );
    });
    it('createHtmlPlaceholder (success) without data', () => {
      // note: depends on the order of execution
      const result = createHtmlPlaceholder(macro.metadata, {});
      expect(result).to.match(
        /^\n\+{3}\n<test-tag-name key="macro-\d+"><\/test-tag-name>\n\+{3}\n$/,
      );
    });
    it('createHtmlPlaceholder with nested objects (dot notation)', () => {
      const result = createHtmlPlaceholder(macro.metadata, {
        key: 'test',
        anotherKey: {
          key1: 'test',
          key2: 'test2',
          nested: {
            deepValue: 'deep',
          },
        },
      });

      expect(result).to.contain('key="test"');
      expect(result).to.contain('anotherKey.key1="test"');
      expect(result).to.contain('anotherKey.key2="test2"');
      expect(result).to.contain('anotherKey.nested.deepValue="deep"');
    });
    it('createAdmonition (success)', () => {
      const result = createAdmonition('WARNING', 'test-title', 'test-content');
      expect(result).to.equal(
        '[WARNING]\n.test-title\n====\ntest-content\n====\n\n',
      );
    });
  });
});
