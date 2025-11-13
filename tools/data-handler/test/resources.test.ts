import { expect } from 'chai';

import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

import { copyDir } from '../src/utils/file-utils.js';
import { Create, Import } from '../src/commands/index.js';
import { Project } from '../src/containers/project.js';
import { resourceName } from '../src/utils/resource-utils.js';

import type {
  CalculationMetadata,
  CardType,
  CustomField,
  FieldType,
  GraphModel,
  GraphView,
  LinkType,
  Report,
  TemplateMetadata,
  Workflow,
  WorkflowState,
  WorkflowTransition,
} from '../src/interfaces/resource-interfaces.js';

import type {
  AddOperation,
  ChangeOperation,
  RemoveOperation,
} from '../src/resources/resource-object.js';

// Helper type for resource test configurations
type ResourceType =
  | 'calculations'
  | 'cardTypes'
  | 'fieldTypes'
  | 'graphModels'
  | 'graphViews'
  | 'linkTypes'
  | 'reports'
  | 'templates'
  | 'workflows';

type ResourceConfig = {
  type: ResourceType;
  identifier: string;
  createMethod?:
    | 'create'
    | 'createCardType'
    | 'createFieldType'
    | 'createReport';
  createArgs?: string[];
  createContent?: unknown;
  expectedData?: unknown;
  hasContent?: boolean;
};

const resourceConfigs: ResourceConfig[] = [
  {
    type: 'calculations',
    identifier: 'newCALC',
    createMethod: 'create',
    expectedData: {
      name: 'decision/calculations/newCALC',
      displayName: '',
      description: undefined,
      calculation: 'calculation.lp',
    },
  },
  {
    type: 'cardTypes',
    identifier: 'newCT',
    createMethod: 'createCardType',
    createArgs: ['decision/workflows/decision'],
    expectedData: {
      name: 'decision/cardTypes/newCT',
      displayName: '',
      workflow: 'decision/workflows/decision',
      customFields: [],
      alwaysVisibleFields: [],
      optionallyVisibleFields: [],
    },
  },
  {
    type: 'fieldTypes',
    identifier: 'newFT',
    createMethod: 'createFieldType',
    createArgs: ['shortText'],
    expectedData: {
      name: 'decision/fieldTypes/newFT',
      displayName: '',
      dataType: 'shortText',
    },
  },
  {
    type: 'graphModels',
    identifier: 'newGM',
    createMethod: 'create',
    hasContent: true,
    expectedData: {
      name: 'decision/graphModels/newGM',
      displayName: '',
    },
  },
  {
    type: 'graphViews',
    identifier: 'newGV',
    createMethod: 'create',
    hasContent: true,
    expectedData: {
      name: 'decision/graphViews/newGV',
      displayName: '',
    },
  },
  {
    type: 'linkTypes',
    identifier: 'newLT',
    createMethod: 'create',
    expectedData: {
      name: 'decision/linkTypes/newLT',
      displayName: '',
      outboundDisplayName: 'decision/linkTypes/newLT',
      inboundDisplayName: 'decision/linkTypes/newLT',
      sourceCardTypes: [],
      destinationCardTypes: [],
      enableLinkDescription: false,
    },
  },
  {
    type: 'reports',
    identifier: 'newREP',
    createMethod: 'createReport',
    hasContent: true,
    expectedData: {
      name: 'decision/reports/newREP',
      displayName: '',
      category: 'Uncategorised report',
    },
  },
  {
    type: 'templates',
    identifier: 'newTEMP',
    createMethod: 'create',
    expectedData: {
      name: 'decision/templates/newTEMP',
      displayName: '',
    },
  },
  {
    type: 'workflows',
    identifier: 'newWF',
    createMethod: 'create',
    expectedData: {
      name: 'decision/workflows/newWF',
      displayName: '',
      states: [
        { name: 'Draft', category: 'initial' },
        { name: 'Approved', category: 'closed' },
        { name: 'Deprecated', category: 'closed' },
      ],
      transitions: [
        { name: 'Create', fromState: [''], toState: 'Draft' },
        { name: 'Approve', fromState: ['Draft'], toState: 'Approved' },
        { name: 'Archive', fromState: ['*'], toState: 'Deprecated' },
      ],
    },
  },
];

