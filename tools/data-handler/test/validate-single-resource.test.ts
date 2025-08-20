// testing
import { expect } from 'chai';
import { describe, it } from 'mocha';

// data-handler
import { Validate } from '../src/commands/validate.js';
import type { ResourceContent } from '../src/interfaces/resource-interfaces.js';
import { WorkflowCategory } from '../src/interfaces/resource-interfaces.js';

describe('validateSingleResource tests', () => {
  const validateCmd = Validate.getInstance();

  describe('Valid resources', () => {
    it('should validate a valid cardType resource', async () => {
      const validCardType: ResourceContent = {
        name: 'decision/cardTypes/decision',
        displayName: 'Decision card type',
        workflow: 'decision/workflows/decision',
        customFields: [
          {
            name: 'decision/fieldTypes/obsoletedBy',
            isCalculated: true,
          },
          {
            name: 'decision/fieldTypes/admins',
            isCalculated: false,
          },
        ],
        alwaysVisibleFields: ['decision/fieldTypes/obsoletedBy'],
        optionallyVisibleFields: [],
      };

      const result = await validateCmd.validateSingleResource(
        validCardType,
        'cardTypes',
      );
      expect(result).to.equal('');
    });

    it('should validate a valid fieldType resource', async () => {
      const validFieldType: ResourceContent = {
        name: 'decision/fieldTypes/admins',
        displayName: 'Administrators',
        description: 'List of admin persons',
        dataType: 'list',
      };

      const result = await validateCmd.validateSingleResource(
        validFieldType,
        'fieldTypes',
      );
      expect(result).to.equal('');
    });

    it('should validate a valid workflow resource', async () => {
      const validWorkflow: ResourceContent = {
        name: 'decision/workflows/decision',
        displayName: 'Decision based workflow',
        states: [
          { name: 'Draft', category: WorkflowCategory.initial },
          { name: 'Approved', category: WorkflowCategory.closed },
          { name: 'Rejected', category: WorkflowCategory.closed },
        ],
        transitions: [
          {
            name: 'Create',
            fromState: [''],
            toState: 'Draft',
          },
          {
            name: 'Approve',
            fromState: ['Draft'],
            toState: 'Approved',
          },
        ],
      };

      const result = await validateCmd.validateSingleResource(
        validWorkflow,
        'workflows',
      );
      expect(result).to.equal('');
    });

    it('should validate a valid template resource', async () => {
      const validTemplate: ResourceContent = {
        name: 'decision/templates/decision',
        description: 'A decision template',
        displayName: 'Decision',
        category: 'category',
      };

      const result = await validateCmd.validateSingleResource(
        validTemplate,
        'templates',
      );
      expect(result).to.equal('');
    });

    it('should validate a valid linkType resource', async () => {
      const validLinkType: ResourceContent = {
        name: 'decision/linkTypes/test',
        displayName: 'Test link type',
        outboundDisplayName: 'test',
        inboundDisplayName: 'test',
        sourceCardTypes: [],
        destinationCardTypes: [],
        enableLinkDescription: true,
      };

      const result = await validateCmd.validateSingleResource(
        validLinkType,
        'linkTypes',
      );
      expect(result).to.equal('');
    });

    it('should validate a fieldType with enum dataType', async () => {
      const validEnumFieldType: ResourceContent = {
        name: 'test/fieldTypes/status',
        displayName: 'Status',
        description: 'Status field with enum values',
        dataType: 'enum',
        enumValues: [
          {
            enumValue: 'active',
            enumDisplayValue: 'Active',
            enumDescription: 'Currently active',
          },
          {
            enumValue: 'inactive',
            enumDisplayValue: 'Inactive',
            enumDescription: 'Currently inactive',
          },
        ],
      };

      const result = await validateCmd.validateSingleResource(
        validEnumFieldType,
        'fieldTypes',
      );
      expect(result).to.equal('');
    });
  });

  describe('Invalid resources', () => {
    it('should reject cardType missing required fields', async () => {
      const invalidCardType = {
        name: 'decision/cardTypes/invalid',
        // missing displayName and workflow
        customFields: [],
        alwaysVisibleFields: [],
        optionallyVisibleFields: [],
      };

      const result = await validateCmd.validateSingleResource(
        invalidCardType,
        'cardTypes',
      );
      expect(result).to.contain('displayName');
    });

    it('should reject fieldType with invalid dataType', async () => {
      const invalidFieldType = {
        name: 'decision/fieldTypes/invalid',
        displayName: 'Invalid Field',
        dataType: 'invalidType', // invalid dataType
      };

      const result = await validateCmd.validateSingleResource(
        invalidFieldType,
        'fieldTypes',
      );
      expect(result).to.contain('does not match pattern');
    });

    it('should reject workflow missing required fields', async () => {
      const invalidWorkflow = {
        name: 'decision/workflows/invalid',
        // missing displayName, states, and transitions
      };

      const result = await validateCmd.validateSingleResource(
        invalidWorkflow,
        'workflows',
      );
      expect(result).to.contain('displayName');
    });

    it('should reject template missing required fields', async () => {
      const invalidTemplate = {
        name: 'decision/templates/invalid',
        // missing displayName
        description: 'A template',
        category: 'category',
      };

      const result = await validateCmd.validateSingleResource(
        invalidTemplate,
        'templates',
      );
      expect(result).to.contain('displayName');
    });

    it('should reject linkType missing required fields', async () => {
      const invalidLinkType = {
        name: 'decision/linkTypes/invalid',
        displayName: 'Invalid Link Type',
        // missing outboundDisplayName and inboundDisplayName
        sourceCardTypes: [],
        destinationCardTypes: [],
      };

      const result = await validateCmd.validateSingleResource(
        invalidLinkType,
        'linkTypes',
      );
      expect(result).to.contain('outboundDisplayName');
    });
  });

  describe('Schema validation', () => {
    it('should validate fieldType using resource type', async () => {
      const validFieldType: ResourceContent = {
        name: 'decision/fieldTypes/test',
        displayName: 'Test Field',
        dataType: 'shortText',
      };

      const result = await validateCmd.validateSingleResource(
        validFieldType,
        'fieldTypes',
      );
      expect(result).to.equal('');
    });

    it('should validate graphModel resource', async () => {
      const validGraphModel: ResourceContent = {
        name: 'test/graphModels/testModel',
        displayName: 'Test Graph Model',
        description: 'A test graph model',
      };

      const result = await validateCmd.validateSingleResource(
        validGraphModel,
        'graphModels',
      );
      expect(result).to.equal('');
    });

    it('should validate report resource', async () => {
      const validReport: ResourceContent = {
        name: 'test/reports/testReport',
        displayName: 'Test Report',
        description: 'A test report',
        category: 'category',
      };

      const result = await validateCmd.validateSingleResource(
        validReport,
        'reports',
      );
      expect(result).to.equal('');
    });
  });
});
