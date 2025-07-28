// testing
import { expect } from 'chai';
import { describe, it } from 'mocha';
import { stub } from 'sinon';

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
import type { Mode } from '../../src/interfaces/macros.js';
import type { Card } from '../../src/interfaces/project-interfaces.js';
import { MAX_LEVEL_OFFSET } from '../../src/utils/constants.js';

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
            context: 'localApp',
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
            context: 'localApp',
          },
          calculate,
        );
        expect(result).to.not.contain('<create-cards>');
      });
    });
    describe('raw', () => {
      it('raw macro (success)', async () => {
        const macro = `{{#scoreCard}}"title": "Open issues", "value": 0 {{/scoreCard}}`;
        const withRaw = `{{#raw}}${macro}{{/raw}}`;
        const result = await evaluateMacros(
          withRaw,
          {
            mode: 'static',
            project: project,
            cardKey: '',
            context: 'localApp',
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
            context: 'localApp',
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
            context: 'localApp',
          },
          calculate,
        );
        expect(result).to.equal(mixedContent);
      });
      it('content should be able to contain multiple raw blocks', async () => {
        const nestedContent = `{{#raw}}RawContent1{{/raw}}
{{#raw}}RawContent2{{/raw}}
{{#raw}}RawContent3{{/raw}}`;
        const expectedResult = `RawContent1
RawContent2
RawContent3`;
        const result = await evaluateMacros(
          nestedContent,
          {
            mode: 'static',
            project: project,
            cardKey: '',
            context: 'localApp',
          },
          calculate,
        );
        expect(result).to.equal(expectedResult);
      });
      it('nested raw macros should return error with line numbers', async () => {
        const nestedContent = `{{#raw}}
Outer content
{{#raw}}
Inner content
{{/raw}}
More outer content
{{/raw}}`;
        const result = await evaluateMacros(
          nestedContent,
          {
            mode: 'static',
            project: project,
            cardKey: '',
            context: 'localApp',
          },
          calculate,
        );
        expect(result).to.contain(
          'Nested {{#raw}} blocks are not supported. Found nested raw block inside another raw block on line 3 (original raw block started on line 1).',
        );
      });
      it('unclosed raw block should return error with line number', async () => {
        const unclosedContent = `{{#raw}}
This raw block has no closing tag
Some content here`;
        const result = await evaluateMacros(
          unclosedContent,
          {
            mode: 'static',
            project: project,
            cardKey: '',
            context: 'localApp',
          },
          calculate,
        );
        expect(result).to.contain(
          'Unclosed {{#raw}} block found on line 1. Every {{#raw}} must have a matching {{/raw}}.',
        );
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
            context: 'localApp',
          },
          calculate,
        );
        expect(result).to.contain('<svg');
      });
      it('scoreCard static (success)', async () => {
        const macro = `{{#scoreCard}}"title": "Open issues", "value": 0 {{/scoreCard}}`;
        const result = await evaluateMacros(
          macro,
          {
            mode: 'static',
            project: project,
            cardKey: '',
            context: 'localApp',
          },
          calculate,
        );
        expect(result).to.contain('<svg');
      });
    });
    describe('percentage', () => {
      it('percentage inject (success)', async () => {
        const macro = `{{#percentage}}"title": "Test Percentage", "value": 85, "legend": "of Assets", "colour": "red"{{/percentage}}`;
        const result = await evaluateMacros(
          macro,
          {
            mode: 'inject',
            project: project,
            cardKey: '',
            context: 'localApp',
          },
          calculate,
        );
        expect(result).to.contain('<svg');
        expect(result).to.contain('Test Percentage');
        expect(result).to.contain('85%');
      });
      it('percentage static (success)', async () => {
        const macro = `{{#percentage}}"title": "Static Percentage", "value": 42, "legend": "done", "colour": "green"{{/percentage}}`;
        const result = await evaluateMacros(
          macro,
          {
            mode: 'static',
            project: project,
            cardKey: '',
            context: 'localApp',
          },
          calculate,
        );
        expect(result).to.contain('<svg');
        expect(result).to.contain('Static Percentage');
        expect(result).to.contain('42%');
      });
      it('percentage missing title (failure)', async () => {
        const macro = `{{#percentage}}"value": 50, "legend": "missing title"{{/percentage}}`;
        const result = await evaluateMacros(
          macro,
          {
            mode: 'static',
            project: project,
            cardKey: '',
            context: 'localApp',
          },
          calculate,
        );
        expect(result).to.contain('Macro Error');
        expect(result).to.contain('title');
      });
      it('percentage missing value (failure)', async () => {
        const macro = `{{#percentage}}"title": "No Value", "legend": "No Value"{{/percentage}}`;
        const result = await evaluateMacros(
          macro,
          {
            mode: 'static',
            project: project,
            cardKey: '',
            context: 'localApp',
          },
          calculate,
        );
        expect(result).to.contain('Macro Error');
        expect(result).to.contain('value');
      });
      it('percentage missing legend (failure)', async () => {
        const macro = `{{#percentage}}"title": "No Legend", "value": 10{{/percentage}}`;
        const result = await evaluateMacros(
          macro,
          {
            mode: 'static',
            project: project,
            cardKey: '',
            context: 'localApp',
          },
          calculate,
        );
        expect(result).to.contain('Macro Error');
        expect(result).to.contain('legend');
      });
      it('percentage value as string (failure)', async () => {
        const macro = `{{#percentage}}"title": "String Value", "value": "not a number", "legend": "fail"{{/percentage}}`;
        const result = await evaluateMacros(
          macro,
          {
            mode: 'static',
            project: project,
            cardKey: '',
            context: 'localApp',
          },
          calculate,
        );
        expect(result).to.contain('Macro Error');
        expect(result).to.contain('is not of a type');
      });
      it('percentage malformed JSON (failure)', async () => {
        const macro = `{{#percentage}}"title": "Malformed", "value": 10, "legend": "fail"`;
        const result = await evaluateMacros(
          macro,
          {
            mode: 'static',
            project: project,
            cardKey: '',
            context: 'localApp',
          },
          calculate,
        );
        expect(result).to.contain('Macro Error');
      });
    });
    describe('includeMacro', () => {
      let cardDetailsByIdStub: sinon.SinonStub;
      beforeEach(async () => {
        cardDetailsByIdStub = stub(project, 'cardDetailsById');

        const baseCard: Card = {
          key: '',
          path: '',
          content: '',
          metadata: {
            title: '',
            cardType: '',
            workflowState: '',
            rank: '',
            links: [],
          },
          children: [],
          attachments: [],
        };

        const testCard = structuredClone(baseCard);
        testCard.key = 'test-card';
        testCard.content =
          'This is test content for the included card.\n\n== Test subtitle\n\nCard key: {{cardKey}}';
        testCard.metadata!.title = 'Test Card Title';

        cardDetailsByIdStub.withArgs('test-card').resolves(testCard);

        const testCardNested = structuredClone(baseCard);
        testCardNested.key = 'testCardNested';
        testCardNested.content =
          'This is the parent card.\n\n{{#include}}"cardKey": "test-card"{{/include}}\n\nEnd of parent card.';
        testCardNested.metadata!.title = 'Parent Card with Include';
        cardDetailsByIdStub.withArgs('testCardNested').resolves(testCardNested);

        const testCardNestedWithOffset = structuredClone(baseCard);
        testCardNestedWithOffset.key = 'testCardNestedWithOffset';
        testCardNestedWithOffset.content =
          'This is the parent card.\n\n{{#include}}"cardKey": "test-card", "levelOffset": "+1"{{/include}}\n\nEnd of parent card.';
        testCardNestedWithOffset.metadata!.title = 'Parent Card with Include';

        cardDetailsByIdStub
          .withArgs('testCardNestedWithOffset')
          .resolves(testCardNestedWithOffset);
      });
      afterEach(() => {
        cardDetailsByIdStub.restore();
      });
      ['static', 'inject'].forEach((mode) => {
        it(`includeMacro ${mode} (success)`, async () => {
          try {
            const macro = `{{#include}}"cardKey": "test-card"{{/include}}`;
            const result = await evaluateMacros(
              macro,
              {
                mode: mode as Mode,
                project: project,
                cardKey: '',
                context: 'localApp',
              },
              calculate,
            );

            expect(result).to.contain('= Test Card Title');
            expect(result).to.contain(
              'This is test content for the included card.',
            );
            expect(result).to.contain('== Test subtitle');
            expect(cardDetailsByIdStub.calledWith('test-card')).to.equal(true);
          } finally {
            cardDetailsByIdStub.restore();
          }
        });
      });
      it('includeMacro with level offset (success)', async () => {
        const macro = `{{#include}}"cardKey": "test-card", "levelOffset": "+1"{{/include}}`;
        const result = await evaluateMacros(
          macro,
          {
            mode: 'static',
            project: project,
            cardKey: '',
            context: 'localApp',
          },
          calculate,
        );
        expect(result).to.contain('== Test Card Title');
        expect(result).to.contain('=== Test subtitle');
      });
      it('includeMacro with negative level offset (success)', async () => {
        const macro = `{{#include}}"cardKey": "test-card", "levelOffset": "-10"{{/include}}`;
        const result = await evaluateMacros(
          macro,
          {
            mode: 'static',
            project: project,
            cardKey: '',
            context: 'localApp',
          },
          calculate,
        );

        // cannot go below level 1
        expect(result).to.contain('= Test Card Title');
        expect(result).to.contain('= Test subtitle');
      });
      it('includeMacro with non-existent card should return warning message', async () => {
        const macro = `{{#include}}"cardKey": "non-existent-card"{{/include}}`;
        const result = await evaluateMacros(
          macro,
          {
            mode: 'static',
            project: project,
            cardKey: '',
            context: 'localApp',
          },
          calculate,
        );

        expect(result).to.contain('.Macro Error');
        expect(result).to.contain('Card key non-existent-card not found');

        // Should have attempted to fetch the non-existent card
        expect(cardDetailsByIdStub.calledWith('non-existent-card')).to.equal(
          true,
        );
      });
      it('includeMacro with a wrong type should return warning message', async () => {
        const macro = `{{#include}}"cardKey": "test-card", "levelOffset": "test"{{/include}}`;
        const result = await evaluateMacros(
          macro,
          {
            mode: 'static',
            project: project,
            cardKey: '',
            context: 'localApp',
          },
          calculate,
        );

        expect(result).to.contain('.Macro Error');
        expect(result).to.contain('Invalid level offset: test');
      });
      it('includeMacro with wrong schema should return warning message', async () => {
        const macro = `{{#include}}"cardKey": "test-card", "levelOffset": 1{{/include}}`;
        const result = await evaluateMacros(
          macro,
          {
            mode: 'static',
            project: project,
            cardKey: '',
            context: 'localApp',
          },
          calculate,
        );
        expect(result).to.contain('.Macro Error');
      });
      it('includeMacro with level offset outside of range (success)', async () => {
        const macro = `{{#include}}"cardKey": "test-card", "levelOffset": "+10"{{/include}}`;
        const result = await evaluateMacros(
          macro,
          {
            mode: 'static',
            project: project,
            cardKey: '',
            context: 'localApp',
          },
          calculate,
        );
        // cannot go above level MAX LEVEL OFFSET
        expect(result).to.contain(
          `${'='.repeat(MAX_LEVEL_OFFSET + 1)} Test Card Title`,
        );
        expect(result).to.contain(
          `\n${'='.repeat(MAX_LEVEL_OFFSET + 2)} Test subtitle`,
        );
      });
      it('includeMacro inside includeMacro (success)', async () => {
        const macro = `{{#include}}"cardKey": "testCardNested"{{/include}}`;
        const result = await evaluateMacros(
          macro,
          {
            mode: 'static',
            project: project,
            cardKey: '',
            context: 'localApp',
          },
          calculate,
        );

        // Should contain content from both cards
        expect(result).to.contain('= Parent Card with Include');
        expect(result).to.contain('This is the parent card.');
        expect(result).to.contain('= Test Card Title');
        expect(result).to.contain(
          'This is test content for the included card.',
        );
        expect(result).to.contain('End of parent card.');

        // Verify both cards were fetched
        expect(cardDetailsByIdStub.calledWith('testCardNested')).to.equal(true);
        expect(cardDetailsByIdStub.calledWith('test-card')).to.equal(true);
      });
      it('includeMacro with level offset inside includeMacro (success)', async () => {
        const macro = `{{#include}}"cardKey": "testCardNestedWithOffset"{{/include}}`;
        const result = await evaluateMacros(
          macro,
          {
            mode: 'static',
            project: project,
            cardKey: '',
            context: 'localApp',
          },
          calculate,
        );
        expect(result).to.contain('== Test Card Title');
        expect(result).to.contain('=== Test subtitle');
        expect(
          cardDetailsByIdStub.calledWith('testCardNestedWithOffset'),
        ).to.equal(true);
        expect(cardDetailsByIdStub.calledWith('test-card')).to.equal(true);
      });
      it('includeMacro with nested level offset (success)', async () => {
        const macro = `{{#include}}"cardKey": "testCardNestedWithOffset", "levelOffset": "+1"{{/include}}`;
        const result = await evaluateMacros(
          macro,
          {
            mode: 'static',
            project: project,
            cardKey: '',
            context: 'localApp',
          },
          calculate,
        );
        expect(result).to.contain('=== Test Card Title');
        expect(result).to.contain('==== Test subtitle');
        expect(
          cardDetailsByIdStub.calledWith('testCardNestedWithOffset'),
        ).to.equal(true);
        expect(cardDetailsByIdStub.calledWith('test-card')).to.equal(true);
      });

      it('includeMacro passes correct context with updated cardKey', async () => {
        const macro = `{{#include}}"cardKey": "test-card"{{/include}}`;
        const result = await evaluateMacros(
          macro,
          {
            mode: 'static',
            project: project,
            cardKey: 'original-card-key',
            context: 'localApp',
          },
          calculate,
        );
        expect(result).to.contain('Card key: test-card');
      });
    });
    describe('xrefMacro', () => {
      let cardDetailsByIdStub: sinon.SinonStub;
      beforeEach(async () => {
        cardDetailsByIdStub = stub(project, 'cardDetailsById');

        const baseCard: Card = {
          key: '',
          path: '',
          content: '',
          metadata: {
            title: '',
            cardType: '',
            workflowState: '',
            rank: '',
            links: [],
          },
          children: [],
          attachments: [],
        };

        const testCard = structuredClone(baseCard);
        testCard.key = 'xref-test-card';
        testCard.content = 'This is a test card for xref.';
        testCard.metadata!.title = 'Test Card for Cross Reference';

        cardDetailsByIdStub.withArgs('xref-test-card').resolves(testCard);
      });
      afterEach(() => {
        cardDetailsByIdStub.restore();
      });

      ['static', 'inject'].forEach((mode) => {
        it(`xrefMacro ${mode} (success)`, async () => {
          const macro = `{{#xref}}"cardKey": "xref-test-card"{{/xref}}`;
          const result = await evaluateMacros(
            macro,
            {
              mode: mode as Mode,
              project: project,
              cardKey: '',
              context: 'localApp',
            },
            calculate,
          );

          expect(result).to.equal(
            'xref:xref-test-card.adoc[Test Card for Cross Reference]',
          );
          expect(cardDetailsByIdStub.calledWith('xref-test-card')).to.equal(
            true,
          );
        });
      });

      it('xrefMacro with non-existent card should return warning message', async () => {
        const macro = `{{#xref}}"cardKey": "non-existent-card"{{/xref}}`;
        const result = await evaluateMacros(
          macro,
          {
            mode: 'static',
            project: project,
            cardKey: '',
            context: 'localApp',
          },
          calculate,
        );

        expect(result).to.contain('.Macro Error');
        expect(result).to.contain('Card key non-existent-card not found');

        // Should have attempted to fetch the non-existent card
        expect(cardDetailsByIdStub.calledWith('non-existent-card')).to.equal(
          true,
        );
      });

      it('xrefMacro with wrong schema should return warning message', async () => {
        const macro = `{{#xref}}"invalidProperty": "test-value"{{/xref}}`;
        const result = await evaluateMacros(
          macro,
          {
            mode: 'static',
            project: project,
            cardKey: '',
            context: 'localApp',
          },
          calculate,
        );

        expect(result).to.contain('.Macro Error');
      });

      it('xrefMacro with missing cardKey should return warning message', async () => {
        const macro = `{{#xref}}{{/xref}}`;
        const result = await evaluateMacros(
          macro,
          {
            mode: 'static',
            project: project,
            cardKey: '',
            context: 'localApp',
          },
          calculate,
        );

        expect(result).to.contain('.Macro Error');
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
          context: 'localApp',
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
            context: 'localApp',
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
          context: 'localApp',
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
