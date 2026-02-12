import { expect } from 'chai';
import { stub } from 'sinon';

import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

import { Validator } from 'jsonschema';
import Handlebars from 'handlebars';

import BaseMacro from '../../src/macros/base-macro.js';
import { copyDir } from '../../src/utils/file-utils.js';
import { getTestProject } from '../helpers/test-utils.js';
import {
  createAdmonition,
  createHtmlPlaceholder,
  createMacro,
  evaluateMacros,
  registerMacros,
  validateMacroContent,
} from '../../src/macros/index.js';
import type { Project } from '../../src/containers/project.js';
import TaskQueue from '../../src/macros/task-queue.js';

import { MAX_LEVEL_OFFSET } from '../../src/utils/constants.js';

import type { Card } from '../../src/interfaces/project-interfaces.js';
import type { MacroGenerationContext } from '../../src/interfaces/macros.js';
import type { Mode } from '../../src/interfaces/macros.js';

import chaiAsPromised from 'chai-as-promised';
import { use } from 'chai';
use(chaiAsPromised);

const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-calculate-tests');
const decisionRecordsPath = join(testDir, 'valid/decision-records');
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

  handleValidate = (_: MacroGenerationContext, data: { content: string }) => {
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
      const result = validateMacroContent(macro.metadata, data, testSchema);
      expect(result).to.deep.equal({ test: 'test' });
    });
    it('try validateMacroContent using wrong value', () => {
      const data = '{"test": 1}';
      expect(() =>
        validateMacroContent(macro.metadata, data, testSchema),
      ).to.throw();
    });
    it('try validateMacroContent using wrong schema', () => {
      const data = '{"test": "test"}';
      expect(() =>
        validateMacroContent(macroMissingSchema.metadata, data, testSchema),
      ).to.throw();
    });
    it('try validateMacroContent using wrong data', () => {
      const data = '{"test": "test"';
      expect(() =>
        validateMacroContent(macro.metadata, data, testSchema),
      ).to.throw();
    });
    it('try validateMacroContent using wrong key', () => {
      const data = '{"test2": "test"}';
      expect(() =>
        validateMacroContent(macro.metadata, data, testSchema),
      ).to.throw();
    });
  });

  describe('handleMacros', () => {
    before(async () => {
      mkdirSync(testDir, { recursive: true });
      await copyDir('test/test-data/', testDir);
      project = getTestProject(decisionRecordsPath);
      await project.populateCaches();
      await project.calculationEngine.generate();
    });

    after(() => {
      setTimeout(() => {
        rmSync(testDir, { recursive: true, force: true });
      }, 5000);
    });
    describe('createCards', () => {
      it('createCards inject (success)', async () => {
        const result = await evaluateMacros(validAdoc, {
          mode: 'inject',
          project: project,
          cardKey: '',
          context: 'localApp',
        });
        expect(result).to.contain('<create-cards');
      });
      it('createCards static (success)', async () => {
        const result = await evaluateMacros(validAdoc, {
          mode: 'static',
          project: project,
          cardKey: '',
          context: 'localApp',
        });
        expect(result).to.not.contain('<create-cards>');
      });
      it('createCards exportSite (success)', async () => {
        const result = await evaluateMacros(validAdoc, {
          mode: 'staticSite',
          project: project,
          cardKey: '',
          context: 'localApp',
        });
        expect(result).to.not.contain('<create-cards');
      });
    });
    describe('raw', () => {
      it('raw macro (success)', async () => {
        const macro = `{{#scoreCard}}"title": "Open issues", "value": 0 {{/scoreCard}}`;
        const withRaw = `{{#raw}}${macro}{{/raw}}`;
        const result = await evaluateMacros(withRaw, {
          mode: 'static',
          project: project,
          cardKey: '',
          context: 'localApp',
        });
        expect(result).to.equal(
          '{{#scoreCard}}"title": "Open issues", "value": 0 {{/scoreCard}}',
        );
      });
      it('raw macro with handlebars helpers (success)', async () => {
        const handlebarsContent = `{{#each results}}

* {{this.title}}
{{/each}}`;
        const withRaw = `{{#raw}}${handlebarsContent}{{/raw}}`;
        const result = await evaluateMacros(withRaw, {
          mode: 'static',
          project: project,
          cardKey: '',
          context: 'localApp',
        });
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
        const result = await evaluateMacros(withRaw, {
          mode: 'static',
          project: project,
          cardKey: '',
          context: 'localApp',
        });
        expect(result).to.equal(mixedContent);
      });
      it('content should be able to contain multiple raw blocks', async () => {
        const nestedContent = `{{#raw}}RawContent1{{/raw}}
{{#raw}}RawContent2{{/raw}}
{{#raw}}RawContent3{{/raw}}`;
        const expectedResult = `RawContent1
RawContent2
RawContent3`;
        const result = await evaluateMacros(nestedContent, {
          mode: 'static',
          project: project,
          cardKey: '',
          context: 'localApp',
        });
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
        const result = await evaluateMacros(nestedContent, {
          mode: 'static',
          project: project,
          cardKey: '',
          context: 'localApp',
        });
        expect(result).to.contain(
          'Nested {{#raw}} blocks are not supported. Found nested raw block inside another raw block on line 3 (original raw block started on line 1).',
        );
      });
      it('unclosed raw block should return error with line number', async () => {
        const unclosedContent = `{{#raw}}
This raw block has no closing tag
Some content here`;
        const result = await evaluateMacros(unclosedContent, {
          mode: 'static',
          project: project,
          cardKey: '',
          context: 'localApp',
        });
        expect(result).to.contain(
          'Unclosed {{#raw}} block found on line 1. Every {{#raw}} must have a matching {{/raw}}.',
        );
      });
    });
    describe('scoreCard', () => {
      it('scoreCard inject (success)', async () => {
        const macro = `{{#scoreCard}}"title": "Scorecard", "value": 99, "unit": "%", "legend": "complete"{{/scoreCard}}`;
        const result = await evaluateMacros(macro, {
          mode: 'inject',
          project: project,
          cardKey: '',
          context: 'localApp',
        });
        expect(result).to.contain('<svg');
      });
      it('scoreCard static (success)', async () => {
        const macro = `{{#scoreCard}}"title": "Open issues", "value": 0 {{/scoreCard}}`;
        const result = await evaluateMacros(macro, {
          mode: 'static',
          project: project,
          cardKey: '',
          context: 'localApp',
        });
        expect(result).to.contain('<svg');
      });
      it('scoreCard exportSite (success)', async () => {
        const macro = `{{#scoreCard}}"title": "Scorecard", "value": 99, "unit": "%", "legend": "complete"{{/scoreCard}}`;
        const result = await evaluateMacros(macro, {
          mode: 'staticSite',
          project: project,
          cardKey: '',
          context: 'localApp',
        });
        expect(result).to.contain('<svg');
      });
    });
    describe('percentage', () => {
      it('percentage inject (success)', async () => {
        const macro = `{{#percentage}}"title": "Test Percentage", "value": 85, "legend": "of Assets", "colour": "red"{{/percentage}}`;
        const result = await evaluateMacros(macro, {
          mode: 'inject',
          project: project,
          cardKey: '',
          context: 'localApp',
        });
        expect(result).to.contain('<svg');
        expect(result).to.contain('Test Percentage');
        expect(result).to.contain('85%');
      });
      it('percentage static (success)', async () => {
        const macro = `{{#percentage}}"title": "Static Percentage", "value": 42, "legend": "done", "colour": "green"{{/percentage}}`;
        const result = await evaluateMacros(macro, {
          mode: 'static',
          project: project,
          cardKey: '',
          context: 'localApp',
        });
        expect(result).to.contain('<svg');
        expect(result).to.contain('Static Percentage');
        expect(result).to.contain('42%');
      });
      it('percentage exportSite (success)', async () => {
        const macro = `{{#percentage}}"title": "Test Percentage", "value": 85, "legend": "of Assets", "colour": "red"{{/percentage}}`;
        const result = await evaluateMacros(macro, {
          mode: 'staticSite',
          project: project,
          cardKey: '',
          context: 'localApp',
        });
        expect(result).to.contain('<svg');
        expect(result).to.contain('Test Percentage');
        expect(result).to.contain('85%');
      });
      it('percentage missing title (failure)', async () => {
        const macro = `{{#percentage}}"value": 50, "legend": "missing title"{{/percentage}}`;
        const result = await evaluateMacros(macro, {
          mode: 'static',
          project: project,
          cardKey: '',
          context: 'localApp',
        });
        expect(result).to.contain('Macro Error');
        expect(result).to.contain('title');
      });
      it('percentage missing value (failure)', async () => {
        const macro = `{{#percentage}}"title": "No Value", "legend": "No Value"{{/percentage}}`;
        const result = await evaluateMacros(macro, {
          mode: 'static',
          project: project,
          cardKey: '',
          context: 'localApp',
        });
        expect(result).to.contain('Macro Error');
        expect(result).to.contain('value');
      });
      it('percentage missing legend (failure)', async () => {
        const macro = `{{#percentage}}"title": "No Legend", "value": 10{{/percentage}}`;
        const result = await evaluateMacros(macro, {
          mode: 'static',
          project: project,
          cardKey: '',
          context: 'localApp',
        });
        expect(result).to.contain('Macro Error');
        expect(result).to.contain('legend');
      });
      it('percentage value as string (failure)', async () => {
        const macro = `{{#percentage}}"title": "String Value", "value": "not a number", "legend": "fail"{{/percentage}}`;
        const result = await evaluateMacros(macro, {
          mode: 'static',
          project: project,
          cardKey: '',
          context: 'localApp',
        });
        expect(result).to.contain('Macro Error');
        expect(result).to.contain('is not of a type');
      });
      it('percentage malformed JSON (failure)', async () => {
        const macro = `{{#percentage}}"title": "Malformed", "value": 10, "legend": "fail"`;
        const result = await evaluateMacros(macro, {
          mode: 'static',
          project: project,
          cardKey: '',
          context: 'localApp',
        });
        expect(result).to.contain('Macro Error');
      });
    });
    describe('includeMacro', () => {
      let cardDetailsByIdStub: sinon.SinonStub;
      beforeEach(() => {
        cardDetailsByIdStub = stub(project, 'findCard');

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

        cardDetailsByIdStub
          .withArgs('non-existent-card')
          .throws(
            new Error("Card 'non-existent-card' does not exist in the project"),
          );
        cardDetailsByIdStub.withArgs('test-card').returns(testCard);

        const testCardNested = structuredClone(baseCard);
        testCardNested.key = 'testCardNested';
        testCardNested.content =
          'This is the parent card.\n\n{{#include}}"cardKey": "test-card"{{/include}}\n\nEnd of parent card.';
        testCardNested.metadata!.title = 'Parent Card with Include';
        cardDetailsByIdStub.withArgs('testCardNested').returns(testCardNested);

        const testCardNestedWithOffset = structuredClone(baseCard);
        testCardNestedWithOffset.key = 'testCardNestedWithOffset';
        testCardNestedWithOffset.content =
          'This is the parent card.\n\n{{#include}}"cardKey": "test-card", "levelOffset": "+1"{{/include}}\n\nEnd of parent card.';
        testCardNestedWithOffset.metadata!.title = 'Parent Card with Include';

        cardDetailsByIdStub
          .withArgs('testCardNestedWithOffset')
          .returns(testCardNestedWithOffset);
      });
      afterEach(() => {
        cardDetailsByIdStub.restore();
      });
      ['static', 'inject', 'staticSite'].forEach((mode) => {
        it(`includeMacro ${mode} (success)`, async () => {
          try {
            const macro = `{{#include}}"cardKey": "test-card"{{/include}}`;
            const result = await evaluateMacros(macro, {
              mode: mode as Mode,
              project: project,
              cardKey: '',
              context: 'localApp',
            });

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
        const result = await evaluateMacros(macro, {
          mode: 'static',
          project: project,
          cardKey: '',
          context: 'localApp',
        });
        expect(result).to.contain('== Test Card Title');
        expect(result).to.contain('=== Test subtitle');
      });
      it('includeMacro with negative level offset (success)', async () => {
        const macro = `{{#include}}"cardKey": "test-card", "levelOffset": "-10"{{/include}}`;
        const result = await evaluateMacros(macro, {
          mode: 'static',
          project: project,
          cardKey: '',
          context: 'localApp',
        });

        // cannot go below level 1
        expect(result).to.contain('= Test Card Title');
        expect(result).to.contain('= Test subtitle');
      });
      it('includeMacro with non-existent card should return warning message', async () => {
        const macro = `{{#include}}"cardKey": "non-existent-card"{{/include}}`;
        const result = await evaluateMacros(macro, {
          mode: 'static',
          project: project,
          cardKey: '',
          context: 'localApp',
        });
        expect(result).to.contain('.Macro Error');
        expect(result).to.contain(
          "Card 'non-existent-card' does not exist in the project",
        );

        // Should have attempted to fetch the non-existent card
        expect(cardDetailsByIdStub.calledWith('non-existent-card')).to.equal(
          true,
        );
      });
      it('includeMacro with a wrong type should return warning message', async () => {
        const macro = `{{#include}}"cardKey": "test-card", "levelOffset": "test"{{/include}}`;
        const result = await evaluateMacros(macro, {
          mode: 'static',
          project: project,
          cardKey: '',
          context: 'localApp',
        });

        expect(result).to.contain('.Macro Error');
        expect(result).to.contain('Invalid level offset: test');
      });
      it('includeMacro with wrong schema should return warning message', async () => {
        const macro = `{{#include}}"cardKey": "test-card", "levelOffset": 1{{/include}}`;
        const result = await evaluateMacros(macro, {
          mode: 'static',
          project: project,
          cardKey: '',
          context: 'localApp',
        });
        expect(result).to.contain('.Macro Error');
      });
      it('includeMacro with level offset outside of range (success)', async () => {
        const macro = `{{#include}}"cardKey": "test-card", "levelOffset": "+10"{{/include}}`;
        const result = await evaluateMacros(macro, {
          mode: 'static',
          project: project,
          cardKey: '',
          context: 'localApp',
        });
        // cannot go above level MAX LEVEL OFFSET
        expect(result).to.contain(
          `${'='.repeat(MAX_LEVEL_OFFSET + 1)} Test Card Title`,
        );
        expect(result).to.contain(
          `\n${'='.repeat(MAX_LEVEL_OFFSET + 1)} Test subtitle`,
        );
      });
      it('includeMacro inside includeMacro (success)', async () => {
        const macro = `{{#include}}"cardKey": "testCardNested"{{/include}}`;
        const result = await evaluateMacros(macro, {
          mode: 'static',
          project: project,
          cardKey: '',
          context: 'localApp',
        });

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
        const result = await evaluateMacros(macro, {
          mode: 'static',
          project: project,
          cardKey: '',
          context: 'localApp',
        });
        expect(result).to.contain('== Test Card Title');
        expect(result).to.contain('=== Test subtitle');
        expect(
          cardDetailsByIdStub.calledWith('testCardNestedWithOffset'),
        ).to.equal(true);
        expect(cardDetailsByIdStub.calledWith('test-card')).to.equal(true);
      });
      it('includeMacro with nested level offset (success)', async () => {
        const macro = `{{#include}}"cardKey": "testCardNestedWithOffset", "levelOffset": "+1"{{/include}}`;
        const result = await evaluateMacros(macro, {
          mode: 'static',
          project: project,
          cardKey: '',
          context: 'localApp',
        });
        expect(result).to.contain('=== Test Card Title');
        expect(result).to.contain('==== Test subtitle');
        expect(
          cardDetailsByIdStub.calledWith('testCardNestedWithOffset'),
        ).to.equal(true);
        expect(cardDetailsByIdStub.calledWith('test-card')).to.equal(true);
      });

      it('includeMacro passes correct context with updated cardKey', async () => {
        const macro = `{{#include}}"cardKey": "test-card"{{/include}}`;
        const result = await evaluateMacros(macro, {
          mode: 'static',
          project: project,
          cardKey: 'original-card-key',
          context: 'localApp',
        });
        expect(result).to.contain('Card key: test-card');
      });

      it('includeMacro preserves raw blocks (success)', async () => {
        // Create a card with raw blocks that should not be evaluated
        const testCardWithRaw: Card = {
          key: 'test-card-with-raw',
          path: '',
          content:
            'Content before raw block.\n\n{{#raw}}{{#scoreCard}}"title": "Should not be evaluated", "value": 42{{/scoreCard}}{{/raw}}\n\nContent after raw block.',
          metadata: {
            title: 'Card with Raw Block',
            cardType: '',
            workflowState: '',
            rank: '',
            links: [],
          },
          children: [],
          attachments: [],
        };
        cardDetailsByIdStub
          .withArgs('test-card-with-raw')
          .returns(testCardWithRaw);

        const macro = `{{#include}}"cardKey": "test-card-with-raw"{{/include}}`;
        const result = await evaluateMacros(macro, {
          mode: 'static',
          project: project,
          cardKey: '',
          context: 'localApp',
        });

        // The raw block content should be preserved as-is, not evaluated as a macro
        expect(result).to.contain(
          '{{#scoreCard}}"title": "Should not be evaluated", "value": 42{{/scoreCard}}',
        );
        expect(result).to.contain('Content before raw block.');
        expect(result).to.contain('Content after raw block.');
        expect(result).to.contain('= Card with Raw Block');

        // Verify the card was fetched
        expect(cardDetailsByIdStub.calledWith('test-card-with-raw')).to.equal(
          true,
        );
      });

      describe('whitespace option', () => {
        ['static', 'inject', 'staticSite'].forEach((mode) => {
          it(`includeMacro with whitespace="keep" should preserve whitespace (default behavior) [${mode}]`, async () => {
            const macro = `{{#include}}"cardKey": "test-card", "whitespace": "keep"{{/include}}`;
            const result = await evaluateMacros(macro, {
              mode: mode as Mode,
              project: project,
              cardKey: '',
              context: 'localApp',
            });

            // Default behavior: content should start with newlines
            expect(result).to.match(/^\n\n/);
            expect(result).to.contain('= Test Card Title');
            expect(result).to.contain(
              'This is test content for the included card.',
            );
          });

          it(`includeMacro with whitespace="trim" should trim whitespace [${mode}]`, async () => {
            const macro = `{{#include}}"cardKey": "test-card", "whitespace": "trim"{{/include}}`;
            const result = await evaluateMacros(macro, {
              mode: mode as Mode,
              project: project,
              cardKey: '',
              context: 'localApp',
            });

            // Trimmed: content should NOT start with whitespace
            expect(result).to.not.match(/^\s/);
            expect(result).to.match(/^\[\[test-card\]\]/);
            expect(result).to.contain('= Test Card Title');
            expect(result).to.contain(
              'This is test content for the included card.',
            );
          });

          it(`includeMacro without whitespace option should keep whitespace (default) [${mode}]`, async () => {
            const macro = `{{#include}}"cardKey": "test-card"{{/include}}`;
            const result = await evaluateMacros(macro, {
              mode: mode as Mode,
              project: project,
              cardKey: '',
              context: 'localApp',
            });

            // Default: content should start with newlines
            expect(result).to.match(/^\n\n/);
          });
        });

        it('includeMacro with whitespace="trim" for JSON-like content', async () => {
          // Create a card with JSON-like content that benefits from trimming
          const jsonCard: Card = {
            key: 'json-content-card',
            path: '',
            content: '{"key": "value", "number": 42}',
            metadata: {
              title: 'JSON Card',
              cardType: '',
              workflowState: '',
              rank: '',
              links: [],
            },
            children: [],
            attachments: [],
          };
          cardDetailsByIdStub.withArgs('json-content-card').returns(jsonCard);

          const macro = `{{#include}}"cardKey": "json-content-card", "whitespace": "trim", "title": "exclude"{{/include}}`;
          const result = await evaluateMacros(macro, {
            mode: 'static',
            project: project,
            cardKey: '',
            context: 'localApp',
          });

          // Content should be trimmed and not have leading/trailing whitespace
          expect(result).to.equal('{"key": "value", "number": 42}');
          expect(cardDetailsByIdStub.calledWith('json-content-card')).to.equal(
            true,
          );
        });

        it('includeMacro with whitespace="trim" and title="only" should trim title', async () => {
          const macro = `{{#include}}"cardKey": "test-card", "whitespace": "trim", "title": "only"{{/include}}`;
          const result = await evaluateMacros(macro, {
            mode: 'static',
            project: project,
            cardKey: '',
            context: 'localApp',
          });

          // Should only contain title, trimmed
          expect(result).to.match(/^\[\[test-card\]\]/);
          expect(result).to.contain('= Test Card Title');
          expect(result).to.not.contain(
            'This is test content for the included card.',
          );
        });
      });
      describe('escape option', () => {
        ['static', 'inject', 'staticSite'].forEach((mode) => {
          it(`includeMacro with escape="json" should escape JSON special characters [${mode}]`, async () => {
            const jsonCard: Card = {
              key: 'json-escape-card',
              path: '',
              content: 'Content with "quotes" and \\ backslash\nand newline',
              metadata: {
                title: 'JSON Escape Card',
                cardType: '',
                workflowState: '',
                rank: '',
                links: [],
              },
              children: [],
              attachments: [],
            };
            cardDetailsByIdStub.withArgs('json-escape-card').returns(jsonCard);

            const macro = `{{#include}}"cardKey": "json-escape-card", "title": "exclude", "whitespace": "trim", "escape": "json"{{/include}}`;
            const result = await evaluateMacros(macro, {
              mode: mode as Mode,
              project: project,
              cardKey: '',
              context: 'localApp',
            });

            // JSON escaping: quotes become \", backslash becomes \\, newline becomes \n
            expect(result).to.equal(
              'Content with \\"quotes\\" and \\\\ backslash\\nand newline',
            );
          });

          it(`includeMacro with escape="csv" should escape CSV special characters [${mode}]`, async () => {
            const csvCard: Card = {
              key: 'csv-escape-card',
              path: '',
              content: 'Content with "quotes" inside',
              metadata: {
                title: 'CSV Escape Card',
                cardType: '',
                workflowState: '',
                rank: '',
                links: [],
              },
              children: [],
              attachments: [],
            };
            cardDetailsByIdStub.withArgs('csv-escape-card').returns(csvCard);

            const macro = `{{#include}}"cardKey": "csv-escape-card", "title": "exclude", "whitespace": "trim", "escape": "csv"{{/include}}`;
            const result = await evaluateMacros(macro, {
              mode: mode as Mode,
              project: project,
              cardKey: '',
              context: 'localApp',
            });

            // CSV escaping: quotes become doubled
            expect(result).to.equal('Content with ""quotes"" inside');
          });

          it(`includeMacro with escape="csv" should handle multiple quotes [${mode}]`, async () => {
            const csvCard: Card = {
              key: 'csv-multi-quote-card',
              path: '',
              content: '"""triple quotes"""',
              metadata: {
                title: 'CSV Multi Quote Card',
                cardType: '',
                workflowState: '',
                rank: '',
                links: [],
              },
              children: [],
              attachments: [],
            };
            cardDetailsByIdStub
              .withArgs('csv-multi-quote-card')
              .returns(csvCard);

            const macro = `{{#include}}"cardKey": "csv-multi-quote-card", "title": "exclude", "whitespace": "trim", "escape": "csv"{{/include}}`;
            const result = await evaluateMacros(macro, {
              mode: mode as Mode,
              project: project,
              cardKey: '',
              context: 'localApp',
            });

            // Each quote should be doubled
            expect(result).to.equal('""""""triple quotes""""""');
          });
        });

        it('includeMacro without escape option should not escape content', async () => {
          const plainCard: Card = {
            key: 'plain-card',
            path: '',
            content: 'Content with "quotes" and newline\nhere',
            metadata: {
              title: 'Plain Card',
              cardType: '',
              workflowState: '',
              rank: '',
              links: [],
            },
            children: [],
            attachments: [],
          };
          cardDetailsByIdStub.withArgs('plain-card').returns(plainCard);

          const macro = `{{#include}}"cardKey": "plain-card", "title": "exclude", "whitespace": "trim"{{/include}}`;
          const result = await evaluateMacros(macro, {
            mode: 'static',
            project: project,
            cardKey: '',
            context: 'localApp',
          });

          // No escaping should occur
          expect(result).to.equal('Content with "quotes" and newline\nhere');
        });
      });
    });
    describe('xrefMacro', () => {
      let cardDetailsByIdStub: sinon.SinonStub;
      beforeEach(() => {
        cardDetailsByIdStub = stub(project, 'findCard');

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

        cardDetailsByIdStub.withArgs('xref-test-card').returns(testCard);
      });
      afterEach(() => {
        cardDetailsByIdStub.restore();
      });

      ['static', 'inject', 'staticSite'].forEach((mode) => {
        it(`xrefMacro ${mode} (success)`, async () => {
          const macro = `{{#xref}}"cardKey": "xref-test-card"{{/xref}}`;
          const result = await evaluateMacros(macro, {
            mode: mode as Mode,
            project: project,
            cardKey: '',
            context: 'localApp',
          });
          const expected =
            mode === 'static'
              ? '<<xref-test-card>>'
              : 'xref:xref-test-card.adoc[Test Card for Cross Reference]';

          expect(result).to.equal(expected);
          expect(cardDetailsByIdStub.calledWith('xref-test-card')).to.equal(
            true,
          );
        });
      });

      it('xrefMacro with non-existent card should return warning message', async () => {
        const macro = `{{#xref}}"cardKey": "non-existent-card"{{/xref}}`;
        const result = await evaluateMacros(macro, {
          mode: 'static',
          project: project,
          cardKey: '',
          context: 'localApp',
        });

        expect(result).to.contain('.Macro Error');
        expect(result).to.contain('Card key non-existent-card not found');

        // Should have attempted to fetch the non-existent card
        expect(cardDetailsByIdStub.calledWith('non-existent-card')).to.equal(
          true,
        );
      });

      it('xrefMacro with wrong schema should return warning message', async () => {
        const macro = `{{#xref}}"invalidProperty": "test-value"{{/xref}}`;
        const result = await evaluateMacros(macro, {
          mode: 'static',
          project: project,
          cardKey: '',
          context: 'localApp',
        });

        expect(result).to.contain('.Macro Error');
      });

      it('xrefMacro with missing cardKey should return warning message', async () => {
        const macro = `{{#xref}}{{/xref}}`;
        const result = await evaluateMacros(macro, {
          mode: 'static',
          project: project,
          cardKey: '',
          context: 'localApp',
        });

        expect(result).to.contain('.Macro Error');
      });
    });
    describe('imageMacro', () => {
      it('imageMacro static mode (success)', async () => {
        const macro = `{{#image}}"fileName": "the-needle.heic"{{/image}}`;
        const result = await evaluateMacros(macro, {
          mode: 'static',
          project: project,
          cardKey: 'decision_1',
          context: 'localApp',
        });

        expect(result).to.match(/^image::data:image\/heic;base64,/);
      });

      it('imageMacro inject mode (success)', async () => {
        const macro = `{{#image}}"fileName": "the-needle.heic"{{/image}}`;
        const result = await evaluateMacros(macro, {
          mode: 'inject',
          project: project,
          cardKey: 'decision_1',
          context: 'localApp',
        });

        expect(result).to.equal(
          'image::/api/cards/decision_1/a/the-needle.heic[]',
        );
      });

      it('imageMacro exportSite mode (success)', async () => {
        const macro = `{{#image}}"fileName": "the-needle.heic"{{/image}}`;
        const result = await evaluateMacros(macro, {
          mode: 'staticSite',
          project: project,
          cardKey: 'decision_1',
          context: 'localApp',
        });

        expect(result).to.equal(
          'image::/api/cards/decision_1/a/the-needle.heic[]',
        );
      });

      it('imageMacro with cardKey parameter (success)', async () => {
        const macro = `{{#image}}"fileName": "the-needle.heic", "cardKey": "decision_1"{{/image}}`;
        const result = await evaluateMacros(macro, {
          mode: 'inject',
          project: project,
          cardKey: 'decision_5',
          context: 'localApp',
        });

        expect(result).to.equal(
          'image::/api/cards/decision_1/a/the-needle.heic[]',
        );
      });

      it('imageMacro with alt and title attributes', async () => {
        const macro = `{{#image}}"fileName": "the-needle.heic", "alt": "Test image", "title": "A test needle image"{{/image}}`;
        const result = await evaluateMacros(macro, {
          mode: 'inject',
          project: project,
          cardKey: 'decision_1',
          context: 'localApp',
        });

        expect(result).to.equal(
          'image::/api/cards/decision_1/a/the-needle.heic[alt="Test image",title="A test needle image"]',
        );
      });
      for (const mode of ['static', 'inject', 'staticSite'] as const) {
        it(`imageMacro with non-existent fileName should report macro error (${mode} mode)`, async () => {
          const missingFile = 'non-existent-file-123.png';
          const macro = `{{#image}}"fileName": "${missingFile}"{{/image}}`;
          const result = await evaluateMacros(macro, {
            mode,
            project: project,
            cardKey: 'decision_1',
            context: 'localApp',
          });

          expect(result).to.contain('.Macro Error');
          expect(result).to.contain(missingFile);
          expect(result.toLowerCase()).to.contain('not found in card');
        });
      }
      it('imageMacro inject mode with non-existent card should return warning message', async () => {
        const macro = `{{#image}}"fileName": "any.png", "cardKey": "non-existent-card"{{/image}}`;
        const result = await evaluateMacros(macro, {
          mode: 'inject',
          project: project,
          cardKey: 'decision_1',
          context: 'localApp',
        });
        expect(result).to.contain('.Macro Error');
        expect(result).to.contain(
          "Card 'non-existent-card' does not exist in the project",
        );
      });

      it('imageMacro with non-existent card should return warning message', async () => {
        const macro = `{{#image}}"fileName": "test.png", "cardKey": "non-existent-card"{{/image}}`;
        const result = await evaluateMacros(macro, {
          mode: 'static',
          project: project,
          cardKey: 'decision_1',
          context: 'localApp',
        });

        expect(result).to.contain('.Macro Error');
        expect(result).to.contain(
          "Card 'non-existent-card' does not exist in the project",
        );
      });

      it('imageMacro with non-existent file should return warning message', async () => {
        const macro = `{{#image}}"fileName": "non-existent-image.png"{{/image}}`;
        const result = await evaluateMacros(macro, {
          mode: 'static',
          project: project,
          cardKey: 'decision_5',
          context: 'localApp',
        });

        expect(result).to.contain('.Macro Error');
        expect(result).to.contain(
          "Attachment file 'non-existent-image.png' not found in card 'decision_5'",
        );
      });

      it('imageMacro with wrong schema should return warning message', async () => {
        const macro = `{{#image}}"invalidProperty": "test-value"{{/image}}`;
        const result = await evaluateMacros(macro, {
          mode: 'static',
          project: project,
          cardKey: 'decision_5',
          context: 'localApp',
        });

        expect(result).to.contain('.Macro Error');
      });

      it('imageMacro with missing fileName should return warning message', async () => {
        const macro = `{{#image}}{{/image}}`;
        const result = await evaluateMacros(macro, {
          mode: 'static',
          project: project,
          cardKey: 'decision_5',
          context: 'localApp',
        });

        expect(result).to.contain('.Macro Error');
      });
    });
  });
  describe('validate macros', () => {
    before(async () => {
      mkdirSync(testDir, { recursive: true });
      await copyDir('test/test-data/', testDir);
      project = getTestProject(decisionRecordsPath);
      await project.populateCaches();
      await project.calculationEngine.generate();
    });

    after(() => {
      setTimeout(() => {
        rmSync(testDir, { recursive: true, force: true });
      }, 5000);
    });
    it('validate macros (success)', async () => {
      // this should not throw an error
      const result = await evaluateMacros(validAdoc, {
        mode: 'validate',
        project: project,
        cardKey: '',
        context: 'localApp',
      });
      expect(result).to.not.equal(null);
    });
    it('validate macros - failure', async () => {
      await expect(
        evaluateMacros(invalidAdoc, {
          mode: 'validate',
          project: project,
          cardKey: '',
          context: 'localApp',
        }),
      ).to.be.rejected;
    });
  });
  describe('registerMacros', () => {
    it('registerMacros (success)', async () => {
      const handlebars = Handlebars.create();
      await registerMacros(
        handlebars,
        {
          mode: 'inject',
          project: project,
          cardKey: '',
          context: 'localApp',
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
      const options = {
        test: 'test-data',
      };

      const result = createHtmlPlaceholder(macro.metadata, options);
      expect(result).to.contain('test-tag-name');
      expect(result).to.contain('key="macro-');
      expect(result).to.contain('options="');

      const optionsBase64 = Buffer.from(
        JSON.stringify(options),
        'utf-8',
      ).toString('base64');

      expect(result).to.contain(optionsBase64);
    });
    it('createHtmlPlaceholder (success) without data', () => {
      // note: depends on the order of execution
      const result = createHtmlPlaceholder(macro.metadata, {});
      expect(result).to.contain('test-tag-name');
      expect(result).to.contain('key="macro-');
      expect(result).to.contain('options="');

      const optionsBase64 = Buffer.from(JSON.stringify({}), 'utf-8').toString(
        'base64',
      );
      expect(result).to.contain(optionsBase64);
    });
    it('createHtmlPlaceholder with nested objects (dot notation)', () => {
      const options = {
        key: 'test',
        anotherKey: {
          key1: 'test',
          key2: 'test2',
          nested: {
            deepValue: 'deep',
          },
        },
      };
      const result = createHtmlPlaceholder(macro.metadata, options);

      const optionsBase64 = Buffer.from(
        JSON.stringify(options),
        'utf-8',
      ).toString('base64');
      expect(result).to.contain(optionsBase64);
    });
    it('createAdmonition (success)', () => {
      const result = createAdmonition('WARNING', 'test-title', 'test-content');
      expect(result).to.equal(
        '[WARNING]\n.test-title\n====\ntest-content\n====\n\n',
      );
    });
  });
});

describe('createMacro', () => {
  it('should create a macro with empty options', () => {
    const result = createMacro('scoreCard', {});
    expect(result).to.equal('{{#scoreCard}}{{/scoreCard}}');
  });
  it('should create a macro with non-empty options', () => {
    const result = createMacro('scoreCard', { foo: 'bar', num: 42 });
    expect(result).to.equal('{{#scoreCard}}"foo":"bar","num":42{{/scoreCard}}');
  });
  it('should handle options with nested objects', () => {
    const result = createMacro('scoreCard', { a: { b: 1 } });
    expect(result).to.equal('{{#scoreCard}}"a":{"b":1}{{/scoreCard}}');
  });
});