describe('resources', function () {
  const baseDir = import.meta.dirname;
  const testDir = join(baseDir, 'tmp-resource-tests');
  const decisionRecordsPath = join(testDir, 'valid/decision-records');
  const minimalPath = join(testDir, 'valid/minimal');
  let project: Project;

  this.timeout(10000);

  before(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data/', testDir);
    project = new Project(decisionRecordsPath);
    await project.populateCaches();
  });

  after(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('resource-cache', () => {
    it('collect local resources', () => {
      // Resources should be automatically collected on Project initialization
      const calcCount = project.resources.calculations().length;
      const cardTypesCount = project.resources.cardTypes().length;
      const fieldTypesCount = project.resources.fieldTypes().length;
      const graphModelCount = project.resources.graphModels().length;
      const graphViewCount = project.resources.graphViews().length;
      const linkTypesCount = project.resources.linkTypes().length;
      const reportsCount = project.resources.reports().length;
      const templatesCount = project.resources.templates().length;
      const workflowsCount = project.resources.workflows().length;

      expect(calcCount).not.to.equal(0);
      expect(cardTypesCount).not.to.equal(0);
      expect(fieldTypesCount).not.to.equal(0);
      expect(graphModelCount).not.to.equal(0);
      expect(graphViewCount).not.to.equal(0);
      expect(linkTypesCount).not.to.equal(0);
      expect(reportsCount).not.to.equal(0);
      expect(templatesCount).not.to.equal(0);
      expect(workflowsCount).not.to.equal(0);
    });

    it('resource existence checks', () => {
      // Test that basic resources exist
      const testWorkflow = `${project.projectPrefix}/workflows/decision`;
      const testCardType = `${project.projectPrefix}/cardTypes/decision`;
      const testFieldType = `${project.projectPrefix}/fieldTypes/finished`;

      expect(project.resources.exists(testWorkflow)).to.equal(true);
      expect(project.resources.exists(testCardType)).to.equal(true);
      expect(project.resources.exists(testFieldType)).to.equal(true);

      // Test non-existent resource
      expect(project.resources.exists('nonexistent')).to.equal(false);
    });
  });

  describe('resource basic operations', () => {
    // Helper to avoid OS specific linebreaks in comparisons
    function removeLineBreaks(data: Report): Report {
      const re = /[\r\n]+/gm;
      data.content.contentTemplate = data.content.contentTemplate.replace(
        re,
        ' ',
      );
      data.content.queryTemplate = data.content.queryTemplate.replace(re, ' ');
      return data;
    }

    const baseDir = import.meta.dirname;
    const testDir = join(baseDir, 'tmp-resource-classes-tests');
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    let project: Project;

    before(async () => {
      mkdirSync(testDir, { recursive: true });
      await copyDir('test/test-data/', testDir);
      project = new Project(decisionRecordsPath);
      await project.populateCaches();
    });

    after(() => {
      rmSync(testDir, { recursive: true, force: true });
    });

    // Parameterized create tests
    resourceConfigs.forEach((config) => {
      it(`create ${config.type}`, async () => {
        const name = `decision/${config.type}/${config.identifier}`;
        const before = project.resources.resourceTypes(config.type);
        let found = before.find((item) => item.data?.name === name);
        expect(found).to.equal(undefined);

        if (config.type === 'cardTypes') {
          const res = project.resources.byType(name, config.type);
          const args = config.createArgs || [];
          await res.createCardType(args[0]);
          const after = project.resources.cardTypes();
          found = after.find((item) => item.data?.name === res.data?.name);
        } else if (config.type === 'fieldTypes') {
          const res = project.resources.byType(name, config.type);
          const args = config.createArgs || [];
          await res.createFieldType(args[0] as 'shortText');
          const after = project.resources.fieldTypes();
          found = after.find((item) => item.data?.name === res.data?.name);
        } else if (config.type === 'reports') {
          const res = project.resources.byType(name, config.type);
          await res.createReport();
          const after = project.resources.reports();
          found = after.find((item) => item.data?.name === res.data?.name);
        } else {
          const res = project.resources.byType(name, config.type);
          await res.create();
          const after = project.resources.resourceTypes(config.type);
          found = after.find((item) => item.data?.name === res.data?.name);
        }

        expect(found).to.not.equal(undefined);
      });
    });
    // Special create tests with provided content
    it('create link type with provided content', async () => {
      const name = 'decision/linkTypes/newLTWithContent';
      const before = project.resources.linkTypes();
      let found = before.find((item) => item.data?.name === name);
      expect(found).to.equal(undefined);
      const linkTypeData = {
        name: name,
        displayName: name,
        inboundDisplayName: 'in',
        outboundDisplayName: 'out',
        destinationCardTypes: ['decision/cardTypes/decision'],
        sourceCardTypes: ['decision/cardTypes/decision'],
        enableLinkDescription: false,
      } as LinkType;
      const res = project.resources.byType(name, 'linkTypes');
      await res.create(linkTypeData);
      const after = project.resources.linkTypes();
      found = after.find((item) => item.data?.name === name);
      expect(found).to.not.equal(undefined);
    });
    it('try to create link type with invalid provided content', async () => {
      const name = 'decision/linkTypes/invalidLTWithContent';
      const before = project.resources.linkTypes();
      const found = before.find((item) => item.data?.name === name);
      expect(found).to.equal(undefined);
      const linkTypeData = {
        // missing mandatory value 'enableLinkDescription'
        name: name,
        displayName: name,
        inboundDisplayName: 'in',
        outboundDisplayName: 'out',
        destinationCardTypes: ['decision/cardTypes/decision'],
        sourceCardTypes: ['decision/cardTypes/decision'],
      } as LinkType;
      const res = project.resources.byType(name, 'linkTypes');
      await expect(res.create(linkTypeData)).to.be.rejectedWith(
        `Invalid content JSON: Schema '/linkTypeSchema' validation Error: requires property "enableLinkDescription"`,
      );
    });
    it('create template with provided content', async () => {
      const name = 'decision/templates/newTEMPWithContent';
      const before = project.resources.templates();
      let found = before.find((item) => item.data?.name === name);
      expect(found).to.equal(undefined);
      const templateData = {
        name: name,
        displayName: 'Test template with content',
        description: 'No description',
        category: 'Random category',
      } as TemplateMetadata;
      const res = project.resources.byType(name, 'templates');
      await res.create(templateData);
      const after = project.resources.templates();
      found = after.find((item) => item.data?.name === name);
      expect(found).to.not.equal(undefined);
    });
    it('try to create template with invalid provided content', async () => {
      const name = 'decision/templates/newTEMPWithInvalidContent';
      const before = project.resources.templates();
      const found = before.find((item) => item.data?.name === name);
      expect(found).to.equal(undefined);
      const templateData = {
        // missing name
        displayName: 'Test template with content',
        description: 'No description',
        category: 'Random category',
      } as TemplateMetadata;
      const res = project.resources.byType(name, 'templates');
      await expect(res.create(templateData)).to.be.rejectedWith(
        `Invalid content JSON: Schema '/templateSchema' validation Error: requires property "name"`,
      );
    });
    it('create workflow with provided content', async () => {
      const name = 'decision/workflows/newWFWithContent';
      const before = project.resources.workflows();
      let found = before.find((item) => item.data?.name === name);
      expect(found).to.equal(undefined);
      const workflowData = {
        name: name,
        displayName: name,
        states: [],
        transitions: [],
      } as Workflow;
      const res = project.resources.byType(name, 'workflows');
      await res.create(workflowData);
      const after = project.resources.workflows();
      found = after.find((item) => item.data?.name === name);
      expect(found).to.not.equal(undefined);
    });
    it('create calculation with provided content', async () => {
      const name = 'decision/calculations/newCALCWithContent';

      const before = project.resources.calculations();
      let found = before.find((item) => item.data?.name === name);
      expect(found).to.equal(undefined);
      const calculationData = {
        name: name,
        displayName: 'Test calculation with content',
        description: 'A test calculation for unit tests',
        calculation: '',
      } as CalculationMetadata;
      const res = project.resources.byType(name, 'calculations');
      await res.create(calculationData);
      const after = project.resources.calculations();
      found = after.find((item) => item.data?.name === name);
      expect(found).to.not.equal(undefined);
    });
    it('try to create calculation with invalid provided content', async () => {
      const name = 'decision/calculations/invalidCALCWithContent';
      const before = project.resources.calculations();
      const found = before.find((item) => item.data?.name === name);
      expect(found).to.equal(undefined);
      const calculationData = {
        // missing name
        displayName: 'Test calculation with content',
        description: 'A test calculation for unit tests',
        calculation: '',
      } as CalculationMetadata;
      const res = project.resources.byType(name, 'calculations');
      await expect(res.create(calculationData)).to.be.rejectedWith(
        `Invalid content JSON: Schema '/calculationSchema' validation Error: requires property "name"`,
      );
    });

    // Parameterized invalid name tests
    resourceConfigs.forEach((config) => {
      it(`try to create ${config.type} with invalid name`, async () => {
        const invalidChar =
          config.type === 'graphModels'
            ? 'Ä'
            : config.type === 'graphViews'
              ? 'Ö'
              : '-ööö';
        const name = `decision/${config.type}/new${invalidChar}`;

        let createPromise: Promise<unknown>;
        if (config.type === 'cardTypes') {
          const res = project.resources.byType(name, config.type);
          const args = config.createArgs || [];
          createPromise = res.createCardType(args[0]);
        } else if (config.type === 'fieldTypes') {
          const res = project.resources.byType(name, config.type);
          const args = config.createArgs || [];
          createPromise = res.createFieldType(args[0] as 'shortText');
        } else if (config.type === 'reports') {
          const res = project.resources.byType(name, config.type);
          createPromise = res.createReport();
        } else {
          const res = project.resources.byType(name, config.type);
          createPromise = res.create();
        }

        await expect(createPromise).to.be.rejectedWith(
          'Resource identifier must follow naming rules',
        );
      });
    });
    // Parameterized invalid prefix tests
    it('try to create card type with invalid project prefix', async () => {
      const name = 'unknown/cardTypes/new-one';
      const res = project.resources.byType(name, 'cardTypes');
      await expect(
        res.createCardType('decision/workflows/decision'),
      ).to.be.rejectedWith(
        "Resource name can only refer to project that it is part of. Prefix 'unknown' is not included in '[decision]'",
      );
    });
    it('try to create field type with invalid project prefix', async () => {
      const name = 'unknown/fieldTypes/new-one';
      const res = project.resources.byType(name, 'fieldTypes');
      await expect(res.createFieldType('shortText')).to.be.rejectedWith(
        "Resource name can only refer to project that it is part of. Prefix 'unknown' is not included in '[decision]'",
      );
    });
    it('try to create resources with invalid project prefix', async () => {
      const resources = [
        project.resources.byType(
          'unknown/calculations/new-one',
          'calculations',
        ),
        project.resources.byType('unknown/graphModels/new-one', 'graphModels'),
        project.resources.byType('unknown/graphViews/new-one', 'graphViews'),
        project.resources.byType('unknown/linkTypes/new-one', 'linkTypes'),
        project.resources.byType('unknown/templates/new-one', 'templates'),
        project.resources.byType('unknown/workflows/new-one', 'workflows'),
      ];
      for (const res of resources) {
        await expect(res.create()).to.be.rejectedWith(
          "Resource name can only refer to project that it is part of. Prefix 'unknown' is not included in '[decision]'",
        );
      }
    });
    it('try to create report with invalid project prefix', async () => {
      const name = 'unknown/reports/new-one';
      const res = project.resources.byType(name, 'reports');
      await expect(res.createReport()).to.be.rejectedWith(
        "Resource name can only refer to project that it is part of. Prefix 'unknown' is not included in '[decision]'",
      );
    });
    it('try to create card type with invalid content', async () => {
      const name = 'decision/cardTypes/new-one';
      const res = project.resources.byType(name, 'cardTypes');
      await expect(
        res.createCardType('decision/workflows/does-not-exist'),
      ).to.be.rejectedWith(
        "Workflow 'decision/workflows/does-not-exist' does not exist in the project",
      );
    });

    // Parameterized data tests
    resourceConfigs.forEach((config) => {
      it(`data of ${config.type}`, () => {
        const name = `decision/${config.type}/${config.identifier}`;
        const res = project.resources.byType(name, config.type);
        expect(res.data).to.deep.equal(config.expectedData);
      });
    });

    // Parameterized show tests
    resourceConfigs
      .filter(
        (config) =>
          !config.hasContent &&
          !['calculations', 'templates'].includes(config.type),
      )
      .forEach((config) => {
        it(`show ${config.type}`, async () => {
          const name = `decision/${config.type}/${config.identifier}`;
          const res = project.resources.byType(name, config.type);
          const data = await res.show();
          expect(data).to.deep.equal(config.expectedData);
        });
      });
    it('show graph model', async () => {
      const name = 'decision/graphModels/newGM';
      const res = project.resources.byType(name, 'graphModels');
      const data = await res.show();
      expect(data).to.deep.equal({
        name: 'decision/graphModels/newGM',
        displayName: '',
        content: { model: "% add your calculations here for 'newGM'" },
      });
    });
    it('show graph view', async () => {
      const name = 'decision/graphViews/newGV';
      const res = project.resources.byType(name, 'graphViews');
      const data = await res.show();
      expect(data).to.deep.equal({
        content: {
          schema: {
            $id: 'myGraphMacroSchema',
            additionalProperties: false,
            description: 'Parameters for the graph macro',
            properties: {
              model: {
                description: 'The name of the graph model',
                type: 'string',
              },
              view: {
                description: 'The name of the graph view',
                type: 'string',
              },
              cardKey: {
                description:
                  'Override default cardKey of the macro with another cardKey. Default cardKey is the card where the macro is defined in.',
                type: 'string',
              },
            },
            required: ['model', 'view'],
            title: 'Graph view',
            type: 'object',
          },
          viewTemplate: '',
        },
        name: 'decision/graphViews/newGV',
        displayName: '',
      });
    });
    it('show report', async () => {
      const name = 'decision/reports/newREP';
      const res = project.resources.byType(name, 'reports');
      let data = await res.show();
      data = removeLineBreaks(data);
      expect(data).to.deep.equal({
        content: {
          contentTemplate: `{{#each results}} * {{this.title}} {{/each}} `,
          schema: {
            $id: 'reportMacroDefaultSchema',
            additionalProperties: false,
            description:
              'A report object provides supplemental information about a report',
            properties: {
              cardKey: {
                description:
                  'Used to override the default cardKey, which is the cardKey of the card, in which the report macro is used',
                type: 'string',
              },
              name: {
                description: 'The name of the report',
                type: 'string',
              },
            },
            required: ['name'],
            title: 'Report',
            type: 'object',
          },
          queryTemplate: `select("title"). result(Card) :- parent(Card, {{cardKey}}).`,
        },
        name: 'decision/reports/newREP',
        category: 'Uncategorised report',
        displayName: '',
      });
    });
    it('show calculation', async () => {
      const name = 'decision/calculations/newCALC';
      const res = project.resources.byType(name, 'calculations');
      const data = await res.show();
      expect(data).to.have.property('name', 'decision/calculations/newCALC');
      expect(data).to.have.property('displayName', '');
      expect(data).to.have.property('description');
      expect(data).to.have.property('calculation', 'calculation.lp');
      expect(data).to.have.property('content');
      expect(data.content).to.have.property('calculation');
    });
    it('show imported report', async () => {
      const projectMini = new Project(minimalPath);
      await projectMini.populateCaches();
      const createCmdMini = new Create(projectMini);
      const importCmdMini = new Import(projectMini, createCmdMini);
      await importCmdMini.importModule(
        decisionRecordsPath,
        projectMini.basePath,
      );
      const name = 'decision/reports/newREP';
      const res = project.resources.byType(name, 'reports');
      let data = await res.show();
      data = removeLineBreaks(data);

      expect(data).to.deep.equal({
        content: {
          contentTemplate: `{{#each results}} * {{this.title}} {{/each}} `,
          schema: {
            $id: 'reportMacroDefaultSchema',
            additionalProperties: false,
            description:
              'A report object provides supplemental information about a report',
            properties: {
              cardKey: {
                description:
                  'Used to override the default cardKey, which is the cardKey of the card, in which the report macro is used',
                type: 'string',
              },
              name: {
                description: 'The name of the report',
                type: 'string',
              },
            },
            required: ['name'],
            title: 'Report',
            type: 'object',
          },
          queryTemplate: `select("title"). result(Card) :- parent(Card, {{cardKey}}).`,
        },
        name: 'decision/reports/newREP',
        displayName: '',
        category: 'Uncategorised report',
      });
    });
    it('show template', async () => {
      const name = 'decision/templates/newTEMP';
      const res = project.resources.byType(name, 'templates');
      const data = await res.show();
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { path, ...others } = data;
      expect(others).to.deep.equal({
        description: undefined,
        category: undefined,
        name: 'decision/templates/newTEMP',
        displayName: '',
        numberOfCards: 0,
      });
    });
    // Parameterized validate tests
    it('validate resources', async () => {
      const resources = resourceConfigs.map((config) =>
        project.resources.byType(
          `decision/${config.type}/${config.identifier}`,
          config.type,
        ),
      );
      for (const resource of resources) {
        await resource.validate();
        await expect(resource.validate()).to.not.be.rejected;
      }
    });
    it('try to validate missing resource types', async () => {
      const resources = [
        project.resources.byType(
          'unknown/calculations/not-exist',
          'calculations',
        ),
        project.resources.byType('unknown/cardTypes/not-exist', 'cardTypes'),
        project.resources.byType('unknown/fieldTypes/not-exist', 'fieldTypes'),
        project.resources.byType(
          'unknown/graphModels/not-exist',
          'graphModels',
        ),
        project.resources.byType('unknown/graphViews/not-exist', 'graphViews'),
        project.resources.byType('unknown/linkTypes/not-exist', 'linkTypes'),
        project.resources.byType('unknown/reports/not-exist', 'reports'),
        project.resources.byType('unknown/templates/not-exist', 'templates'),
        project.resources.byType('decision/workflows/not-exist', 'workflows'),
      ];
      for (const resource of resources) {
        await expect(resource.validate()).to.be.rejected;
      }
    });
    // Parameterized rename tests
    const renameConfigs = resourceConfigs.filter(
      (config) => !['templates'].includes(config.type),
    );
    renameConfigs.forEach((config) => {
      it(`rename ${config.type}`, async () => {
        const name = `decision/${config.type}/newResForRename`;

        if (config.type === 'cardTypes') {
          const res = project.resources.byType(name, config.type);
          const args = config.createArgs || [];
          await res.createCardType(args[0]);
          await res.rename(resourceName(`decision/${config.type}/newname`));
          expect(res.data?.name).equals(`decision/${config.type}/newname`);
          await res.delete();
        } else if (config.type === 'fieldTypes') {
          const res = project.resources.byType(name, config.type);
          const args = config.createArgs || [];
          await res.createFieldType(args[0] as 'shortText');
          await res.rename(resourceName(`decision/${config.type}/newname`));
          expect(res.data?.name).equals(`decision/${config.type}/newname`);
          await res.delete();
        } else if (config.type === 'reports') {
          const res = project.resources.byType(name, config.type);
          await res.createReport();
          await res.rename(resourceName(`decision/${config.type}/newname`));
          expect(res.data?.name).equals(`decision/${config.type}/newname`);
          await res.delete();
        } else {
          const res = project.resources.byType(name, config.type);
          await res.create();
          await res.rename(resourceName(`decision/${config.type}/newname`));
          expect(res.data?.name).equals(`decision/${config.type}/newname`);
          await res.delete();
        }
      });
    });
    it('rename template', async () => {
      const name = 'decision/templates/newResForRename';
      const res = project.resources.byType(name, 'templates');
      await res.create();
      await res.rename(resourceName('decision/templates/newname'));
      expect(res.data?.name).equals('decision/templates/newname');
      await res.delete();
    });
    it('rename card type to contain number', async () => {
      const name = 'decision/cardTypes/newResForRename';
      const res = project.resources.byType(name, 'cardTypes');
      await res.createCardType('decision/workflows/decision');
      await res.rename(resourceName('decision/cardTypes/newnameWithNumber2'));
      expect(res.data?.name).equals('decision/cardTypes/newnameWithNumber2');
      await res.update(
        {
          key: 'name',
        },
        {
          name: 'change',
          to: 'decision/cardTypes/newnameWithNumber3',
          target: 'name',
        },
      );
      expect(res.data?.name).equals('decision/cardTypes/newnameWithNumber3');
      await res.delete();
    });
    it('try to rename workflow - attempt to change prefix', async () => {
      const name = 'decision/workflows/newResForRename';
      const res = project.resources.byType(name, 'workflows');
      await res.create();
      await expect(
        res.rename(resourceName('newpre/workflows/newname')),
      ).to.be.rejectedWith('Can only rename project resources');
      await res.delete();
    });
    it('try to rename workflow - attempt to change type', async () => {
      const name = 'decision/workflows/newResForRename';
      const res = project.resources.byType(name, 'workflows');
      await res.create();
      await expect(
        res.rename(resourceName('decision/linkTypes/newname')),
      ).to.be.rejectedWith('Cannot change resource type');
      await res.delete();
    });
    it('try to rename workflow - attempt to use invalid name', async () => {
      const name = 'decision/workflows/newResForRename';
      const res = project.resources.byType(name, 'workflows');
      await res.create();
      await expect(
        res.rename(resourceName('decision/workflows/newname-ööö')),
      ).to.be.rejectedWith('Resource identifier must follow naming');
      await res.delete();
    });
    it('update card type - name', async () => {
      const name = 'decision/cardTypes/forRename';
      const res = project.resources.byType(name, 'cardTypes');
      await res.createCardType('decision/workflows/decision');
      await res.update(
        { key: 'name' },
        {
          name: 'change',
          target: '',
          to: 'decision/cardTypes/afterUpdate',
        },
      );
      expect(res.data?.name).to.equal('decision/cardTypes/afterUpdate');
    });
    it('update card type - try to "rank" scalar "name"', async () => {
      const name = 'decision/cardTypes/tryForUpdate';
      const res = project.resources.byType(name, 'cardTypes');
      await res.createCardType('decision/workflows/decision');
      await expect(
        res.update(
          { key: 'name' },
          {
            name: 'rank',
            target: '',
            newIndex: 99,
          },
        ),
      ).to.be.rejectedWith('Cannot do operation rank on scalar value');
    });
    it('update card type - try to "add" scalar "name"', async () => {
      const name = 'decision/cardTypes/tryForUpdate';
      const res = project.resources.byType(name, 'cardTypes');
      await expect(
        res.update(
          { key: 'name' },
          {
            name: 'add',
            target: '',
          },
        ),
      ).to.be.rejectedWith('Cannot do operation add on scalar value');
    });
    it('update card type - try to "remove" scalar "name"', async () => {
      const name = 'decision/cardTypes/tryForUpdate';
      const res = project.resources.byType(name, 'cardTypes');
      await expect(
        res.update(
          { key: 'name' },
          {
            name: 'remove',
            target: '',
          },
        ),
      ).to.be.rejectedWith('Cannot do operation remove on scalar value');
    });
    it('update card type - add element to alwaysVisibleFields', async () => {
      const nameFT = 'decision/fieldTypes/newOne';
      const newFieldType = project.resources.byType(nameFT, 'fieldTypes');
      await newFieldType.createFieldType('shortText');

      const name = 'decision/cardTypes/updateAlwaysVisible';
      const res = project.resources.byType(name, 'cardTypes');
      await res.createCardType('decision/workflows/decision');
      expect(res.data?.alwaysVisibleFields.length).to.equal(0);

      await res.update(
        { key: 'customFields' },
        {
          name: 'add',
          target: { name: 'decision/fieldTypes/newOne' },
        },
      );

      await res.update(
        { key: 'alwaysVisibleFields' },
        {
          name: 'add',
          target: 'decision/fieldTypes/newOne',
        },
      );
      expect((res.data as CardType).alwaysVisibleFields.length).to.equal(1);
    });
    it('update card type - remove element from alwaysVisibleFields', async () => {
      const name = 'decision/cardTypes/updateAlwaysVisible';
      const res = project.resources.byType(name, 'cardTypes');
      expect(res.data?.alwaysVisibleFields.length).to.equal(1);
      await res.update(
        { key: 'alwaysVisibleFields' },
        {
          name: 'remove',
          target: 'decision/fieldTypes/newOne',
        },
      );
      expect((res.data as CardType).alwaysVisibleFields.length).to.equal(0);
    });
    it('update card type - add two elements to alwaysVisibleFields and move the latter to first', async () => {
      const nameFT = 'decision/fieldTypes/secondNewOne';
      const secondNewFieldType = project.resources.byType(nameFT, 'fieldTypes');
      await secondNewFieldType.createFieldType('shortText');

      const name = 'decision/cardTypes/updateAlwaysVisible';
      const res = project.resources.byType(name, 'cardTypes');
      expect(res.data?.alwaysVisibleFields.length).to.equal(0);

      await res.update(
        { key: 'customFields' },
        {
          name: 'add',
          target: { name: 'decision/fieldTypes/secondNewOne' },
        },
      );

      await res.update(
        { key: 'alwaysVisibleFields' },
        {
          name: 'add',
          target: 'decision/fieldTypes/newOne',
        },
      );
      await res.update(
        { key: 'alwaysVisibleFields' },
        {
          name: 'add',
          target: 'decision/fieldTypes/secondNewOne',
        },
      );
      expect(res.data?.alwaysVisibleFields.length).to.equal(2);
      await res.update(
        { key: 'alwaysVisibleFields' },
        {
          name: 'rank',
          target: 'decision/fieldTypes/secondNewOne',
          newIndex: 0,
        },
      );
      expect(res.data?.alwaysVisibleFields.length).to.equal(2);
      expect(res.data?.alwaysVisibleFields.at(0)).to.equal(
        'decision/fieldTypes/secondNewOne',
      );
    });
    it('update card type - add element to optionallyVisibleFields', async () => {
      const name = 'decision/cardTypes/optionallyVisible';
      const res = project.resources.byType(name, 'cardTypes');
      await res.createCardType('decision/workflows/decision');

      await res.update(
        { key: 'customFields' },
        {
          name: 'add',
          target: { name: 'decision/fieldTypes/newOne' },
        },
      );

      expect((res.data as CardType).optionallyVisibleFields.length).to.equal(0);
      await res.update(
        { key: 'optionallyVisibleFields' },
        {
          name: 'add',
          target: 'decision/fieldTypes/newOne',
        },
      );
      expect((res.data as CardType).optionallyVisibleFields.length).to.equal(1);
    });
    it('update card type - remove element from optionallyVisibleFields', async () => {
      const name = 'decision/cardTypes/optionallyVisible';
      const res = project.resources.byType(name, 'cardTypes');
      expect(res.data?.optionallyVisibleFields.length).to.equal(1);
      await res.update(
        { key: 'optionallyVisibleFields' },
        {
          name: 'remove',
          target: 'decision/fieldTypes/newOne',
        },
      );
      expect((res.data as CardType).optionallyVisibleFields.length).to.equal(0);
    });
    it('update card type - add two elements to optionallyVisibleFields and move the latter to first', async () => {
      const name = 'decision/cardTypes/optionallyVisible';
      const res = project.resources.byType(name, 'cardTypes');
      expect(res.data?.optionallyVisibleFields.length).to.equal(0);

      await res.update(
        { key: 'customFields' },
        {
          name: 'add',
          target: { name: 'decision/fieldTypes/secondNewOne' },
        },
      );

      await res.update(
        { key: 'optionallyVisibleFields' },
        {
          name: 'add',
          target: 'decision/fieldTypes/newOne',
        },
      );
      await res.update(
        { key: 'optionallyVisibleFields' },
        {
          name: 'add',
          target: 'decision/fieldTypes/secondNewOne',
        },
      );
      expect((res.data as CardType).optionallyVisibleFields.length).to.equal(2);
      await res.update(
        { key: 'optionallyVisibleFields' },
        {
          name: 'rank',
          target: 'decision/fieldTypes/secondNewOne',
          newIndex: 0,
        },
      );
      expect((res.data as CardType).optionallyVisibleFields.length).to.equal(2);
      expect((res.data as CardType).optionallyVisibleFields.at(0)).to.equal(
        'decision/fieldTypes/secondNewOne',
      );
    });
    it('update card type - workflow', async () => {
      const name = 'decision/cardTypes/updateWorkflow';
      const res = project.resources.byType(name, 'cardTypes');
      await res.createCardType('decision/workflows/decision');
      await res.update(
        { key: 'workflow' },
        {
          name: 'change',
          target: '',
          to: 'decision/cardTypes/afterUpdate',
        },
      );
      expect((res.data as CardType).workflow).to.equal(
        'decision/cardTypes/afterUpdate',
      );
    });
    it('update card type - add element to customFields', async () => {
      const name = 'decision/fieldTypes/newOne';
      const fieldType = project.resources.byType(name, 'fieldTypes');
      if (!fieldType.data) {
        await fieldType.createFieldType('shortText');
      }

      const nameCT = 'decision/cardTypes/customFields';
      const res = project.resources.byType(nameCT, 'cardTypes');
      await res.createCardType('decision/workflows/decision');
      expect((res.data as CardType).customFields.length).to.equal(0);
      await res.update(
        { key: 'customFields' },
        {
          name: 'add',
          target: { name: 'decision/fieldTypes/newOne' },
        },
      );
      expect((res.data as CardType).customFields.length).to.equal(1);
    });
    it('update card type - try to add non-existing element to customFields', async () => {
      const name = 'decision/cardTypes/checkNonExistingItems';
      const res = project.resources.byType(name, 'cardTypes');
      await res.createCardType('decision/workflows/decision');
      expect(res.data?.customFields.length).to.equal(0);
      await expect(
        res.update(
          { key: 'customFields' },
          {
            name: 'add',
            target: { name: 'decision/fieldTypes/doesNotExist' },
          },
        ),
      ).to.be.rejected;
    });
    it('update card type - try to add non-existing element to alwaysVisibleFields', async () => {
      const name = 'decision/cardTypes/checkNonExistingItems';
      const res = project.resources.byType(name, 'cardTypes');
      expect(res.data?.customFields.length).to.equal(0);
      await expect(
        res.update(
          { key: 'alwaysVisibleFields' },
          {
            name: 'add',
            target: { name: 'decision/fieldTypes/doesNotExist' },
          },
        ),
      ).to.be.rejected;
      await expect(
        res.update(
          { key: 'alwaysVisibleFields' },
          {
            name: 'add',
            target: { name: 'decision/fieldTypes/newOne' },
          },
        ),
      ).to.be.rejected;
    });
    it('update card type - try to add non-existing element to optionallyVisibleFields', async () => {
      const name = 'decision/cardTypes/checkNonExistingItems';
      const res = project.resources.byType(name, 'cardTypes');
      expect(res.data?.customFields.length).to.equal(0);
      await expect(
        res.update(
          { key: 'optionallyVisibleFields' },
          {
            name: 'add',
            target: { name: 'decision/fieldTypes/doesNotExist' },
          },
        ),
      ).to.be.rejected;
      await expect(
        res.update(
          { key: 'optionallyVisibleFields' },
          {
            name: 'add',
            target: { name: 'decision/fieldTypes/newOne' },
          },
        ),
      ).to.be.rejected;
    });
    it('update card type - remove element from customFields', async () => {
      const name = 'decision/fieldTypes/newOne';
      const fieldType = project.resources.byType(name, 'fieldTypes');
      if (!fieldType.data) {
        await fieldType.createFieldType('shortText');
      }

      const nameCT = 'decision/cardTypes/customFields';
      const res = project.resources.byType(nameCT, 'cardTypes');
      if (!res.data) {
        await res.createCardType('decision/workflows/decision');
      }

      const hasField = res.data?.customFields.some(
        (field) => field.name === 'decision/fieldTypes/newOne',
      );
      if (!hasField) {
        await res.update(
          { key: 'customFields' },
          {
            name: 'add',
            target: { name: 'decision/fieldTypes/newOne' },
          },
        );
      }

      await res.update(
        { key: 'optionallyVisibleFields' },
        {
          name: 'add',
          target: 'decision/fieldTypes/newOne',
        },
      );
      await res.update(
        { key: 'alwaysVisibleFields' },
        {
          name: 'add',
          target: 'decision/fieldTypes/newOne',
        },
      );
      expect((res.data as CardType).optionallyVisibleFields.length).to.equal(1);
      expect((res.data as CardType).alwaysVisibleFields.length).to.equal(1);
      await res.update(
        { key: 'customFields' },
        {
          name: 'remove',
          target: { name: 'decision/fieldTypes/newOne' },
        },
      );
      expect((res.data as CardType).customFields.length).to.equal(0);
      expect((res.data as CardType).optionallyVisibleFields.length).to.equal(0);
      expect((res.data as CardType).alwaysVisibleFields.length).to.equal(0);
    });
    it('update card type - add two elements to customFields, then move last one to first', async () => {
      const name = 'decision/fieldTypes/newOne';
      const fieldType1 = project.resources.byType(name, 'fieldTypes');
      const name2 = 'decision/fieldTypes/secondNewOne';
      const fieldType2 = project.resources.byType(name2, 'fieldTypes');

      if (!fieldType1.data) {
        await fieldType1.createFieldType('shortText');
      }
      if (!fieldType2.data) {
        await fieldType2.createFieldType('shortText');
      }

      const nameCT = 'decision/cardTypes/customFields';
      const res = project.resources.byType(nameCT, 'cardTypes');
      if (!res.data) {
        await res.createCardType('decision/workflows/decision');
      }
      const currentFields = [...(res.data?.customFields || [])];
      for (const field of currentFields) {
        await res.update(
          { key: 'customFields' },
          {
            name: 'remove',
            target: { name: field.name },
          },
        );
      }

      expect(res.data?.customFields.length).to.equal(0);
      await res.update(
        { key: 'customFields' },
        {
          name: 'add',
          target: { name: 'decision/fieldTypes/newOne' },
        },
      );
      await res.update(
        { key: 'customFields' },
        {
          name: 'add',
          target: { name: 'decision/fieldTypes/secondNewOne' },
        },
      );
      await res.update(
        { key: 'customFields' },
        {
          name: 'rank',
          target: { name: 'decision/fieldTypes/secondNewOne' },
          newIndex: 0,
        },
      );
      expect((res.data as CardType).customFields.length).to.equal(2);
      const first = (res.data as CardType).customFields.at(0);
      expect((first as CustomField)?.name).to.equal(
        'decision/fieldTypes/secondNewOne',
      );
    });
    it('update field type', async () => {
      const name = 'decision/fieldTypes/dateFieldType';
      const res = project.resources.byType(name, 'fieldTypes');
      await res.createFieldType('dateTime');
      await res.update(
        { key: 'name' },
        {
          name: 'change',
          target: '',
          to: 'decision/fieldTypes/afterUpdate',
        },
      );
      expect(res.data?.name).to.equal('decision/fieldTypes/afterUpdate');
    });
    it('try to update field type with invalid name', async () => {
      const name = 'decision/fieldTypes/dateFieldType1';
      const res = project.resources.byType(name, 'fieldTypes');
      await res.createFieldType('dateTime');
      await expect(
        res.update(
          { key: 'name' },
          {
            name: 'change',
            target: '',
            to: 'decision/fieldTypes/afterUpdate-öööö',
          },
        ),
      ).to.be.rejectedWith('Resource identifier must follow naming rules.');
    });
    it('update field type - change data type (number -> integer)', async () => {
      let card6 = project.findCard('decision_6');
      if (card6 && card6.metadata) {
        expect(card6.metadata['decision/fieldTypes/numberOfCommits']).equals(
          1.5,
        );
      } else {
        expect(false).equals(true);
      }
      const name = 'decision/fieldTypes/numberOfCommits';
      const res = project.resources.byType(name, 'fieldTypes');
      await res.update(
        { key: 'dataType' },
        {
          name: 'change',
          target: '',
          to: 'integer',
        },
      );
      expect(res.data?.dataType).to.equal('integer');
      card6 = project.findCard('decision_6');
      if (card6 && card6.metadata) {
        expect(card6.metadata['decision/fieldTypes/numberOfCommits']).equals(1);
      } else {
        expect(false).equals(true);
      }
    });
    it('update field type - change displayName and description', async () => {
      const name = 'decision/fieldTypes/dateFieldType2';
      const res = project.resources.byType(name, 'fieldTypes');
      await res.createFieldType('shortText');
      await res.update(
        { key: 'displayName' },
        {
          name: 'change',
          target: '',
          to: 'Field for dates',
        },
      );
      await res.update(
        { key: 'description' },
        {
          name: 'change',
          target: '',
          to: 'Field description',
        },
      );
      expect((res.data as FieldType).displayName).to.equal('Field for dates');
      expect((res.data as FieldType).description).to.equal('Field description');
    });
    it('update field type - change enumValues', async () => {
      const name = 'decision/fieldTypes/enumFieldType';
      const res = project.resources.byType(name, 'fieldTypes');
      await res.createFieldType('enum');
      await res.update(
        {
          key: 'enumValues',
        },
        {
          name: 'change',
          to: {
            enumValue: 'yes',
            enumDescription: 'Definitely a yes',
            enumDisplayValue: 'YES',
          },
          target: {
            enumValue: 'value1',
          },
        },
      );
      await res.update(
        {
          key: 'enumValues',
        },
        {
          name: 'change',
          to: {
            enumValue: 'no',
            enumDescription: 'Absolutely not',
            enumDisplayValue: 'NO',
          },
          target: {
            enumValue: 'value2',
          },
        },
      );
      const enums = res.data?.enumValues;
      expect(enums?.length).to.equal(2);
      expect(enums?.at(0)?.enumValue).to.equal('yes');
      expect(enums?.at(1)?.enumValue).to.equal('no');
    });
    it('update calculation scalar values', async () => {
      const name = 'decision/calculations/newCALCWithContent';
      const res = project.resources.byType(name, 'calculations');
      await res.update(
        { key: 'displayName' },
        {
          name: 'change',
          target: '',
          to: 'Updated Calculation Display Name',
        },
      );
      await res.update(
        { key: 'description' },
        {
          name: 'change',
          target: '',
          to: 'Updated calculation description',
        },
      );
      expect(res.data?.displayName).to.equal(
        'Updated Calculation Display Name',
      );
      expect(res.data?.description).to.equal('Updated calculation description');
    });
    it('update calculation - change calculation content', async () => {
      const name = 'decision/calculations/newCALCWithContent';
      const res = project.resources.byType(name, 'calculations');
      const newCalculationContent =
        '% Updated calculation content\nupdated_rule(X) :- some_fact(X).';
      await res.update(
        { key: 'content', subKey: 'calculation' },
        {
          name: 'change',
          target: '',
          to: newCalculationContent,
        },
      );
      const data = await res.show();
      expect(data.content.calculation).to.equal(newCalculationContent);
    });
    it('update calculation - name', async () => {
      const name = 'decision/calculations/calcForRename';
      const res = project.resources.byType(name, 'calculations');
      await res.create();
      await res.update(
        { key: 'name' },
        {
          name: 'change',
          target: '',
          to: 'decision/calculations/afterCalcUpdate',
        },
      );
      expect(res.data?.name).to.equal('decision/calculations/afterCalcUpdate');
    });
    it('update link type scalar values', async () => {
      const name = 'decision/linkTypes/newLinkType';
      const res = project.resources.byType(name, 'linkTypes');
      await res.create();
      await res.update(
        {
          key: 'enableLinkDescription',
        },
        {
          name: 'change',
          target: false,
          to: true,
        },
      );
      await res.update(
        { key: 'inboundDisplayName' },
        {
          name: 'change',
          target: '',
          to: 'inbound',
        },
      );
      await res.update(
        { key: 'outboundDisplayName' },
        {
          name: 'change',
          target: '',
          to: 'outbound',
        },
      );
      const data = res.data as LinkType;
      expect(data.inboundDisplayName).to.equal('inbound');
      expect(data.outboundDisplayName).to.equal('outbound');
      expect(data.enableLinkDescription).to.equal(true);
    });
    it('update graph model scalar values', async () => {
      const name = 'decision/graphModels/newGraphModel';
      const res = project.resources.byType(name, 'graphModels');
      await res.create();
      await res.update(
        { key: 'displayName' },
        {
          name: 'change',
          target: '',
          to: 'updated',
        },
      );
      await res.update(
        { key: 'description' },
        {
          name: 'change',
          target: '',
          to: 'updated',
        },
      );
      await res.update(
        { key: 'category' },
        {
          name: 'change',
          target: '',
          to: 'updated',
        },
      );
      const data = res.data as GraphModel;
      expect(data.displayName).to.equal('updated');
      expect(data.description).to.equal('updated');
      expect(data.category).to.equal('updated');
    });
    it('update graph view scalar values', async () => {
      const name = 'decision/graphViews/newGraphView';
      const res = project.resources.byType(name, 'graphViews');
      await res.create();
      await res.update(
        { key: 'displayName' },
        {
          name: 'change',
          target: '',
          to: 'updated',
        },
      );
      await res.update(
        { key: 'description' },
        {
          name: 'change',
          target: '',
          to: 'updated',
        },
      );
      await res.update(
        { key: 'category' },
        {
          name: 'change',
          target: '',
          to: 'updated',
        },
      );
      const data = res.data as GraphView;
      expect(data.displayName).to.equal('updated');
      expect(data.description).to.equal('updated');
      expect(data.category).to.equal('updated');
    });
    it('update link type arrays', async () => {
      const name = 'decision/linkTypes/newLT';
      const res = project.resources.byType(name, 'linkTypes');
      await res.update(
        { key: 'sourceCardTypes' },
        {
          name: 'add',
          target: 'CT1',
        },
      );
      await res.update(
        { key: 'destinationCardTypes' },
        {
          name: 'add',
          target: 'CT1',
        },
      );
      await res.update(
        { key: 'sourceCardTypes' },
        {
          name: 'change',
          target: 'CT1',
          to: 'CT1NEW',
        },
      );
      await res.update(
        { key: 'destinationCardTypes' },
        {
          name: 'change',
          target: 'CT1',
          to: 'CT1NEW',
        },
      );
      const data = res.data as LinkType;
      expect(data.sourceCardTypes).to.include('CT1NEW');
      expect(data.destinationCardTypes).to.include('CT1NEW');
    });
    it('update report scalar values', async () => {
      const name = 'decision/reports/newREP';
      const res = project.resources.byType(name, 'reports');
      await res.update(
        { key: 'description' },
        {
          name: 'change',
          target: '',
          to: 'Updated description',
        },
      );
      await res.update(
        { key: 'displayName' },
        {
          name: 'change',
          target: '',
          to: 'Updated display name',
        },
      );
      await res.update(
        { key: 'category' },
        {
          name: 'change',
          target: '',
          to: 'Updated category',
        },
      );
      const data = await res.show();
      expect(data?.description).to.include('Updated');
      expect(data?.displayName).to.include('Updated');
      expect(data?.category).to.include('Updated');
    });
    it('update report content file', async () => {
      const name = 'decision/reports/newREP';
      const res = project.resources.byType(name, 'reports');
      await res.update(
        {
          key: 'content',
          subKey: 'contentTemplate',
        },
        {
          name: 'change',
          target: '',
          to: 'Updated template',
        },
      );
      const data = await res.show();
      expect(data.content.contentTemplate).to.include('Updated');
    });
    it('update template scalar values', async () => {
      const name = 'decision/templates/newTEMP';
      const res = project.resources.byType(name, 'templates');
      await res.update(
        { key: 'description' },
        {
          name: 'change',
          target: '',
          to: 'Updated description',
        },
      );
      await res.update(
        { key: 'displayName' },
        {
          name: 'change',
          target: '',
          to: 'Updated display name',
        },
      );
      await res.update(
        { key: 'category' },
        {
          name: 'change',
          target: '',
          to: 'Updated category',
        },
      );
      const data = res.data as TemplateMetadata;
      expect(data.description).to.include('Updated');
      expect(data.displayName).to.include('Updated');
      expect(data.category).to.include('Updated');
    });
    it('update workflow - rename state', async () => {
      const name = 'decision/workflows/newWF';
      const res = project.resources.byType(name, 'workflows');
      const expectedItem = { name: 'Deprecated', category: 'closed' };
      const updatedItem = { name: 'ReallyDeprecated', category: 'closed' };
      let found = res.data?.states.find(
        (item) => item.name === expectedItem.name,
      );
      expect(found).not.to.equal(undefined);
      const op = {
        name: 'change',
        target: expectedItem,
        to: updatedItem,
      } as ChangeOperation<WorkflowState>;
      await res.update({ key: 'states' }, op);
      found = (res.data as Workflow).states.find(
        (item) => item.name === expectedItem.name,
      );
      expect(found).to.equal(undefined);
      found = res.data?.states.find((item) => item.name === updatedItem.name);
      expect(found).not.to.equal(undefined);
    });
    it('update existing workflow - rename state', async () => {
      const name = 'decision/workflows/decision';
      const res = project.resources.byType(name, 'workflows');
      const cards = project.cards(project.paths.cardRootFolder);
      const cardsWithThisWorkflow = cards.filter((card) => {
        const ct = project.resources.byType(
          card.metadata?.cardType as string,
          'cardTypes',
        );
        if (ct) {
          return ct.data?.workflow === 'decision/workflows/decision';
        }
      });
      const expectedItem = { name: 'Approved', category: 'closed' };
      const updatedItem = { name: 'ReallyApproved', category: 'closed' };
      const op = {
        name: 'change',
        target: expectedItem,
        to: updatedItem,
      } as ChangeOperation<WorkflowState>;
      await res.update({ key: 'states' }, op);

      const updatedCard = project.findCard(
        cardsWithThisWorkflow.at(0)?.key as string,
      );
      expect(updatedCard?.metadata?.workflowState).to.equal('ReallyApproved');
      const opRevert = {
        name: 'change',
        target: updatedItem,
        to: expectedItem,
      } as ChangeOperation<WorkflowState>;
      await res.update({ key: 'states' }, opRevert);
    });
    it('try to update existing workflow - rename state with incomplete state', async () => {
      const name = 'decision/workflows/decision';
      const res = project.resources.byType(name, 'workflows');
      const expectedItem = { name: 'Approved', category: 'closed' };
      const updatedItem = { name: 'ReallyApproved' };
      const op = {
        name: 'change',
        target: expectedItem,
        to: updatedItem,
      } as ChangeOperation<WorkflowState>;
      await expect(res.update({ key: 'states' }, op)).to.be.rejectedWith(
        "Cannot change state 'Approved' for workflow 'decision/workflows/decision'.",
      );
    });
    it('update workflow - rename transition', async () => {
      const name = 'decision/workflows/newWF';
      const res = project.resources.byType(name, 'workflows');
      const expectedItem = {
        name: 'Approve',
        fromState: ['Draft'],
        toState: 'Approved',
      };
      const updatedItem = {
        name: 'RemoveDraftStatus',
        fromState: ['Draft'],
        toState: 'Approved',
      };
      let found = res.data?.transitions.find(
        (item) => item.name === expectedItem.name,
      );
      expect(found).not.to.equal(undefined);
      const op = {
        name: 'change',
        target: expectedItem,
        to: updatedItem,
      } as ChangeOperation<WorkflowState>;
      await res.update({ key: 'transitions' }, op);
      found = res.data?.transitions.find(
        (item) => item.name === expectedItem.name,
      );
      expect(found).to.equal(undefined);
      found = res.data?.transitions.find(
        (item) => item.name === updatedItem.name,
      );
      expect(found).not.to.equal(undefined);
    });
    it('update workflow - add state', async () => {
      const name = 'decision/workflows/newWF';
      const res = project.resources.byType(name, 'workflows');
      const newState = { name: 'OrphanState', category: 'closed' };
      let found = res.data?.states.find((item) => item.name === newState.name);
      expect(found).to.equal(undefined);
      const op = {
        name: 'add',
        target: newState,
      } as AddOperation<WorkflowState>;
      await res.update({ key: 'states' }, op);
      found = res.data?.states.find((item) => item.name === newState.name);
      expect(found).to.not.equal(undefined);
    });
    it('update workflow - add transition', async () => {
      const name = 'decision/workflows/newWF';
      const res = project.resources.byType(name, 'workflows');
      const newTransition = {
        name: 'Orphaned',
        fromState: ['*'],
        toState: 'OrphanState',
      };
      let found = res.data?.transitions.find(
        (item) => item.name === newTransition.name,
      );
      expect(found).to.equal(undefined);
      const op = {
        name: 'add',
        target: newTransition,
      } as AddOperation<WorkflowState>;
      await res.update({ key: 'transitions' }, op);
      found = res.data?.transitions.find(
        (item) => item.name === newTransition.name,
      );
      expect(found).to.not.equal(undefined);
    });
    it('update workflow - remove state', async () => {
      const name = 'decision/workflows/newWF';
      const res = project.resources.byType(name, 'workflows');
      const expectedItem = { name: 'ReallyDeprecated', category: 'closed' };
      let found = res.data?.states.find(
        (item) => item.name === expectedItem.name,
      );
      expect(found).not.to.equal(undefined);
      const op = {
        name: 'remove',
        target: expectedItem,
      } as RemoveOperation<WorkflowState>;
      await res.update({ key: 'states' }, op);
      found = res.data?.states.find((item) => item.name === expectedItem.name);
      expect(found).to.equal(undefined);
    });
    it('update workflow - remove transition', async () => {
      const name = 'decision/workflows/newWF';
      const res = project.resources.byType(name, 'workflows');
      const expectedItem = {
        name: 'RemoveDraftStatus',
        fromState: ['Draft'],
        toState: 'Approved',
      };
      let found = res.data?.transitions.find(
        (item) => item.name === expectedItem.name,
      );
      expect(found).not.to.equal(undefined);
      const op = {
        name: 'remove',
        target: expectedItem,
      } as RemoveOperation<WorkflowTransition>;
      await res.update({ key: 'transitions' }, op);
      found = res.data?.transitions.find(
        (item) => item.name === expectedItem.name,
      );
      expect(found).to.equal(undefined);
    });
    // Parameterized delete tests
    resourceConfigs.forEach((config) => {
      it(`delete ${config.type}`, async () => {
        const name = `decision/${config.type}/${config.identifier}`;
        const before = project.resources.resourceTypes(config.type);
        let found = before.find((item) => item.data?.name === name);
        expect(found).to.not.equal(undefined);

        const res = project.resources.byType(name, config.type);
        await res.delete();
        const after = project.resources.resourceTypes(config.type);
        found = after.find((item) => item.data?.name === name);
        expect(found).to.equal(undefined);
      });
    });
    // Parameterized delete non-existing tests
    resourceConfigs.forEach((config) => {
      it(`try to delete ${config.type} that does not exist`, async () => {
        const name = `decision/${config.type}/nonExisting`;
        const before = project.resources.resourceTypes(config.type);
        const found = before.find((item) => item.data?.name === name);
        expect(found).to.equal(undefined);

        const res = project.resources.byType(name, config.type);
        await expect(res.delete()).to.be.rejectedWith(
          `Resource 'nonExisting' does not exist in the project`,
        );
      });
    });
    it('try to check usage of nonExisting resource', async () => {
      const name = 'decision/workflows/nonExisting';
      const before = project.resources.workflows();
      const found = before.find((item) => item.data?.name === name);
      expect(found).to.equal(undefined);

      const res = project.resources.byType(name, 'workflows');
      await expect(res.usage()).to.be.rejectedWith(
        `Resource 'nonExisting' does not exist in the project`,
      );
    });
    it('check usage of cardType resource', async () => {
      const name = 'decision/cardTypes/decision';
      const res = project.resources.byType(name, 'cardTypes');
      await res.usage().then((references) => {
        expect(references).to.include('decision_1');
        expect(references).to.include('decision_6');
        expect(references).to.include('decision/linkTypes/testTypes');
      });
    });
    it('check usage of calculation resource', async () => {
      const name = 'decision/calculations/test';
      const res = project.resources.byType(name, 'calculations');
      const references = await res.usage();
      expect(references.length).to.be.greaterThanOrEqual(0);
    });
    it('check usage of fieldType resource', async () => {
      const name = 'decision/fieldTypes/finished';
      const res = project.resources.byType(name, 'fieldTypes');
      await res
        .usage()
        .then((references) =>
          expect(references).to.include('decision/cardTypes/decision'),
        );
    });
    it('check usage of graphModel resource', async () => {
      const name = 'decision/graphModels/test';
      const res = project.resources.byType(name, 'graphModels');
      await res
        .usage()
        .then((references) => expect(references.length).to.equal(0));
    });
    it('check usage of graphView resource', async () => {
      const name = 'decision/graphViews/test';
      const res = project.resources.byType(name, 'graphViews');
      await res
        .usage()
        .then((references) => expect(references.length).to.equal(0));
    });
    it('check usage of linkType resource', async () => {
      const name = 'decision/linkTypes/test';
      const res = project.resources.byType(name, 'linkTypes');
      await res
        .usage()
        .then((references) => expect(references.length).to.equal(0));
    });
    it('check usage of report resource', async () => {
      const name = 'decision/reports/testReport';
      const res = project.resources.byType(name, 'reports');
      await res
        .usage()
        .then((references) => expect(references).to.include('decision_5'));
    });
    it('check usage of template resource', async () => {
      const name = 'decision/templates/simplepage';
      const res = project.resources.byType(name, 'templates');
      await res
        .usage()
        .then((references) => expect(references).to.include('decision_5'));
    });
    it('check usage of workflow resource', async () => {
      const name = 'decision/workflows/decision';
      const res = project.resources.byType(name, 'workflows');
      await res
        .usage()
        .then((references) =>
          expect(references).to.include('decision/cardTypes/decision'),
        );
    });
  });
});
