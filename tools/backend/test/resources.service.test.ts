import { expect, test, describe, vi, beforeEach } from 'vitest';
import { buildResourceTree } from '../src/domain/resources/service.js';
import type { CommandManager } from '@cyberismo/data-handler';
import type { Card } from '@cyberismo/data-handler/interfaces/project-interfaces';

// Create mock CommandManager
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const createMockCommandManager = (overrides: any = {}) => {
  return {
    showCmd: {
      showProject: vi.fn().mockResolvedValue({ prefix: 'test' }),
      showResources: vi.fn(),
      showResource: vi.fn(),
      showAllTemplateCards: vi.fn(),
      ...overrides.showCmd,
    },
    ...overrides,
  } as unknown as CommandManager;
};

// Mock resource data
const mockResourceData = {
  name: 'test/fieldTypes/status',
  displayName: 'Status',
  description: 'Status field',
  dataType: 'enum',
};

const mockTemplateCard: Card = {
  key: 'test_card1',
  path: '',
  content: 'Content',
  attachments: [],
  metadata: {
    links: [],
    title: 'Template Card',
    cardType: 'test/cardTypes/template',
    workflowState: 'initial',
    rank: '0|a',
  },
  children: [],
};

const mockTemplateCardWithChildren: Card = {
  key: 'test_parent1',
  path: '',
  content: 'Parent content',
  attachments: [],
  metadata: {
    links: [],
    title: 'Parent Template',
    cardType: 'test/cardTypes/template',
    workflowState: 'initial',
    rank: '0|a',
  },
  children: [
    {
      key: 'test_child1',
      path: '',
      content: 'Child content',
      attachments: [],
      metadata: {
        links: [],
        title: 'Child Template',
        cardType: 'test/cardTypes/template',
        workflowState: 'initial',
        rank: '0|b',
      },
      children: [],
    },
  ],
};

