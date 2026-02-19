import { expect, test, describe, vi, beforeEach } from 'vitest';
import { buildResourceTree } from '../src/domain/resources/service.js';
import type { CommandManager } from '@cyberismo/data-handler';
import type {
  Card,
  CardWithChildrenCards,
} from '@cyberismo/data-handler/interfaces/project-interfaces';

// Helper interface for tests.
interface testDataNode {
  name: string;
  displayName: string;
  description: string;
  dataType: string;
}

// Helper interface for tests.
interface testObjectNode {
  name: string;
  id: string;
  type: string;
  data: testDataNode;
  children: testObjectNode[];
}

// Create mock CommandManager
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const createMockCommandManager = (overrides: any = {}) => {
  return {
    consistent: vi.fn().mockImplementation((fn: () => unknown) => fn()),
    showCmd: {
      showProject: vi.fn().mockResolvedValue({ prefix: 'test' }),
      showModules: vi.fn().mockResolvedValue([]),
      showModule: vi.fn(),
      showResources: vi.fn(),
      showResource: vi.fn(),
      showAllTemplateCards: vi.fn(),
      showFileNames: vi.fn().mockResolvedValue([]),
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

const mockTemplateCardWithChildren: CardWithChildrenCards = {
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
  children: ['test_child1'],
  childrenCards: [
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
      childrenCards: [],
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

      const result = (await buildResourceTree(
        mockCommands,
      )) as testObjectNode[];

      expect(result).toHaveLength(3); // general + fieldTypes and templates groups

      expect(result[0].name).toBe('project');

      expect(result[1].name).toBe('fieldTypes');
      expect(result[1].children).toHaveLength(1);
      const fieldProjectNode = result[1].children[0];
      expect(fieldProjectNode.name).toBe('project');
      expect(fieldProjectNode.children[0].name).toBe('test/fieldTypes/status');
      expect(fieldProjectNode.children[0].data).toEqual(mockResourceData);

      expect(result[2].name).toBe('templates');
      expect(result[2].children).toHaveLength(1);
      const templateProjectNode = result[2].children[0];
      expect(templateProjectNode.name).toBe('project');
      expect(templateProjectNode.children[0].name).toBe('test/templates/basic');
      expect(templateProjectNode.children[0].children).toHaveLength(1);
      expect(templateProjectNode.children[0].children[0].type).toBe('card');
    });

    test('should build resource tree with modules section', async () => {
      const mockCommands = createMockCommandManager({
        showCmd: {
          showProject: vi.fn().mockResolvedValue({ prefix: 'test' }),
          showModules: vi.fn().mockResolvedValue(['module1']),
          showModule: vi.fn().mockResolvedValue({
            name: 'Module One',
            cardKeyPrefix: 'module1',
            modules: [],
            hubs: [],
            path: '/tmp/module1',
            calculations: [],
            cardTypes: [],
            fieldTypes: [],
            graphModels: [],
            graphViews: [],
            linkTypes: [],
            reports: [],
            templates: [],
            workflows: [],
          }),
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

      const result = (await buildResourceTree(
        mockCommands,
      )) as testObjectNode[];

      expect(result).toHaveLength(2); // general + fieldTypes group

      expect(result[0].name).toBe('project');

      expect(result[1].name).toBe('fieldTypes');
      expect(result[1].children).toHaveLength(2);

      const projectNode = result[1].children.find(
        (child) => child.name === 'project',
      )!;
      expect(projectNode.children[0].name).toBe('test/fieldTypes/status');

      const moduleNode = result[1].children.find(
        (child) => child.name === 'Module One',
      )!;
      expect(moduleNode.type).toBe('module');
      expect(moduleNode.children).toHaveLength(1);
      expect(moduleNode.children[0].name).toBe('module1/fieldTypes/priority');
    });

    test('should handle template processing with hierarchical cards', async () => {
      const mockCommands = createMockCommandManager({
        showCmd: {
          showProject: vi.fn().mockResolvedValue({ prefix: 'test' }),
          showModules: vi.fn().mockResolvedValue(['module1']),
          showModule: vi.fn().mockResolvedValue({
            name: 'Module One',
            cardKeyPrefix: 'module1',
            modules: [],
            hubs: [],
            path: '/tmp/module1',
            calculations: [],
            cardTypes: [],
            fieldTypes: [],
            graphModels: [],
            graphViews: [],
            linkTypes: [],
            reports: [],
            templates: [],
            workflows: [],
          }),
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

      const result = (await buildResourceTree(
        mockCommands,
      )) as testObjectNode[];

      expect(result).toHaveLength(2); // general + templates group
      expect(result[0].name).toBe('project');
      expect(result[1].name).toBe('templates');
      expect(result[1].children).toHaveLength(1);

      const projectNode = result[1].children[0];
      expect(projectNode.name).toBe('project');
      const templateNode = projectNode.children[0];
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

    test('orders template cards by rank', async () => {
      const rootLaterByRank: CardWithChildrenCards = {
        key: 'aa_card',
        path: '',
        content: 'AA content',
        attachments: [],
        metadata: {
          links: [],
          title: 'AA Template',
          cardType: 'test/cardTypes/template',
          workflowState: 'initial',
          rank: '0|b',
        },
        children: ['child_b', 'child_a'],
        childrenCards: [
          {
            key: 'child_b',
            path: '',
            content: 'Child B',
            attachments: [],
            metadata: {
              links: [],
              title: 'Child B Template',
              cardType: 'test/cardTypes/template',
              workflowState: 'initial',
              rank: '0|a',
            },
            children: [],
            childrenCards: [],
          },
          {
            key: 'child_a',
            path: '',
            content: 'Child A',
            attachments: [],
            metadata: {
              links: [],
              title: 'Child A Template',
              cardType: 'test/cardTypes/template',
              workflowState: 'initial',
              rank: '0|b',
            },
            children: [],
            childrenCards: [],
          },
        ],
      };
      const rootSoonerByRank: CardWithChildrenCards = {
        key: 'zz_card',
        path: '',
        content: 'ZZ content',
        attachments: [],
        metadata: {
          links: [],
          title: 'ZZ Template',
          cardType: 'test/cardTypes/template',
          workflowState: 'initial',
          rank: '0|a',
        },
        children: [],
        childrenCards: [],
      };

      const mockCommands = createMockCommandManager({
        showCmd: {
          showProject: vi.fn().mockResolvedValue({ prefix: 'test' }),
          showResources: vi.fn().mockImplementation((type) => {
            if (type === 'templates')
              return Promise.resolve(['test/templates/sorted']);
            return Promise.resolve([]);
          }),
          showResource: vi.fn().mockImplementation((name) => ({
            ...mockResourceData,
            name,
          })),
          showAllTemplateCards: vi.fn().mockResolvedValue([
            {
              name: 'test/templates/sorted',
              cards: [rootLaterByRank, rootSoonerByRank],
            },
          ]),
        },
      });

      const result = (await buildResourceTree(
        mockCommands,
      )) as testObjectNode[];

      const templateNode = result[1].children[0].children[0];
      const rootCardNames = templateNode.children.map((card) => card.name);
      expect(rootCardNames).toEqual([
        'test/cards/zz_card',
        'test/cards/aa_card',
      ]);

      const childCardNames = templateNode.children[1].children.map(
        (card) => card.name,
      );
      expect(childCardNames).toEqual([
        'test/cards/child_b',
        'test/cards/child_a',
      ]);
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

      const result = (await buildResourceTree(
        mockCommands,
      )) as testObjectNode[];

      expect(result).toHaveLength(2); // general + templates group

      // Check root templates
      expect(result[0].name).toBe('project');
      expect(result[1].name).toBe('templates');
      expect(result[1].children).toHaveLength(2);
      expect(result[1].children[0].name).toBe('project');
      expect(result[1].children[0].children[0].name).toBe(
        'test/templates/root-template',
      );

      // Check module templates
      const moduleNode = result[1].children.find(
        (child) => child.name === 'module1',
      );
      expect(moduleNode?.children?.[0].name).toBe(
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

      const result = (await buildResourceTree(
        mockCommands,
      )) as testObjectNode[];

      expect(result).toHaveLength(1); // General group only
      expect(result[0].name).toBe('project');
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
          showFileNames: vi.fn().mockResolvedValue([]),
        },
      });

      const result = (await buildResourceTree(
        mockCommands,
      )) as testObjectNode[];

      expect(result).toHaveLength(resourceTypes.length + 1); // general + one group per resource type

      expect(result[0].name).toBe('project');

      resourceTypes.forEach((resourceType, index) => {
        expect(result[index + 1].name).toBe(resourceType);
        expect(result[index + 1].type).toBe('resourceGroup');
        expect(result[index + 1].children).toHaveLength(1);
        expect(result[index + 1].children[0].name).toBe('project');
        expect(result[index + 1].children[0].children?.[0].name).toBe(
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

      const result = (await buildResourceTree(
        mockCommands,
      )) as testObjectNode[];

      expect(result[0].name).toBe('project');

      // Check resource group IDs and types
      expect(result[1].id).toBe('fieldTypes');
      expect(result[1].type).toBe('resourceGroup');

      // Check resource node IDs and types
      expect(result[1].children[0].id).toBe('fieldTypes-project');
      expect(result[1].children[0].type).toBe('module');
      expect(result[1].children[0].children[0].id).toBe(
        'fieldTypes-test/fieldTypes/status',
      );
      expect(result[1].children[0].children[0].type).toBe('fieldTypes');

      // Check template processing
      expect(result[2].id).toBe('templates');
      expect(result[2].type).toBe('resourceGroup');
      expect(result[2].children[0].id).toBe('templates-project');
      expect(result[2].children[0].type).toBe('module');
      expect(result[2].children[0].children[0].id).toBe(
        'templates-test/templates/basic',
      );
      expect(result[2].children[0].children[0].type).toBe('templates');

      // Check card node IDs and types
      expect(result[2].children[0].children[0].children[0].id).toBe(
        'test_card1',
      );
      expect(result[2].children[0].children[0].children[0].type).toBe('card');
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
