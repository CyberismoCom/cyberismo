import { expect, describe, it, beforeAll, afterAll } from 'vitest';

import { join } from 'node:path';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';

import { copyDir } from '../src/utils/file-utils.js';
import { getTestProject } from './helpers/test-utils.js';
import type { Checkout } from '../src/containers/project.js';
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
  Workflow,
  WorkflowState,
  WorkflowTransition,
  ChangeOperation,
  RemoveOperation,
} from '@cyberismo/model';
import { Workspace } from '../src/workspace/workspace.js';
import { SYSTEM_ACTOR } from '../src/utils/tx-record.js';
import { updateCardContent, updateCardMetadata } from '../src/cards/update.js';
import { findCard } from '../src/cards/read.js';

describe('resources', function () {
  const baseDir = import.meta.dirname;
  const testDir = join(baseDir, 'tmp-resource-tests');
  const decisionRecordsPath = join(testDir, 'valid/decision-records');
  let checkout: Checkout;

  beforeAll(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data/', testDir);
    checkout = getTestProject(decisionRecordsPath);
    await checkout.populateCaches();
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('resource-cache', () => {
    it('collect local resources', () => {
      // Resources should be automatically collected on Project initialization
      const calcCount = checkout.resources.calculations().length;
      const cardTypesCount = checkout.resources.cardTypes().length;
      const fieldTypesCount = checkout.resources.fieldTypes().length;
      const graphModelCount = checkout.resources.graphModels().length;
      const graphViewCount = checkout.resources.graphViews().length;
      const linkTypesCount = checkout.resources.linkTypes().length;
      const reportsCount = checkout.resources.reports().length;
      const templatesCount = checkout.resources.templates().length;
      const workflowsCount = checkout.resources.workflows().length;

      expect(calcCount).not.toBe(0);
      expect(cardTypesCount).not.toBe(0);
      expect(fieldTypesCount).not.toBe(0);
      expect(graphModelCount).not.toBe(0);
      expect(graphViewCount).not.toBe(0);
      expect(linkTypesCount).not.toBe(0);
      expect(reportsCount).not.toBe(0);
      expect(templatesCount).not.toBe(0);
      expect(workflowsCount).not.toBe(0);
    });

    it('resource existence checks', () => {
      // Test that basic resources exist
      const testWorkflow = `${checkout.projectPrefix}/workflows/decision`;
      const testCardType = `${checkout.projectPrefix}/cardTypes/decision`;
      const testFieldType = `${checkout.projectPrefix}/fieldTypes/finished`;

      expect(checkout.resources.exists(testWorkflow)).toBe(true);
      expect(checkout.resources.exists(testCardType)).toBe(true);
      expect(checkout.resources.exists(testFieldType)).toBe(true);

      // Test non-existent resource
      expect(checkout.resources.exists('nonexistent')).toBe(false);
    });
  });

  describe('resource basic operations', () => {
    const baseDir = import.meta.dirname;
    const testDir = join(baseDir, 'tmp-resource-classes-tests');
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    let checkout: Checkout;

    beforeAll(async () => {
      mkdirSync(testDir, { recursive: true });
      await copyDir('test/test-data/', testDir);
      checkout = getTestProject(decisionRecordsPath);
      await checkout.populateCaches();
    });

    afterAll(() => {
      rmSync(testDir, { recursive: true, force: true });
    });

    it('calculation category lifecycle', async () => {
      const existingCalculations = checkout.resources.calculations();
      let found;

      // Verify no calculation with the test names exists
      const withCategoryCalculationsName =
        'decision/calculations/newCALCWithCategory';
      found = existingCalculations.find(
        (item) => item.data?.name === withCategoryCalculationsName,
      );
      expect(found).toBeUndefined();

      const withoutCategoryCalculationsName =
        'decision/calculations/newCALCWithoutCategory';
      found = existingCalculations.find(
        (item) => item.data?.name === withoutCategoryCalculationsName,
      );
      expect(found).toBeUndefined();

      // Create new calculations
      const calculationDataWithCategory = {
        name: withCategoryCalculationsName,
        displayName: 'Test calculation with category',
        description: 'A test calculation with category',
        category: 'Security',
        calculation: '',
      } as CalculationMetadata;

      const calculationDataWithoutCategory = {
        name: withoutCategoryCalculationsName,
        displayName: 'Test calculation with category',
        description: 'A test calculation with category',
        calculation: '',
      } as CalculationMetadata;

      await checkout.resources
        .byType(withCategoryCalculationsName, 'calculations')
        .create(calculationDataWithCategory);
      await checkout.resources
        .byType(withoutCategoryCalculationsName, 'calculations')
        .create(calculationDataWithoutCategory);

      // Verify created calculations
      const afterCreation = checkout.resources.calculations();

      const foundWithCategory = afterCreation.find(
        (item) => item.data?.name === withCategoryCalculationsName,
      );
      expect(foundWithCategory).not.toBeUndefined();
      expect(foundWithCategory!.data!.category).toBe('Security');

      const foundWithoutCategory = afterCreation.find(
        (item) => item.data?.name === withoutCategoryCalculationsName,
      );
      expect(foundWithoutCategory).not.toBeUndefined();
      expect(foundWithoutCategory!.data!.category).toBeUndefined();

      // Update created calculations
      await checkout.resources
        .byType(withCategoryCalculationsName, 'calculations')
        .update({ key: 'category' }, {
          name: 'change',
          to: 'calculation1',
        } as ChangeOperation<string>);

      await checkout.resources
        .byType(withoutCategoryCalculationsName, 'calculations')
        .update({ key: 'category' }, {
          name: 'change',
          to: 'calculation2',
        } as ChangeOperation<string>);

      // Verify updated calculations
      const afterUpdate = checkout.resources.calculations();

      const updatedFoundWithCategory = afterUpdate.find(
        (item) => item.data?.name === withCategoryCalculationsName,
      );
      expect(updatedFoundWithCategory).not.toBeUndefined();
      expect(updatedFoundWithCategory!.data!.category).toBe('calculation1');

      const updatedFoundWithoutCategory = afterUpdate.find(
        (item) => item.data?.name === withoutCategoryCalculationsName,
      );
      expect(updatedFoundWithoutCategory).not.toBeUndefined();
      expect(updatedFoundWithoutCategory!.data!.category).toBe('calculation2');
    });
    it('cardType category lifecycle', async () => {
      const existingCardTypes = checkout.resources.cardTypes();
      let found;

      // Verify no card type with the test names exists
      const withCategoryCardTypeName =
        'decision/cardTypes/newCTWithCategoryLifecycle';
      found = existingCardTypes.find(
        (item) => item.data?.name === withCategoryCardTypeName,
      );
      expect(found).toBeUndefined();

      const withoutCategoryCardTypeName =
        'decision/cardTypes/newCTWithoutCategoryLifecycle';
      found = existingCardTypes.find(
        (item) => item.data?.name === withoutCategoryCardTypeName,
      );
      expect(found).toBeUndefined();

      // Create new card types
      const cardTypeDataWithCategory = {
        name: withCategoryCardTypeName,
        displayName: 'Test card type with category',
        category: 'Security',
        workflow: 'decision/workflows/decision',
        customFields: [],
        alwaysVisibleFields: [],
        optionallyVisibleFields: [],
      } as CardType;

      const cardTypeDataWithoutCategory = {
        name: withoutCategoryCardTypeName,
        displayName: 'Test card type without category',
        workflow: 'decision/workflows/decision',
        customFields: [],
        alwaysVisibleFields: [],
        optionallyVisibleFields: [],
      } as CardType;

      await checkout.resources
        .byType(withCategoryCardTypeName, 'cardTypes')
        .create(cardTypeDataWithCategory);
      await checkout.resources
        .byType(withoutCategoryCardTypeName, 'cardTypes')
        .create(cardTypeDataWithoutCategory);

      // Verify created card types
      const afterCreation = checkout.resources.cardTypes();

      const foundWithCategory = afterCreation.find(
        (item) => item.data?.name === withCategoryCardTypeName,
      );
      expect(foundWithCategory).not.toBeUndefined();
      expect(foundWithCategory!.data!.category).toBe('Security');

      const foundWithoutCategory = afterCreation.find(
        (item) => item.data?.name === withoutCategoryCardTypeName,
      );
      expect(foundWithoutCategory).not.toBeUndefined();
      expect(foundWithoutCategory!.data!.category).toBeUndefined();

      // Update created card types
      await checkout.resources
        .byType(withCategoryCardTypeName, 'cardTypes')
        .update({ key: 'category' }, {
          name: 'change',
          to: 'cardType1',
        } as ChangeOperation<string>);

      await checkout.resources
        .byType(withoutCategoryCardTypeName, 'cardTypes')
        .update({ key: 'category' }, {
          name: 'change',
          to: 'cardType2',
        } as ChangeOperation<string>);

      // Verify updated card types
      const afterUpdate = checkout.resources.cardTypes();

      const updatedFoundWithCategory = afterUpdate.find(
        (item) => item.data?.name === withCategoryCardTypeName,
      );
      expect(updatedFoundWithCategory).not.toBeUndefined();
      expect(updatedFoundWithCategory!.data!.category).toBe('cardType1');

      const updatedFoundWithoutCategory = afterUpdate.find(
        (item) => item.data?.name === withoutCategoryCardTypeName,
      );
      expect(updatedFoundWithoutCategory).not.toBeUndefined();
      expect(updatedFoundWithoutCategory!.data!.category).toBe('cardType2');
    });
    it('linkType category lifecycle', async () => {
      const existingLinkTypes = checkout.resources.linkTypes();
      let found;

      // Verify no link type with the test names exists
      const withCategoryLinkTypeName =
        'decision/linkTypes/newLTWithCategoryLifecycle';
      found = existingLinkTypes.find(
        (item) => item.data?.name === withCategoryLinkTypeName,
      );
      expect(found).toBeUndefined();

      const withoutCategoryLinkTypeName =
        'decision/linkTypes/newLTWithoutCategoryLifecycle';
      found = existingLinkTypes.find(
        (item) => item.data?.name === withoutCategoryLinkTypeName,
      );
      expect(found).toBeUndefined();

      // Create new link types
      const linkTypeDataWithCategory = {
        name: withCategoryLinkTypeName,
        displayName: 'Test link type with category',
        category: 'Relationships',
        inboundDisplayName: 'in',
        outboundDisplayName: 'out',
        destinationCardTypes: ['decision/cardTypes/decision'],
        sourceCardTypes: ['decision/cardTypes/decision'],
        enableLinkDescription: false,
      } as LinkType;

      const linkTypeDataWithoutCategory = {
        name: withoutCategoryLinkTypeName,
        displayName: 'Test link type without category',
        inboundDisplayName: 'in',
        outboundDisplayName: 'out',
        destinationCardTypes: ['decision/cardTypes/decision'],
        sourceCardTypes: ['decision/cardTypes/decision'],
        enableLinkDescription: false,
      } as LinkType;

      await checkout.resources
        .byType(withCategoryLinkTypeName, 'linkTypes')
        .create(linkTypeDataWithCategory);
      await checkout.resources
        .byType(withoutCategoryLinkTypeName, 'linkTypes')
        .create(linkTypeDataWithoutCategory);

      // Verify created link types
      const afterCreation = checkout.resources.linkTypes();

      const foundWithCategory = afterCreation.find(
        (item) => item.data?.name === withCategoryLinkTypeName,
      );
      expect(foundWithCategory).not.toBeUndefined();
      expect(foundWithCategory!.data!.category).toBe('Relationships');

      const foundWithoutCategory = afterCreation.find(
        (item) => item.data?.name === withoutCategoryLinkTypeName,
      );
      expect(foundWithoutCategory).not.toBeUndefined();
      expect(foundWithoutCategory!.data!.category).toBeUndefined();

      // Update created link types
      await checkout.resources
        .byType(withCategoryLinkTypeName, 'linkTypes')
        .update({ key: 'category' }, {
          name: 'change',
          to: 'linkType1',
        } as ChangeOperation<string>);

      await checkout.resources
        .byType(withoutCategoryLinkTypeName, 'linkTypes')
        .update({ key: 'category' }, {
          name: 'change',
          to: 'linkType2',
        } as ChangeOperation<string>);

      // Verify updated link types
      const afterUpdate = checkout.resources.linkTypes();

      const updatedFoundWithCategory = afterUpdate.find(
        (item) => item.data?.name === withCategoryLinkTypeName,
      );
      expect(updatedFoundWithCategory).not.toBeUndefined();
      expect(updatedFoundWithCategory!.data!.category).toBe('linkType1');

      const updatedFoundWithoutCategory = afterUpdate.find(
        (item) => item.data?.name === withoutCategoryLinkTypeName,
      );
      expect(updatedFoundWithoutCategory).not.toBeUndefined();
      expect(updatedFoundWithoutCategory?.data?.category).toBe('linkType2');
    });
    it('fieldType category lifecycle', async () => {
      const existingFieldTypes = checkout.resources.fieldTypes();
      let found;

      // Verify no field type with the test names exists
      const withCategoryFieldTypeName =
        'decision/fieldTypes/newFTWithCategoryLifecycle';
      found = existingFieldTypes.find(
        (item) => item.data?.name === withCategoryFieldTypeName,
      );
      expect(found).toBeUndefined();

      const withoutCategoryFieldTypeName =
        'decision/fieldTypes/newFTWithoutCategoryLifecycle';
      found = existingFieldTypes.find(
        (item) => item.data?.name === withoutCategoryFieldTypeName,
      );
      expect(found).toBeUndefined();

      // Create new field types
      const fieldTypeDataWithCategory = {
        name: withCategoryFieldTypeName,
        displayName: 'Test field type with category',
        category: 'Custom',
        dataType: 'shortText',
      } as FieldType;

      const fieldTypeDataWithoutCategory = {
        name: withoutCategoryFieldTypeName,
        displayName: 'Test field type without category',
        dataType: 'shortText',
      } as FieldType;

      await checkout.resources
        .byType(withCategoryFieldTypeName, 'fieldTypes')
        .create(fieldTypeDataWithCategory);
      await checkout.resources
        .byType(withoutCategoryFieldTypeName, 'fieldTypes')
        .create(fieldTypeDataWithoutCategory);

      // Verify created field types
      const afterCreation = checkout.resources.fieldTypes();

      const foundWithCategory = afterCreation.find(
        (item) => item.data?.name === withCategoryFieldTypeName,
      );
      expect(foundWithCategory).not.toBeUndefined();
      expect(foundWithCategory!.data!.category).toBe('Custom');

      const foundWithoutCategory = afterCreation.find(
        (item) => item.data?.name === withoutCategoryFieldTypeName,
      );
      expect(foundWithoutCategory).not.toBeUndefined();
      expect(foundWithoutCategory!.data!.category).toBeUndefined();

      // Update created field types
      await checkout.resources
        .byType(withCategoryFieldTypeName, 'fieldTypes')
        .update({ key: 'category' }, {
          name: 'change',
          to: 'fieldType1',
        } as ChangeOperation<string>);

      await checkout.resources
        .byType(withoutCategoryFieldTypeName, 'fieldTypes')
        .update({ key: 'category' }, {
          name: 'change',
          to: 'fieldType2',
        } as ChangeOperation<string>);

      // Verify updated field types
      const afterUpdate = checkout.resources.fieldTypes();

      const updatedFoundWithCategory = afterUpdate.find(
        (item) => item.data?.name === withCategoryFieldTypeName,
      );
      expect(updatedFoundWithCategory).not.toBeUndefined();
      expect(updatedFoundWithCategory!.data!.category).toBe('fieldType1');

      const updatedFoundWithoutCategory = afterUpdate.find(
        (item) => item.data?.name === withoutCategoryFieldTypeName,
      );
      expect(updatedFoundWithoutCategory).not.toBeUndefined();
      expect(updatedFoundWithoutCategory!.data!.category).toBe('fieldType2');
    });
    it('report category lifecycle', async () => {
      const existingReports = checkout.resources.reports();
      let found;

      // Verify no report with the test names exists
      const withCategoryReportName =
        'decision/reports/newREPWithCategoryLifecycle';
      found = existingReports.find(
        (item) => item.data?.name === withCategoryReportName,
      );
      expect(found).toBeUndefined();

      const withoutCategoryReportName =
        'decision/reports/newREPWithoutCategoryLifecycle';
      found = existingReports.find(
        (item) => item.data?.name === withoutCategoryReportName,
      );
      expect(found).toBeUndefined();

      // Create new reports
      const reportDataWithCategory = {
        name: withCategoryReportName,
        displayName: 'Test report with category',
        category: 'Analytics',
      } as Report;

      const reportDataWithoutCategory = {
        name: withoutCategoryReportName,
        displayName: 'Test report without category',
      } as Report;

      await checkout.resources
        .byType(withCategoryReportName, 'reports')
        .create(reportDataWithCategory);
      await checkout.resources
        .byType(withoutCategoryReportName, 'reports')
        .create(reportDataWithoutCategory);

      // Verify created reports
      const afterCreation = checkout.resources.reports();

      const foundWithCategory = afterCreation.find(
        (item) => item.data?.name === withCategoryReportName,
      );
      expect(foundWithCategory).not.toBeUndefined();
      expect(foundWithCategory!.data!.category).toBe('Analytics');

      const foundWithoutCategory = afterCreation.find(
        (item) => item.data?.name === withoutCategoryReportName,
      );
      expect(foundWithoutCategory).not.toBeUndefined();
      expect(foundWithoutCategory?.data?.category).toBeUndefined();

      // Update created reports
      await checkout.resources
        .byType(withCategoryReportName, 'reports')
        .update({ key: 'category' }, {
          name: 'change',
          to: 'report1',
        } as ChangeOperation<string>);

      await checkout.resources
        .byType(withoutCategoryReportName, 'reports')
        .update({ key: 'category' }, {
          name: 'change',
          to: 'report2',
        } as ChangeOperation<string>);

      // Verify updated reports
      const afterUpdate = checkout.resources.reports();

      const updatedFoundWithCategory = afterUpdate.find(
        (item) => item.data?.name === withCategoryReportName,
      );
      expect(updatedFoundWithCategory).not.toBeUndefined();
      expect(updatedFoundWithCategory?.data?.category).toBe('report1');

      const updatedFoundWithoutCategory = afterUpdate.find(
        (item) => item.data?.name === withoutCategoryReportName,
      );
      expect(updatedFoundWithoutCategory).not.toBeUndefined();
      expect(updatedFoundWithoutCategory?.data?.category).toBe('report2');
    });
    it('workflow category lifecycle', async () => {
      const existingWorkflows = checkout.resources.workflows();
      let found;

      // Verify no workflow with the test names exists
      const withCategoryWorkflowName =
        'decision/workflows/newWFWithCategoryLifecycle';
      found = existingWorkflows.find(
        (item) => item.data?.name === withCategoryWorkflowName,
      );
      expect(found).toBeUndefined();

      const withoutCategoryWorkflowName =
        'decision/workflows/newWFWithoutCategoryLifecycle';
      found = existingWorkflows.find(
        (item) => item.data?.name === withoutCategoryWorkflowName,
      );
      expect(found).toBeUndefined();

      // Create new workflows
      const workflowDataWithCategory = {
        name: withCategoryWorkflowName,
        displayName: 'Test workflow with category',
        category: 'Process',
        states: [
          { name: 'Draft', category: 'initial' },
          { name: 'Done', category: 'closed' },
        ],
        transitions: [
          { name: 'Create', fromState: [''], toState: 'Draft' },
          { name: 'Complete', fromState: ['Draft'], toState: 'Done' },
        ],
      } as Workflow;

      const workflowDataWithoutCategory = {
        name: withoutCategoryWorkflowName,
        displayName: 'Test workflow without category',
        states: [
          { name: 'Draft', category: 'initial' },
          { name: 'Done', category: 'closed' },
        ],
        transitions: [
          { name: 'Create', fromState: [''], toState: 'Draft' },
          { name: 'Complete', fromState: ['Draft'], toState: 'Done' },
        ],
      } as Workflow;

      await checkout.resources
        .byType(withCategoryWorkflowName, 'workflows')
        .create(workflowDataWithCategory);
      await checkout.resources
        .byType(withoutCategoryWorkflowName, 'workflows')
        .create(workflowDataWithoutCategory);

      // Verify created workflows
      const afterCreation = checkout.resources.workflows();

      const foundWithCategory = afterCreation.find(
        (item) => item.data?.name === withCategoryWorkflowName,
      );
      expect(foundWithCategory).not.toBeUndefined();
      expect(foundWithCategory?.data?.category).toBe('Process');

      const foundWithoutCategory = afterCreation.find(
        (item) => item.data?.name === withoutCategoryWorkflowName,
      );
      expect(foundWithoutCategory).not.toBeUndefined();
      expect(foundWithoutCategory?.data?.category).toBeUndefined();

      // Update created workflows
      await checkout.resources
        .byType(withCategoryWorkflowName, 'workflows')
        .update({ key: 'category' }, {
          name: 'change',
          to: 'workflow1',
        } as ChangeOperation<string>);

      await checkout.resources
        .byType(withoutCategoryWorkflowName, 'workflows')
        .update({ key: 'category' }, {
          name: 'change',
          to: 'workflow2',
        } as ChangeOperation<string>);

      // Verify updated workflows
      const afterUpdate = checkout.resources.workflows();

      const updatedFoundWithCategory = afterUpdate.find(
        (item) => item.data?.name === withCategoryWorkflowName,
      );
      expect(updatedFoundWithCategory).not.toBeUndefined();
      expect(updatedFoundWithCategory?.data?.category).toBe('workflow1');

      const updatedFoundWithoutCategory = afterUpdate.find(
        (item) => item.data?.name === withoutCategoryWorkflowName,
      );
      expect(updatedFoundWithoutCategory).not.toBeUndefined();
      expect(updatedFoundWithoutCategory?.data?.category).toBe('workflow2');
    });

    it('try to validate missing resource types', async () => {
      const resources = [
        checkout.resources.byType(
          'unknown/calculations/not-exist',
          'calculations',
        ),
        checkout.resources.byType('unknown/cardTypes/not-exist', 'cardTypes'),
        checkout.resources.byType('unknown/fieldTypes/not-exist', 'fieldTypes'),
        checkout.resources.byType(
          'unknown/graphModels/not-exist',
          'graphModels',
        ),
        checkout.resources.byType('unknown/graphViews/not-exist', 'graphViews'),
        checkout.resources.byType('unknown/linkTypes/not-exist', 'linkTypes'),
        checkout.resources.byType('unknown/reports/not-exist', 'reports'),
        checkout.resources.byType('unknown/templates/not-exist', 'templates'),
        checkout.resources.byType('decision/workflows/not-exist', 'workflows'),
      ];
      for (const resource of resources) {
        await expect(resource.validate()).rejects.toThrow();
      }
    });
    // The only test to rename a template no card read has loaded a tree for.
    it('rename template', async () => {
      const name = 'decision/templates/newResForRename';
      const res = checkout.resources.byType(name, 'templates');
      await res.create();
      await res.rename('newname');
      expect(res.data?.name).equals('decision/templates/newname');
      await res.delete();
    });
    it('rename card type to contain number', async () => {
      const name = 'decision/cardTypes/newResForRename';
      const res = checkout.resources.byType(name, 'cardTypes');
      await res.createCardType('decision/workflows/decision');
      await res.rename('newnameWithNumber2');
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
    it('update card type - name', async () => {
      const name = 'decision/cardTypes/forRename';
      const res = checkout.resources.byType(name, 'cardTypes');
      await res.createCardType('decision/workflows/decision');
      await res.update(
        { key: 'name' },
        {
          name: 'change',
          target: '',
          to: 'decision/cardTypes/afterUpdate',
        },
      );
      expect(res.data?.name).toBe('decision/cardTypes/afterUpdate');
    });
    it('update card type - try to "rank" scalar "name"', async () => {
      const name = 'decision/cardTypes/tryForUpdate';
      const res = checkout.resources.byType(name, 'cardTypes');
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
      ).rejects.toThrow('Cannot do operation rank on scalar value');
    });
    it('update card type - try to "add" scalar "name"', async () => {
      const name = 'decision/cardTypes/tryForUpdate';
      const res = checkout.resources.byType(name, 'cardTypes');
      await expect(
        res.update(
          { key: 'name' },
          {
            name: 'add',
            target: '',
          },
        ),
      ).rejects.toThrow('Cannot do operation add on scalar value');
    });
    it('update card type - try to "remove" scalar "name"', async () => {
      const name = 'decision/cardTypes/tryForUpdate';
      const res = checkout.resources.byType(name, 'cardTypes');
      await expect(
        res.update(
          { key: 'name' },
          {
            name: 'remove',
            target: '',
          },
        ),
      ).rejects.toThrow('Cannot do operation remove on scalar value');
    });
    it('update card type - add element to alwaysVisibleFields', async () => {
      const nameFT = 'decision/fieldTypes/newOne';
      const newFieldType = checkout.resources.byType(nameFT, 'fieldTypes');
      await newFieldType.createFieldType('shortText');

      const name = 'decision/cardTypes/updateAlwaysVisible';
      const res = checkout.resources.byType(name, 'cardTypes');
      await res.createCardType('decision/workflows/decision');
      expect(res.data?.alwaysVisibleFields.length).toBe(0);

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
      expect((res.data as CardType).alwaysVisibleFields.length).toBe(1);
    });
    it('update card type - remove element from alwaysVisibleFields', async () => {
      const name = 'decision/cardTypes/updateAlwaysVisible';
      const res = checkout.resources.byType(name, 'cardTypes');
      expect(res.data?.alwaysVisibleFields.length).toBe(1);
      await res.update(
        { key: 'alwaysVisibleFields' },
        {
          name: 'remove',
          target: 'decision/fieldTypes/newOne',
        },
      );
      expect((res.data as CardType).alwaysVisibleFields.length).toBe(0);
    });
    it('update card type - add two elements to alwaysVisibleFields and move the latter to first', async () => {
      const nameFT = 'decision/fieldTypes/secondNewOne';
      const secondNewFieldType = checkout.resources.byType(
        nameFT,
        'fieldTypes',
      );
      await secondNewFieldType.createFieldType('shortText');

      const name = 'decision/cardTypes/updateAlwaysVisible';
      const res = checkout.resources.byType(name, 'cardTypes');
      expect(res.data?.alwaysVisibleFields.length).toBe(0);

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
      expect(res.data?.alwaysVisibleFields.length).toBe(2);
      await res.update(
        { key: 'alwaysVisibleFields' },
        {
          name: 'rank',
          target: 'decision/fieldTypes/secondNewOne',
          newIndex: 0,
        },
      );
      expect(res.data?.alwaysVisibleFields.length).toBe(2);
      expect(res.data?.alwaysVisibleFields.at(0)).toBe(
        'decision/fieldTypes/secondNewOne',
      );
    });
    it('update card type - add element to optionallyVisibleFields', async () => {
      const name = 'decision/cardTypes/optionallyVisible';
      const res = checkout.resources.byType(name, 'cardTypes');
      await res.createCardType('decision/workflows/decision');

      await res.update(
        { key: 'customFields' },
        {
          name: 'add',
          target: { name: 'decision/fieldTypes/newOne' },
        },
      );

      expect((res.data as CardType).optionallyVisibleFields.length).toBe(0);
      await res.update(
        { key: 'optionallyVisibleFields' },
        {
          name: 'add',
          target: 'decision/fieldTypes/newOne',
        },
      );
      expect((res.data as CardType).optionallyVisibleFields.length).toBe(1);
    });
    it('update card type - remove element from optionallyVisibleFields', async () => {
      const name = 'decision/cardTypes/optionallyVisible';
      const res = checkout.resources.byType(name, 'cardTypes');
      expect(res.data?.optionallyVisibleFields.length).toBe(1);
      await res.update(
        { key: 'optionallyVisibleFields' },
        {
          name: 'remove',
          target: 'decision/fieldTypes/newOne',
        },
      );
      expect((res.data as CardType).optionallyVisibleFields.length).toBe(0);
    });
    it('update card type - add two elements to optionallyVisibleFields and move the latter to first', async () => {
      const name = 'decision/cardTypes/optionallyVisible';
      const res = checkout.resources.byType(name, 'cardTypes');
      expect(res.data?.optionallyVisibleFields.length).toBe(0);

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
      expect((res.data as CardType).optionallyVisibleFields.length).toBe(2);
      await res.update(
        { key: 'optionallyVisibleFields' },
        {
          name: 'rank',
          target: 'decision/fieldTypes/secondNewOne',
          newIndex: 0,
        },
      );
      expect((res.data as CardType).optionallyVisibleFields.length).toBe(2);
      expect((res.data as CardType).optionallyVisibleFields.at(0)).toBe(
        'decision/fieldTypes/secondNewOne',
      );
    });
    it('update card type - workflow', async () => {
      const name = 'decision/cardTypes/updateWorkflow';
      const res = checkout.resources.byType(name, 'cardTypes');
      await res.createCardType('decision/workflows/decision');
      await res.update(
        { key: 'workflow' },
        {
          name: 'change',
          target: '',
          to: 'decision/cardTypes/afterUpdate',
        },
      );
      expect((res.data as CardType).workflow).toBe(
        'decision/cardTypes/afterUpdate',
      );
    });
    it('update card type - add element to customFields', async () => {
      const nameCT = 'decision/cardTypes/customFields';
      const res = checkout.resources.byType(nameCT, 'cardTypes');
      await res.createCardType('decision/workflows/decision');
      expect((res.data as CardType).customFields.length).toBe(0);
      await res.update(
        { key: 'customFields' },
        {
          name: 'add',
          target: { name: 'decision/fieldTypes/newOne' },
        },
      );
      expect((res.data as CardType).customFields.length).toBe(1);
    });
    it('update card type - try to add non-existing element to customFields', async () => {
      const name = 'decision/cardTypes/checkNonExistingItems';
      const res = checkout.resources.byType(name, 'cardTypes');
      await res.createCardType('decision/workflows/decision');
      expect(res.data?.customFields.length).toBe(0);
      await expect(
        res.update(
          { key: 'customFields' },
          {
            name: 'add',
            target: { name: 'decision/fieldTypes/doesNotExist' },
          },
        ),
      ).rejects.toThrow();
    });
    it('update card type - try to add non-existing element to alwaysVisibleFields', async () => {
      const name = 'decision/cardTypes/checkNonExistingItems';
      const res = checkout.resources.byType(name, 'cardTypes');
      expect(res.data?.customFields.length).toBe(0);
      await expect(
        res.update(
          { key: 'alwaysVisibleFields' },
          {
            name: 'add',
            target: { name: 'decision/fieldTypes/doesNotExist' },
          },
        ),
      ).rejects.toThrow();
      await expect(
        res.update(
          { key: 'alwaysVisibleFields' },
          {
            name: 'add',
            target: { name: 'decision/fieldTypes/newOne' },
          },
        ),
      ).rejects.toThrow();
    });
    it('update card type - try to add non-existing element to optionallyVisibleFields', async () => {
      const name = 'decision/cardTypes/checkNonExistingItems';
      const res = checkout.resources.byType(name, 'cardTypes');
      expect(res.data?.customFields.length).toBe(0);
      await expect(
        res.update(
          { key: 'optionallyVisibleFields' },
          {
            name: 'add',
            target: { name: 'decision/fieldTypes/doesNotExist' },
          },
        ),
      ).rejects.toThrow();
      await expect(
        res.update(
          { key: 'optionallyVisibleFields' },
          {
            name: 'add',
            target: { name: 'decision/fieldTypes/newOne' },
          },
        ),
      ).rejects.toThrow();
    });
    it('update card type - remove element from customFields', async () => {
      const nameCT = 'decision/cardTypes/customFields';
      const res = checkout.resources.byType(nameCT, 'cardTypes');

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
      expect((res.data as CardType).optionallyVisibleFields.length).toBe(1);
      expect((res.data as CardType).alwaysVisibleFields.length).toBe(1);
      await res.update(
        { key: 'customFields' },
        {
          name: 'remove',
          target: { name: 'decision/fieldTypes/newOne' },
        },
      );
      expect((res.data as CardType).customFields.length).toBe(0);
      expect((res.data as CardType).optionallyVisibleFields.length).toBe(0);
      expect((res.data as CardType).alwaysVisibleFields.length).toBe(0);
    });
    it('update card type - add two elements to customFields, then move last one to first', async () => {
      const nameCT = 'decision/cardTypes/customFields';
      const res = checkout.resources.byType(nameCT, 'cardTypes');

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

      expect(res.data?.customFields.length).toBe(0);
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
      expect((res.data as CardType).customFields.length).toBe(2);
      const first = (res.data as CardType).customFields.at(0);
      expect((first as CustomField)?.name).toBe(
        'decision/fieldTypes/secondNewOne',
      );
    });
    it('update field type', async () => {
      const name = 'decision/fieldTypes/dateFieldType';
      const res = checkout.resources.byType(name, 'fieldTypes');
      await res.createFieldType('dateTime');
      await res.update(
        { key: 'name' },
        {
          name: 'change',
          target: '',
          to: 'decision/fieldTypes/afterUpdate',
        },
      );
      expect(res.data?.name).toBe('decision/fieldTypes/afterUpdate');
    });
    it('try to update field type with invalid name', async () => {
      const name = 'decision/fieldTypes/dateFieldType1';
      const res = checkout.resources.byType(name, 'fieldTypes');
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
      ).rejects.toThrow('Resource identifier must follow naming rules.');
    });
    it('update field type - change data type (number -> integer) does not cascade to cards via resource class', async () => {
      let card6 = findCard(checkout, 'decision_6');
      expect(card6.metadata!['decision/fieldTypes/numberOfCommits']).equals(
        1.5,
      );
      const name = 'decision/fieldTypes/numberOfCommits';
      const res = checkout.resources.byType(name, 'fieldTypes');
      await res.update(
        { key: 'dataType' },
        {
          name: 'change',
          target: '',
          to: 'integer',
        },
      );
      // The resource-level update persists the new dataType but no longer
      // converts card values; FieldTypeDataTypeHandler owns that cascade.
      expect(res.data?.dataType).toBe('integer');
      card6 = findCard(checkout, 'decision_6');
      expect(card6.metadata!['decision/fieldTypes/numberOfCommits']).equals(
        1.5,
      );
    });
    it('update field type - change displayName and description', async () => {
      const name = 'decision/fieldTypes/dateFieldType2';
      const res = checkout.resources.byType(name, 'fieldTypes');
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
      expect((res.data as FieldType).displayName).toBe('Field for dates');
      expect((res.data as FieldType).description).toBe('Field description');
    });
    it('update field type - change enumValues', async () => {
      const name = 'decision/fieldTypes/enumFieldType';
      const res = checkout.resources.byType(name, 'fieldTypes');
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
      expect(enums?.length).toBe(2);
      expect(enums?.at(0)?.enumValue).toBe('yes');
      expect(enums?.at(1)?.enumValue).toBe('no');
    });
    it('update calculation - valid logic program is written to disk', async () => {
      const name = 'decision/calculations/newCALCWithContent';
      const res = checkout.resources.byType(name, 'calculations');
      const validContent = 'validGateFact(42).';
      await res.update(
        { key: 'content', subKey: 'calculation' },
        {
          name: 'change',
          target: '',
          to: validContent,
        },
      );
      const calculationFile = join(
        decisionRecordsPath,
        '.cards/local/calculations/newCALCWithContent/calculation.lp',
      );
      expect(readFileSync(calculationFile, 'utf-8')).toBe(validContent);
    });
    it('update calculation - invalid logic program is rejected and file unchanged', async () => {
      const name = 'decision/calculations/newCALCWithContent';
      const res = checkout.resources.byType(name, 'calculations');
      const baselineContent = 'gateBaselineFact(1).';
      await res.update(
        { key: 'content', subKey: 'calculation' },
        {
          name: 'change',
          target: '',
          to: baselineContent,
        },
      );
      await expect(
        res.update(
          { key: 'content', subKey: 'calculation' },
          {
            name: 'change',
            target: '',
            to: 'broken((',
          },
        ),
      ).rejects.toThrow(
        /Invalid logic program for 'decision\/calculations\/newCALCWithContent' update:[\s\S]*syntax error/,
      );
      const calculationFile = join(
        decisionRecordsPath,
        '.cards/local/calculations/newCALCWithContent/calculation.lp',
      );
      expect(readFileSync(calculationFile, 'utf-8')).toBe(baselineContent);
    });
    it('update calculation - name', async () => {
      const name = 'decision/calculations/calcForRename';
      const res = checkout.resources.byType(name, 'calculations');
      await res.create();
      await res.update(
        { key: 'name' },
        {
          name: 'change',
          target: '',
          to: 'decision/calculations/afterCalcUpdate',
        },
      );
      expect(res.data?.name).toBe('decision/calculations/afterCalcUpdate');
    });
    it('update link type scalar values', async () => {
      const name = 'decision/linkTypes/newLinkType';
      const res = checkout.resources.byType(name, 'linkTypes');
      await res.create();
      await res.update(
        { key: 'displayName' },
        {
          name: 'change',
          target: '',
          to: 'Link type display name',
        },
      );
      await res.update(
        { key: 'description' },
        {
          name: 'change',
          target: '',
          to: 'Link type description',
        },
      );
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
      expect(data.displayName).toBe('Link type display name');
      expect(data.description).toBe('Link type description');
      expect(data.inboundDisplayName).toBe('inbound');
      expect(data.outboundDisplayName).toBe('outbound');
      expect(data.enableLinkDescription).toBe(true);
    });
    it('update graph model scalar values', async () => {
      const name = 'decision/graphModels/newGraphModel';
      const res = checkout.resources.byType(name, 'graphModels');
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
      expect(data.displayName).toBe('updated');
      expect(data.description).toBe('updated');
      expect(data.category).toBe('updated');
    });
    it('update graph view scalar values', async () => {
      const name = 'decision/graphViews/newGraphView';
      const res = checkout.resources.byType(name, 'graphViews');
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
      expect(data.displayName).toBe('updated');
      expect(data.description).toBe('updated');
      expect(data.category).toBe('updated');
    });
    it('update existing workflow - rename state (resource-level does NOT migrate cards)', async () => {
      const name = 'decision/workflows/decision';
      const res = checkout.resources.byType(name, 'workflows');
      const cards = checkout.cardTree.cards();
      const cardsWithThisWorkflow = cards.filter((card) => {
        const ct = checkout.resources.byType(
          card.metadata?.cardType as string,
          'cardTypes',
        );
        return ct.data?.workflow === 'decision/workflows/decision';
      });
      const expectedItem = { name: 'Approved', category: 'closed' };
      const updatedItem = { name: 'ReallyApproved', category: 'closed' };

      // Put a card into the 'Approved' state so we can observe (the lack of)
      // card migration.
      const target = cardsWithThisWorkflow.at(0)!;
      target.metadata!.workflowState = 'Approved';
      await updateCardMetadata(checkout, target, target.metadata!);

      const op = {
        name: 'change',
        target: expectedItem,
        to: updatedItem,
      } as ChangeOperation<WorkflowState>;
      await res.update({ key: 'states' }, op);

      // The state is renamed in the workflow definition and the workflow's own
      // transitions are rewritten, but the card-state migration cascade has
      // moved to WorkflowRenameStateHandler: a resource-level update no longer
      // touches card metadata.
      expect((res.data as Workflow).states.map((s) => s.name)).toContain(
        'ReallyApproved',
      );
      expect((res.data as Workflow).states.map((s) => s.name)).not.toContain(
        'Approved',
      );
      const updatedCard = findCard(checkout, target.key);
      expect(updatedCard.metadata!.workflowState).toBe('Approved');

      const opRevert = {
        name: 'change',
        target: updatedItem,
        to: expectedItem,
      } as ChangeOperation<WorkflowState>;
      await res.update({ key: 'states' }, opRevert);
    });
    it('try to update existing workflow - rename state with incomplete state', async () => {
      const name = 'decision/workflows/decision';
      const res = checkout.resources.byType(name, 'workflows');
      const expectedItem = { name: 'Approved', category: 'closed' };
      const updatedItem = { name: 'ReallyApproved' };
      const op = {
        name: 'change',
        target: expectedItem,
        to: updatedItem,
      } as ChangeOperation<WorkflowState>;
      await expect(res.update({ key: 'states' }, op)).rejects.toThrow(
        "Cannot change state 'Approved' for workflow 'decision/workflows/decision'.",
      );
    });
    it('try to create workflow without new card transition', async () => {
      const name = 'decision/workflows/noNewCardTransition';
      const workflowData = {
        name: name,
        displayName: name,
        states: [
          { name: 'Draft', category: 'initial' },
          { name: 'Done', category: 'closed' },
        ],
        transitions: [
          { name: 'Complete', fromState: ['Draft'], toState: 'Done' },
        ],
      } as Workflow;
      const res = checkout.resources.byType(name, 'workflows');
      await expect(res.create(workflowData)).rejects.toThrow(
        `Workflow '${name}' must have exactly one transition from "New Card" (empty fromState), found 0.`,
      );
    });
    it('try to create workflow with multiple new card transitions', async () => {
      const name = 'decision/workflows/multipleNewCardTransitions';
      const workflowData = {
        name: name,
        displayName: name,
        states: [
          { name: 'Draft', category: 'initial' },
          { name: 'Review', category: 'active' },
        ],
        transitions: [
          { name: 'Create', fromState: [''], toState: 'Draft' },
          { name: 'CreateForReview', fromState: [''], toState: 'Review' },
        ],
      } as Workflow;
      const res = checkout.resources.byType(name, 'workflows');
      await expect(res.create(workflowData)).rejects.toThrow(
        `Workflow '${name}' must have exactly one transition from "New Card" (empty fromState), found 2.`,
      );
    });
    it('try to create workflow with duplicate transition names', async () => {
      const name = 'decision/workflows/duplicateNames';
      const workflowData = {
        name: name,
        displayName: name,
        states: [
          { name: 'Draft', category: 'initial' },
          { name: 'Done', category: 'closed' },
          { name: 'Gone', category: 'closed' },
        ],
        transitions: [
          { name: 'Create', fromState: [''], toState: 'Draft' },
          { name: 'Finish', fromState: ['Draft'], toState: 'Done' },
          { name: 'Finish', fromState: ['Draft'], toState: 'Gone' },
        ],
      } as Workflow;
      const res = checkout.resources.byType(name, 'workflows');
      await expect(res.create(workflowData)).rejects.toThrow(
        `Workflow '${name}' has several transitions named 'Finish'; transition names must be unique`,
      );
    });
    it('try to create workflow with a duplicate name across different states', async () => {
      const name = 'decision/workflows/duplicateAcrossStates';
      const workflowData = {
        name: name,
        displayName: name,
        states: [
          { name: 'Draft', category: 'initial' },
          { name: 'Approved', category: 'closed' },
          { name: 'Rejected', category: 'closed' },
          { name: 'Deprecated', category: 'closed' },
        ],
        transitions: [
          { name: 'Create', fromState: [''], toState: 'Draft' },
          { name: 'Resolve', fromState: ['Draft'], toState: 'Rejected' },
          { name: 'Resolve', fromState: ['Approved'], toState: 'Deprecated' },
        ],
      } as Workflow;
      const res = checkout.resources.byType(name, 'workflows');
      await expect(res.create(workflowData)).rejects.toThrow(
        `Workflow '${name}' has several transitions named 'Resolve'; transition names must be unique`,
      );
    });
    it('create workflow with a transition available from several states', async () => {
      const name = 'decision/workflows/transitionFromManyStates';
      const workflowData = {
        name: name,
        displayName: name,
        states: [
          { name: 'Draft', category: 'initial' },
          { name: 'InReview', category: 'active' },
          { name: 'Done', category: 'closed' },
        ],
        transitions: [
          { name: 'Create', fromState: [''], toState: 'Draft' },
          { name: 'Finish', fromState: ['Draft', 'InReview'], toState: 'Done' },
        ],
      } as Workflow;
      const res = checkout.resources.byType(name, 'workflows');
      await expect(res.create(workflowData)).resolves.not.toThrow();
    });
    it('try to remove the only new card transition from workflow', async () => {
      const name = 'decision/workflows/removeNewCardTransition';
      const workflowData = {
        name: name,
        displayName: name,
        states: [
          { name: 'Draft', category: 'initial' },
          { name: 'Done', category: 'closed' },
        ],
        transitions: [
          { name: 'Create', fromState: [''], toState: 'Draft' },
          { name: 'Complete', fromState: ['Draft'], toState: 'Done' },
        ],
      } as Workflow;
      const res = checkout.resources.byType(name, 'workflows');
      await res.create(workflowData);

      const op = {
        name: 'remove',
        target: { name: 'Create', fromState: [''], toState: 'Draft' },
      } as RemoveOperation<WorkflowTransition>;
      await expect(res.update({ key: 'transitions' }, op)).rejects.toThrow(
        `Workflow '${name}' must have exactly one transition from "New Card" (empty fromState), found 0.`,
      );
    });
    it('try to check usage of nonExisting resource', async () => {
      const name = 'decision/workflows/nonExisting';
      const before = checkout.resources.workflows();
      const found = before.find((item) => item.data?.name === name);
      expect(found).toBeUndefined();

      const res = checkout.resources.byType(name, 'workflows');
      await expect(res.usage()).rejects.toThrow(
        `Resource 'nonExisting' does not exist in the project`,
      );
    });
  });

  describe('card content reference updates on resource rename', () => {
    async function cleanup(cardKey: string) {
      await Workspace.over(checkout, SYSTEM_ACTOR).cards.remove(cardKey);
    }

    it('should not update card contents when renaming template via resource class (cascade moved to handler)', async () => {
      const cardKey = 'decision_5';
      const card = findCard(checkout, cardKey);
      expect(card.content).toContain('decision/templates/simplepage');

      const templateName = 'decision/templates/simplepage';
      const template = checkout.resources.byType(templateName, 'templates');
      await template.rename('renamedpage');
      const updatedCard = findCard(checkout, cardKey);

      expect(template.data?.name).toBe('decision/templates/renamedpage');
      // The resource-level rename no longer cascades; LeafResourceRenameHandler does.
      expect(updatedCard.content).toContain('decision/templates/simplepage');
      expect(updatedCard.content).not.toContain(
        'decision/templates/renamedpage',
      );

      await template.rename('simplepage');
    });

    it('should not update card contents when renaming report via resource class (cascade moved to handler)', async () => {
      const cardKey = 'decision_5';
      const card = findCard(checkout, cardKey);
      expect(card.content).toContain('decision/reports/testReport');

      const reportName = 'decision/reports/testReport';
      const report = checkout.resources.byType(reportName, 'reports');
      await report.rename('renamedReport');
      const updatedCard = findCard(checkout, cardKey);

      expect(report.data?.name).toBe('decision/reports/renamedReport');
      // The resource-level rename no longer cascades; LeafResourceRenameHandler does.
      expect(updatedCard.content).toContain('decision/reports/testReport');
      expect(updatedCard.content).not.toContain(
        'decision/reports/renamedReport',
      );

      await report.rename('testReport');
    });

    it('should not update card contents when renaming workflow via resource class (cascade moved to handler)', async () => {
      const workflowName = 'decision/workflows/testWorkflowForContent';
      const workflow = checkout.resources.byType(workflowName, 'workflows');
      await workflow.create();
      const result = await Workspace.over(checkout, SYSTEM_ACTOR).cards.create(
        'decision/templates/simplepage',
      );
      const cardKey = result[0].key;
      await updateCardContent(
        checkout,
        cardKey,
        `This card references ${workflowName} in its content.`,
      );

      let card = findCard(checkout, cardKey);
      expect(card.content).toContain(workflowName);

      await workflow.rename('renamedWorkflow');

      expect(workflow.data?.name).toBe('decision/workflows/renamedWorkflow');

      // The resource-level rename no longer cascades; WorkflowRenameHandler does.
      card = findCard(checkout, cardKey);
      expect(card.content).toContain(workflowName);
      expect(card.content).not.toContain('decision/workflows/renamedWorkflow');

      await cleanup(cardKey);
      await workflow.delete();
    });

    it('should not update card contents when renaming field type via resource class (cascade moved to handler)', async () => {
      const fieldTypeName = 'decision/fieldTypes/testFieldForContent';
      const fieldType = checkout.resources.byType(fieldTypeName, 'fieldTypes');
      await fieldType.createFieldType('shortText');
      const result = await Workspace.over(checkout, SYSTEM_ACTOR).cards.create(
        'decision/templates/simplepage',
      );
      const cardKey = result[0].key;

      await updateCardContent(
        checkout,
        cardKey,
        `This card references ${fieldTypeName} in its content.`,
      );

      let card = findCard(checkout, cardKey);
      expect(card.content).toContain(fieldTypeName);

      await fieldType.rename('renamedField');
      expect(fieldType.data?.name).toBe('decision/fieldTypes/renamedField');

      // The resource-level rename no longer cascades; FieldTypeRenameHandler does.
      card = findCard(checkout, cardKey);
      expect(card.content).toContain(fieldTypeName);
      expect(card.content).not.toContain('decision/fieldTypes/renamedField');

      await cleanup(cardKey);
      await fieldType.delete();
    });

    it('should not update card contents when renaming card type via resource class (cascade moved to handler)', async () => {
      const cardTypeName = 'decision/cardTypes/testTypeForContent';
      const cardType = checkout.resources.byType(cardTypeName, 'cardTypes');
      await cardType.createCardType('decision/workflows/decision');
      const result = await Workspace.over(checkout, SYSTEM_ACTOR).cards.create(
        'decision/templates/simplepage',
      );
      const cardKey = result[0].key;

      await updateCardContent(
        checkout,
        cardKey,
        `This card references ${cardTypeName} in its content.`,
      );

      let card = findCard(checkout, cardKey);
      expect(card.content).toContain(cardTypeName);

      await cardType.rename('renamedType');
      expect(cardType.data?.name).toBe('decision/cardTypes/renamedType');

      // The resource-level rename no longer cascades; CardTypeRenameHandler does.
      card = findCard(checkout, cardKey);
      expect(card.content).toContain(cardTypeName);
      expect(card.content).not.toContain('decision/cardTypes/renamedType');

      await cleanup(cardKey);
      await cardType.delete();
    });

    it('should update card contents when renaming link type', async () => {
      // linkType renames route through the mutation engine; the cascade
      // (card content rewrite) lives in LinkTypeRenameHandler, not
      // LinkTypeResource.rename(). A 'change' on 'name' is normalized to a
      // rename input by the engine.
      const linkTypeName = 'decision/linkTypes/testLinkForContent';
      const linkType = checkout.resources.byType(linkTypeName, 'linkTypes');
      await linkType.create();
      const result = await Workspace.over(checkout, SYSTEM_ACTOR).cards.create(
        'decision/templates/simplepage',
      );
      const cardKey = result[0].key;

      await updateCardContent(
        checkout,
        cardKey,
        `This card references ${linkTypeName} in its content.`,
      );

      let card = findCard(checkout, cardKey);
      expect(card.content).toContain(linkTypeName);

      const update = Workspace.over(checkout, SYSTEM_ACTOR).changes;
      await update.apply({
        kind: 'edit',
        target: resourceName(linkTypeName),
        updateKey: { key: 'name' },
        operation: {
          name: 'change',
          target: linkTypeName,
          to: 'decision/linkTypes/renamedLink',
        } as ChangeOperation<string>,
      });
      const renamed = checkout.resources.byType(
        'decision/linkTypes/renamedLink',
        'linkTypes',
      );
      expect(renamed.data?.name).toBe('decision/linkTypes/renamedLink');

      card = findCard(checkout, cardKey);
      expect(card.content).toContain('decision/linkTypes/renamedLink');
      expect(card.content).not.toContain(linkTypeName);

      await cleanup(cardKey);
      await renamed.delete();
    });

    it('should not update card contents when renaming calculations via resource class (cascade moved to handler)', async () => {
      const calculationName = 'decision/calculations/testCalcForContent';
      const calculation = checkout.resources.byType(
        calculationName,
        'calculations',
      );
      await calculation.create();
      const result = await Workspace.over(checkout, SYSTEM_ACTOR).cards.create(
        'decision/templates/simplepage',
      );
      const cardKey = result[0].key;
      await updateCardContent(
        checkout,
        cardKey,
        `This card references ${calculationName} in its content.`,
      );

      let card = findCard(checkout, cardKey);
      expect(card.content).toContain(calculationName);
      await calculation.rename('renamedCalc');

      expect(calculation.data?.name).toBe('decision/calculations/renamedCalc');

      // The resource-level rename no longer cascades; LeafResourceRenameHandler does.
      card = findCard(checkout, cardKey);
      expect(card.content).toContain(calculationName);
      expect(card.content).not.toContain('decision/calculations/renamedCalc');

      await cleanup(cardKey);
      await calculation.delete();
    });

    it('should not update card contents when renaming graph models via resource class (cascade moved to handler)', async () => {
      const graphModelName = 'decision/graphModels/testGraphForContent';
      const graphModel = checkout.resources.byType(
        graphModelName,
        'graphModels',
      );
      await graphModel.create();
      const result = await Workspace.over(checkout, SYSTEM_ACTOR).cards.create(
        'decision/templates/simplepage',
      );
      const cardKey = result[0].key;
      await updateCardContent(
        checkout,
        cardKey,
        `This card references ${graphModelName} in its content.`,
      );

      let card = findCard(checkout, cardKey);
      expect(card.content).toContain(graphModelName);

      await graphModel.rename('renamedGraph');
      expect(graphModel.data?.name).toBe('decision/graphModels/renamedGraph');

      // The resource-level rename no longer cascades; LeafResourceRenameHandler does.
      card = findCard(checkout, cardKey);
      expect(card.content).toContain(graphModelName);
      expect(card.content).not.toContain('decision/graphModels/renamedGraph');

      await cleanup(cardKey);
      await graphModel.delete();
    });

    it('should not update card contents when renaming graph views via resource class (cascade moved to handler)', async () => {
      const graphViewName = 'decision/graphViews/testViewForContent';
      const graphView = checkout.resources.byType(graphViewName, 'graphViews');
      await graphView.create();
      const result = await Workspace.over(checkout, SYSTEM_ACTOR).cards.create(
        'decision/templates/simplepage',
      );
      const cardKey = result[0].key;
      await updateCardContent(
        checkout,
        cardKey,
        `This card references ${graphViewName} in its content.`,
      );

      let card = findCard(checkout, cardKey);
      expect(card.content).toContain(graphViewName);

      await graphView.rename('renamedView');
      expect(graphView.data?.name).toBe('decision/graphViews/renamedView');

      // The resource-level rename no longer cascades; LeafResourceRenameHandler does.
      card = findCard(checkout, cardKey);
      expect(card.content).toContain(graphViewName);
      expect(card.content).not.toContain('decision/graphViews/renamedView');

      await cleanup(cardKey);
      await graphView.delete();
    });

    it('should not rename card content references via resource class (cascade moved to handler)', async () => {
      const templateName = 'decision/templates/multiRefTemplate';
      const template = checkout.resources.byType(templateName, 'templates');
      await template.create();

      const cardKeys: string[] = [];
      for (let i = 0; i < 3; i++) {
        const result = await Workspace.over(
          checkout,
          SYSTEM_ACTOR,
        ).cards.create('decision/templates/simplepage');
        const cardKey = result[0].key;
        cardKeys.push(cardKey);

        await updateCardContent(
          checkout,
          cardKey,
          `Card references ${templateName}.`,
        );
      }

      await template.rename('renamedMultiRef');

      // The resource-level rename no longer cascades; LeafResourceRenameHandler does.
      for (const cardKey of cardKeys) {
        const card = findCard(checkout, cardKey);
        expect(card.content).toContain(templateName);
        expect(card.content).not.toContain(
          'decision/templates/renamedMultiRef',
        );
      }

      // Cleanup
      for (const cardKey of cardKeys) {
        await Workspace.over(checkout, SYSTEM_ACTOR).cards.remove(cardKey);
      }
      await template.delete();
    });

    it('should not make changes to card content if no references', async () => {
      const workflowName = 'decision/workflows/noReferencesWorkflow';
      const workflow = checkout.resources.byType(workflowName, 'workflows');
      await workflow.create();

      await workflow.rename('renamedNoRef');
      expect(workflow.data?.name).toBe('decision/workflows/renamedNoRef');

      await workflow.delete();
    });

    it('should update card metadata links when renaming link types', async () => {
      // linkType renames route through the mutation engine; the cascade
      // (card metadata link rewrite) lives in LinkTypeRenameHandler, not
      // LinkTypeResource.rename().
      const linkTypeName = 'decision/linkTypes/testLinkForMetadata';
      const linkTypeRenamed = 'decision/linkTypes/renamedLink';
      const linkType = checkout.resources.byType(linkTypeName, 'linkTypes');
      await linkType.create();

      // Create two cards
      const result1 = await Workspace.over(checkout, SYSTEM_ACTOR).cards.create(
        'decision/templates/simplepage',
      );
      const cardKey1 = result1[0].key;
      const result2 = await Workspace.over(checkout, SYSTEM_ACTOR).cards.create(
        'decision/templates/simplepage',
      );
      const cardKey2 = result2[0].key;

      // Link card1 -> card2
      let card1 = findCard(checkout, cardKey1);

      card1.metadata!.links.push({
        linkType: linkTypeName,
        cardKey: cardKey2,
        linkDescription: 'test link',
      });

      await updateCardMetadata(checkout, card1, card1.metadata!);
      card1 = findCard(checkout, cardKey1);
      expect(card1.metadata?.links).to.have.lengthOf(1);
      expect(card1.metadata?.links[0].linkType).toBe(linkTypeName);

      const update = Workspace.over(checkout, SYSTEM_ACTOR).changes;
      await update.apply({
        kind: 'rename',
        target: resourceName(linkTypeName),
        newIdentifier: 'renamedLink',
      });
      const renamed = checkout.resources.byType(linkTypeRenamed, 'linkTypes');
      expect(renamed.data?.name).toBe(linkTypeRenamed);
      card1 = findCard(checkout, cardKey1);
      expect(card1.metadata?.links).to.have.lengthOf(1);
      expect(card1.metadata?.links[0].linkType).toBe(linkTypeRenamed);
      expect(card1.metadata?.links[0].cardKey).toBe(cardKey2);

      await cleanup(cardKey1);
      await cleanup(cardKey2);
      await renamed.delete();
    });
  });
});
