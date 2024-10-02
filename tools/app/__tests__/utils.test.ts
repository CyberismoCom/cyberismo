import { Card, Project } from '@/app/lib/definitions';
import { findPathTo, findWorkflowForCard, flattenTree } from '@/app/lib/utils';

test('flattenTree works with test data', async () => {
  const result = flattenTree(testProject.cards);

  expect(result.length).toBe(11);
  expect(result[0].key).toBe('usdl_43');
  expect(result[1].key).toBe('usdl_44');
  expect(result[2].key).toBe('usdl_45');
  expect(result[3].key).toBe('usdl_46');
  expect(result[4].key).toBe('usdl_47');
  expect(result[5].key).toBe('usdl_53');
  expect(result[6].key).toBe('usdl_48');
  expect(result[7].key).toBe('usdl_49');
  expect(result[8].key).toBe('usdl_50');
  expect(result[9].key).toBe('usdl_51');
  expect(result[10].key).toBe('usdl_52');
});

test('findPathTo works with test data', async () => {
  const result = findPathTo('usdl_53', testProject.cards);

  expect(result).not.toBeNull();
  expect(result!.length).toBe(4);
  expect(result![0].key).toBe('usdl_43');
  expect(result![1].key).toBe('usdl_44');
  expect(result![2].key).toBe('usdl_47');
  expect(result![3].key).toBe('usdl_53');
});

test('findPathTo returns null when card not found', async () => {
  const result = findPathTo('NOT_FOUND', testProject.cards);

  expect(result).toBeNull();
});

test('findWorkflowForCard returns correct workflow', async () => {
  const card = testProject.cards[0].children![0];
  expect(card.key).toBe('usdl_44');
  expect(card.metadata?.cardType).toBe('test/cardTypes/simplePage');
  const result = findWorkflowForCard(card, testProject);
  expect(result?.name).toBe('test/workflows/simple');
});