describe('Resources Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('buildResourceTree', () => {
    test('should build resource tree with root resources only', async () => {
      const mockCommands = createMockCommandManager({
        showCmd: {
          showProject: vi.fn().mockResolvedValue({ prefix: 'test' }),
          showResources: vi.fn().mockImplementation((type) => {
            if (type === 'fieldTypes')
              return Promise.resolve(['test/fieldTypes/status']);
            if (type === 'templates')
              return Promise.resolve(['test/templates/basic']);
            return Promise.resolve([]);
          }),
          showResource: vi.fn().mockResolvedValue(mockResourceData),
          showAllTemplateCards: vi
            .fn()
            .mockResolvedValue([
              { name: 'test/templates/basic', cards: [mockTemplateCard] },
            ]),
        },
      });

      const result = await buildResourceTree(mockCommands);

      expect(result).toHaveLength(2); // fieldTypes and templates groups
      expect(result[0].name).toBe('fieldTypes');
      expect(result[0].children).toHaveLength(1);
      expect(result[0].children[0].name).toBe('test/fieldTypes/status');
      expect(result[0].children[0].data).toEqual(mockResourceData);

      expect(result[1].name).toBe('templates');
      expect(result[1].children).toHaveLength(1);
      expect(result[1].children[0].name).toBe('test/templates/basic');
      expect(result[1].children[0].children).toHaveLength(1);
      expect(result[1].children[0].children[0].type).toBe('card');
    });

    test('should build resource tree with modules section', async () => {
      const mockCommands = createMockCommandManager({
        showCmd: {
          showProject: vi.fn().mockResolvedValue({ prefix: 'test' }),
          showResources: vi.fn().mockImplementation((type) => {
            if (type === 'fieldTypes') {
              return Promise.resolve([
                'test/fieldTypes/status',
                'module1/fieldTypes/priority',
              ]);
            }
            if (type === 'templates') return Promise.resolve([]);
            return Promise.resolve([]);
          }),
          showResource: vi.fn().mockImplementation((name) => {
            return Promise.resolve({
              ...mockResourceData,
              name,
            });
          }),
          showAllTemplateCards: vi.fn().mockResolvedValue([]),
        },
      });

      const result = await buildResourceTree(mockCommands);

      expect(result).toHaveLength(2); // fieldTypes group and modules group

      // Check root fieldTypes
      expect(result[0].name).toBe('fieldTypes');
      expect(result[0].children).toHaveLength(1);
      expect(result[0].children[0].name).toBe('test/fieldTypes/status');

      // Check modules section
      expect(result[1].name).toBe('modules');
      expect(result[1].type).toBe('modulesGroup');
      expect(result[1].children).toHaveLength(1);
      expect(result[1].children[0].name).toBe('module1');
      expect(result[1].children[0].type).toBe('module');
      expect(result[1].children[0].children).toHaveLength(1);
      expect(result[1].children[0].children[0].name).toBe('fieldTypes');
      expect(result[1].children[0].children[0].children[0].name).toBe(
        'module1/fieldTypes/priority',
      );
    });

    test('should handle template processing with hierarchical cards', async () => {
      const mockCommands = createMockCommandManager({
        showCmd: {
          showProject: vi.fn().mockResolvedValue({ prefix: 'test' }),
          showResources: vi.fn().mockImplementation((type) => {
            if (type === 'templates') return Promise.resolve([]);
            return Promise.resolve([]);
          }),
          showResource: vi.fn().mockResolvedValue(mockResourceData),
          showAllTemplateCards: vi.fn().mockResolvedValue([
            {
              name: 'test/templates/hierarchy',
              cards: [mockTemplateCardWithChildren],
            },
          ]),
        },
      });

      const result = await buildResourceTree(mockCommands);

      expect(result).toHaveLength(1); // templates group only
      expect(result[0].name).toBe('templates');
      expect(result[0].children).toHaveLength(1);

      const templateNode = result[0].children[0];
      expect(templateNode.name).toBe('test/templates/hierarchy');
      expect(templateNode.children).toHaveLength(1);

      const parentCard = templateNode.children[0];
      expect(parentCard.name).toBe('test/cards/test_parent1');
      expect(parentCard.type).toBe('card');
      expect(parentCard.children).toHaveLength(1);

      const childCard = parentCard.children[0];
      expect(childCard.name).toBe('test/cards/test_child1');
      expect(childCard.type).toBe('card');
    });

    test('should handle mixed root and module templates', async () => {
      const mockCommands = createMockCommandManager({
        showCmd: {
          showProject: vi.fn().mockResolvedValue({ prefix: 'test' }),
          showResources: vi.fn().mockImplementation((type) => {
            if (type === 'templates') return Promise.resolve([]);
            return Promise.resolve([]);
          }),
          showResource: vi.fn().mockResolvedValue(mockResourceData),
          showAllTemplateCards: vi.fn().mockResolvedValue([
            { name: 'test/templates/root-template', cards: [mockTemplateCard] },
            {
              name: 'module1/templates/module-template',
              cards: [mockTemplateCard],
            },
          ]),
        },
      });

      const result = await buildResourceTree(mockCommands);

      expect(result).toHaveLength(2); // templates group and modules group

      // Check root templates
      expect(result[0].name).toBe('templates');
      expect(result[0].children).toHaveLength(1);
      expect(result[0].children[0].name).toBe('test/templates/root-template');

      // Check module templates
      expect(result[1].name).toBe('modules');
      expect(result[1].children).toHaveLength(1);
      expect(result[1].children[0].name).toBe('module1');
      expect(result[1].children[0].children[0].name).toBe('templates');
      expect(result[1].children[0].children[0].children[0].name).toBe(
        'module1/templates/module-template',
      );
    });

    test('should handle empty resource types gracefully', async () => {
      const mockCommands = createMockCommandManager({
        showCmd: {
          showProject: vi.fn().mockResolvedValue({ prefix: 'test' }),
          showResources: vi.fn().mockResolvedValue([]), // All empty
          showResource: vi.fn().mockResolvedValue(mockResourceData),
          showAllTemplateCards: vi.fn().mockResolvedValue([]), // Empty templates
        },
      });

      const result = await buildResourceTree(mockCommands);

      expect(result).toHaveLength(0); // No resource groups
    });

    test('should handle all resource types', async () => {
      const resourceTypes = [
        'calculations',
        'cardTypes',
        'fieldTypes',
        'graphModels',
        'graphViews',
        'linkTypes',
        'reports',
        'workflows',
      ];

      const mockCommands = createMockCommandManager({
        showCmd: {
          showProject: vi.fn().mockResolvedValue({ prefix: 'test' }),
          showResources: vi.fn().mockImplementation((type) => {
            if (resourceTypes.includes(type)) {
              return Promise.resolve([`test/${type}/example`]);
            }
            return Promise.resolve([]);
          }),
          showResource: vi.fn().mockImplementation((name) => ({
            ...mockResourceData,
            name,
          })),
          showAllTemplateCards: vi.fn().mockResolvedValue([]),
        },
      });

      const result = await buildResourceTree(mockCommands);

      expect(result).toHaveLength(resourceTypes.length); // One group per resource type

      resourceTypes.forEach((resourceType, index) => {
        expect(result[index].name).toBe(resourceType);
        expect(result[index].type).toBe('resourceGroup');
        expect(result[index].children).toHaveLength(1);
        expect(result[index].children[0].name).toBe(
          `test/${resourceType}/example`,
        );
      });
    });

    test('should generate correct node IDs and types', async () => {
      const mockCommands = createMockCommandManager({
        showCmd: {
          showProject: vi.fn().mockResolvedValue({ prefix: 'test' }),
          showResources: vi.fn().mockImplementation((type) => {
            if (type === 'fieldTypes')
              return Promise.resolve(['test/fieldTypes/status']);
            return Promise.resolve([]);
          }),
          showResource: vi.fn().mockResolvedValue(mockResourceData),
          showAllTemplateCards: vi
            .fn()
            .mockResolvedValue([
              { name: 'test/templates/basic', cards: [mockTemplateCard] },
            ]),
        },
      });

      const result = await buildResourceTree(mockCommands);

      // Check resource group IDs and types
      expect(result[0].id).toBe('fieldTypes');
      expect(result[0].type).toBe('resourceGroup');

      // Check resource node IDs and types
      expect(result[0].children[0].id).toBe(
        'fieldTypes-test/fieldTypes/status',
      );
      expect(result[0].children[0].type).toBe('fieldTypes');

      // Check template processing
      expect(result[1].id).toBe('templates');
      expect(result[1].type).toBe('resourceGroup');
      expect(result[1].children[0].id).toBe('templates-test/templates/basic');
      expect(result[1].children[0].type).toBe('templates');

      // Check card node IDs and types
      expect(result[1].children[0].children[0].id).toBe('test_card1');
      expect(result[1].children[0].children[0].type).toBe('card');
    });

    test('should handle error when showProject fails', async () => {
      const mockCommands = createMockCommandManager({
        showCmd: {
          showProject: vi
            .fn()
            .mockRejectedValue(new Error('Project not found')),
        },
      });

      await expect(buildResourceTree(mockCommands)).rejects.toThrow(
        'Project not found',
      );
    });

    test('should handle error when showResources fails', async () => {
      const mockCommands = createMockCommandManager({
        showCmd: {
          showProject: vi.fn().mockResolvedValue({ prefix: 'test' }),
          showResources: vi
            .fn()
            .mockRejectedValue(new Error('Resources not found')),
          showAllTemplateCards: vi.fn().mockResolvedValue([]),
        },
      });

      await expect(buildResourceTree(mockCommands)).rejects.toThrow(
        'Resources not found',
      );
    });

    test('should handle error when showResource fails', async () => {
      const mockCommands = createMockCommandManager({
        showCmd: {
          showProject: vi.fn().mockResolvedValue({ prefix: 'test' }),
          showResources: vi.fn().mockImplementation((type) => {
            if (type === 'fieldTypes')
              return Promise.resolve(['test/fieldTypes/status']);
            return Promise.resolve([]);
          }),
          showResource: vi
            .fn()
            .mockRejectedValue(new Error('Resource details not found')),
          showAllTemplateCards: vi.fn().mockResolvedValue([]),
        },
      });

      await expect(buildResourceTree(mockCommands)).rejects.toThrow(
        'Resource details not found',
      );
    });
  });
});
