import { Card, Project } from '@/app/lib/definitions';
import { findPathTo, findWorkflowForCard, flattenTree } from '@/app/lib/utils';

test('flattenTree works with test data', async () => {
  const result = flattenTree(testProject.cards);

  expect(result.length).toBe(11);
  expect(result[0].key).toBe('USDL-43');
  expect(result[1].key).toBe('USDL-44');
  expect(result[2].key).toBe('USDL-45');
  expect(result[3].key).toBe('USDL-46');
  expect(result[4].key).toBe('USDL-47');
  expect(result[5].key).toBe('USDL-53');
  expect(result[6].key).toBe('USDL-48');
  expect(result[7].key).toBe('USDL-49');
  expect(result[8].key).toBe('USDL-50');
  expect(result[9].key).toBe('USDL-51');
  expect(result[10].key).toBe('USDL-52');
});

test('findPathTo works with test data', async () => {
  const result = findPathTo('USDL-53', testProject.cards);

  expect(result).not.toBeNull();
  expect(result!.length).toBe(4);
  expect(result![0].key).toBe('USDL-43');
  expect(result![1].key).toBe('USDL-44');
  expect(result![2].key).toBe('USDL-47');
  expect(result![3].key).toBe('USDL-53');
});

test('findPathTo returns null when card not found', async () => {
  const result = findPathTo('NOT_FOUND', testProject.cards);

  expect(result).toBeNull();
});

test('findWorkflowForCard returns correct workflow', async () => {
  const card = testProject.cards[0].children![0];
  const result = findWorkflowForCard(card, testProject);
  expect(result?.name).toBe('simple-workflow');
});

const testProject: Project = {
  name: 'Test project',
  cards: [
    {
      key: 'USDL-43',
      path: '/Users/jaakko/dev/cyberismo/unified-sdl/cardroot/USDL-43',
      children: [
        {
          key: 'USDL-44',
          path: '/Users/jaakko/dev/cyberismo/unified-sdl/cardroot/USDL-43/c/USDL-44',
          children: [
            {
              key: 'USDL-45',
              path: '/Users/jaakko/dev/cyberismo/unified-sdl/cardroot/USDL-43/c/USDL-44/c/USDL-45',
              children: [],
              metadata: {
                cardtype: 'controlledDocument',
                summary: 'Untitled',
                workflowState: 'Draft',
              },
            },
            {
              key: 'USDL-46',
              path: '/Users/jaakko/dev/cyberismo/unified-sdl/cardroot/USDL-43/c/USDL-44/c/USDL-46',
              children: [],
              metadata: {
                cardtype: 'simplePage',
                summary: 'Demand phase',
                workflowState: 'Created',
              },
            },
            {
              key: 'USDL-47',
              path: '/Users/jaakko/dev/cyberismo/unified-sdl/cardroot/USDL-43/c/USDL-44/c/USDL-47',
              children: [
                {
                  key: 'USDL-53',
                  path: '/Users/jaakko/dev/cyberismo/unified-sdl/cardroot/USDL-43/c/USDL-44/c/USDL-47/c/USDL-53',
                  children: [],
                  metadata: {
                    cardtype: 'controlledDocument',
                    summary: 'Threat model',
                    workflowState: 'Draft',
                  },
                },
              ],
              metadata: {
                cardtype: 'simplePage',
                summary: 'Design phase',
                workflowState: 'Created',
              },
            },
            {
              key: 'USDL-48',
              path: '/Users/jaakko/dev/cyberismo/unified-sdl/cardroot/USDL-43/c/USDL-44/c/USDL-48',
              children: [],
              metadata: {
                cardtype: 'simplePage',
                summary: 'Implementation phase',
                workflowState: 'Created',
              },
            },
            {
              key: 'USDL-49',
              path: '/Users/jaakko/dev/cyberismo/unified-sdl/cardroot/USDL-43/c/USDL-44/c/USDL-49',
              children: [],
              // this card has no metadata
            },
            {
              key: 'USDL-50',
              path: '/Users/jaakko/dev/cyberismo/unified-sdl/cardroot/USDL-43/c/USDL-44/c/USDL-50',
              children: [],
              metadata: {
                cardtype: 'simplePage',
                summary: 'Release phase',
                workflowState: 'Created',
              },
            },
            {
              key: 'USDL-51',
              path: '/Users/jaakko/dev/cyberismo/unified-sdl/cardroot/USDL-43/c/USDL-44/c/USDL-51',
              children: [],
              metadata: {
                cardtype: 'simplePage',
                summary: 'Operations phase',
                workflowState: 'Created',
              },
            },
            {
              key: 'USDL-52',
              path: '/Users/jaakko/dev/cyberismo/unified-sdl/cardroot/USDL-43/c/USDL-44/c/USDL-52',
              children: [],
              metadata: {
                cardtype: 'simplePage',
                summary: 'Meetings',
                workflowState: 'Created',
              },
            },
          ],
          metadata: {
            cardtype: 'simplePage',
            summary: 'SDL Project',
            workflowState: 'Created',
          },
        },
      ],
      metadata: {
        cardtype: 'decision',
        summary: 'SDL Decision',
        workflowState: 'Draft',
      },
    },
  ],
  workflows: [
    {
      name: 'controlled-document-workflow',
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
      name: 'internalControlWorkflow',
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
      name: 'simple-workflow',
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
      name: 'controlledDocument',
      workflow: 'controlled-document-workflow',
    },
    {
      name: 'internalControl',
      workflow: 'internalControlWorkflow',
    },
    {
      name: 'simplePage',
      workflow: 'simple-workflow',
    },
  ],
};