const testProject: Project = {
  name: 'Test project',
  cards: [
    {
      key: 'usdl_43',
      path: '/Users/jaakko/dev/cyberismo/unified-sdl/cardRoot/usdl_43',
      children: [
        {
          key: 'usdl_44',
          path: '/Users/jaakko/dev/cyberismo/unified-sdl/cardRoot/usdl_43/c/usdl_44',
          children: [
            {
              key: 'usdl_45',
              path: '/Users/jaakko/dev/cyberismo/unified-sdl/cardRoot/usdl_43/c/usdl_44/c/usdl_45',
              children: [],
              metadata: {
                cardType: 'test/cardTypes/controlledDocument',
                title: 'Untitled',
                workflowState: 'Draft',
                rank: '0|a',
                links: [],
              },
            },
            {
              key: 'usdl_46',
              path: '/Users/jaakko/dev/cyberismo/unified-sdl/cardRoot/usdl_43/c/usdl_44/c/usdl_46',
              children: [],
              metadata: {
                cardType: 'test/cardTypes/simplePage',
                title: 'Demand phase',
                workflowState: 'Created',
                rank: '0|b',
                links: [],
              },
            },
            {
              key: 'usdl_47',
              path: '/Users/jaakko/dev/cyberismo/unified-sdl/cardRoot/usdl_43/c/usdl_44/c/usdl_47',
              children: [
                {
                  key: 'usdl_53',
                  path: '/Users/jaakko/dev/cyberismo/unified-sdl/cardRoot/usdl_43/c/usdl_44/c/usdl_47/c/usdl_53',
                  children: [],
                  metadata: {
                    cardType: 'test/cardTypes/controlledDocument',
                    title: 'Threat model',
                    workflowState: 'Draft',
                    rank: '0|c',
                    links: [],
                  },
                },
              ],
              metadata: {
                cardType: 'test/cardTypes/simplePage',
                title: 'Design phase',
                workflowState: 'Created',
                rank: '0|d',
                links: [],
              },
            },
            {
              key: 'usdl_48',
              path: '/Users/jaakko/dev/cyberismo/unified-sdl/cardRoot/usdl_43/c/usdl_44/c/usdl_48',
              children: [],
              metadata: {
                cardType: 'test/cardTypes/simplePage',
                title: 'Implementation phase',
                workflowState: 'Created',
                rank: '0|e',
                links: [],
              },
            },
            {
              key: 'usdl_49',
              path: '/Users/jaakko/dev/cyberismo/unified-sdl/cardRoot/usdl_43/c/usdl_44/c/usdl_49',
              children: [],
              // this card has no metadata
            },
            {
              key: 'usdl_50',
              path: '/Users/jaakko/dev/cyberismo/unified-sdl/cardRoot/usdl_43/c/usdl_44/c/usdl_50',
              children: [],
              metadata: {
                cardType: 'test/cardTypes/simplePage',
                title: 'Release phase',
                workflowState: 'Created',
                rank: '0|f',
                links: [],
              },
            },
            {
              key: 'usdl_51',
              path: '/Users/jaakko/dev/cyberismo/unified-sdl/cardRoot/usdl_43/c/usdl_44/c/usdl_51',
              children: [],
              metadata: {
                cardType: 'test/cardTypes/simplePage',
                title: 'Operations phase',
                workflowState: 'Created',
                rank: '0|g',
                links: [],
              },
            },
            {
              key: 'usdl_52',
              path: '/Users/jaakko/dev/cyberismo/unified-sdl/cardRoot/usdl_43/c/usdl_44/c/usdl_52',
              children: [],
              metadata: {
                cardType: 'test/cardTypes/simplePage',
                title: 'Meetings',
                workflowState: 'Created',
                rank: '0|h',
                links: [],
              },
            },
          ],
          metadata: {
            cardType: 'test/cardTypes/simplePage',
            title: 'SDL Project',
            workflowState: 'Created',
            rank: '0|i',
            links: [],
          },
        },
      ],
      metadata: {
        cardType: 'test/cardTypes/decision',
        title: 'SDL Decision',
        workflowState: 'Draft',
        rank: '0|i',
        links: [],
      },
    },
  ],
  workflows: [
    {
      name: 'test/workflows/controlledDocument',
      states: [
        {
          name: 'Draft',
        },
        {
          name: 'Approved',
        },
        {
          name: 'Archived',
        },
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
        {
          name: 'Archive',
          fromState: ['*'],
          toState: 'Archived',
        },
        {
          name: 'Reopen',
          fromState: ['*'],
          toState: 'Draft',
        },
      ],
    },
    {
      name: 'test/workflows/internalControl',
      states: [
        {
          name: 'Open',
        },
        {
          name: 'Not Required',
        },
        {
          name: 'OK',
        },
        {
          name: 'Not OK',
        },
      ],
      transitions: [
        {
          name: 'Create',
          fromState: [''],
          toState: 'Open',
        },
        {
          name: 'Review as Required',
          fromState: ['Open'],
          toState: 'Not OK',
        },
        {
          name: 'Review as Not Required',
          fromState: ['Open'],
          toState: 'Not Required',
        },
        {
          name: 'Reopen',
          fromState: ['*'],
          toState: 'Open',
        },
        {
          name: 'Review as OK',
          fromState: ['Not OK'],
          toState: 'OK',
        },
      ],
    },
    {
      name: 'test/workflows/simple',
      states: [
        {
          name: 'Created',
        },
      ],
      transitions: [
        {
          name: 'Create',
          fromState: [''],
          toState: 'Created',
        },
      ],
    },
  ],
  cardTypes: [
    {
      name: 'test/cardTypes/controlledDocument',
      workflow: 'test/workflows/controlledDocument',
    },
    {
      name: 'test/cardTypes/internalControl',
      workflow: 'test/workflows/internalControl',
    },
    {
      name: 'test/cardTypes/simplePage',
      workflow: 'test/workflows/simple',
    },
  ],
};
