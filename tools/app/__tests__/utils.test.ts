import { CardDetails, Project } from '@/app/lib/definitions';
import {
  countChildren,
  findCard,
  findParentCard,
  findPathTo,
  findWorkflowForCardType,
  flattenTree,
  getDefaultValue,
  getMoveableCards,
} from '@/app/lib/utils';
import { QueryResult } from '@cyberismocom/data-handler/types/queries';

test('flattenTree works with test data', async () => {
  const result = flattenTree(treeQueryResult);

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
  const result = findPathTo('usdl_53', treeQueryResult);

  expect(result).not.toBeNull();
  expect(result!.length).toBe(4);
  expect(result![0].key).toBe('usdl_43');
  expect(result![1].key).toBe('usdl_44');
  expect(result![2].key).toBe('usdl_47');
  expect(result![3].key).toBe('usdl_53');
});

test('findPathTo returns null when card not found', async () => {
  const result = findPathTo('NOT_FOUND', treeQueryResult);

  expect(result).toBeNull();
});

test('findWorkflowForCardType returns correct workflow', async () => {
  const result = findWorkflowForCardType(
    'test/cardTypes/simplePage',
    testProject,
  );
  expect(result?.name).toBe('test/workflows/simple');
});

test('findCard returns a card', async () => {
  const card = findCard(treeQueryResult, 'usdl_46');
  expect(card?.key).toBe('usdl_46');
  expect(card?.title).toBe('Demand phase');
});

test('findCard returns null if card not found', async () => {
  const card = findCard(treeQueryResult, 'not_found');
  expect(card).toBeNull();
});

test('findParentCard returns a card', async () => {
  const card = findParentCard(treeQueryResult, 'usdl_46');
  expect(card?.key).toBe('usdl_44');
});

test('findParentCard returns null for root card', async () => {
  const card = findParentCard(treeQueryResult, 'usdl_43');
  expect(card).toBeNull();
});

test('countChildren returns correct count', async () => {
  const count = countChildren(treeQueryResult[0]);
  expect(count).toBe(11);
});

test('getMovableCards returns correct cards', async () => {
  const result = getMoveableCards(treeQueryResult, 'usdl_45');
  expect(result.length).toBe(9);
  expect(result.find((card) => card.key === 'usdl_45')).toBeUndefined();
  expect(result.find((card) => card.key === 'usdl_44')).toBeUndefined();
});

test('getDefaultValue returns a string for enums', () => {
  const result = getDefaultValue({
    value: 'test',
  });
  expect(result).toBe('test');
});
test('getDefaultValue returns a null for null', () => {
  const result = getDefaultValue(null);
  expect(result).toBe(null);
});

['3', 3, true].forEach((value) => {
  test(`getDefaultValue returns the original value for ${value}`, () => {
    const result = getDefaultValue(value);
    expect(result).toBe(value);
  });
});

const testProject: Project = {
  name: 'Test project',
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
      customFields: [],
      alwaysVisibleFields: [],
      optionallyVisibleFields: [],
    },
    {
      name: 'test/cardTypes/internalControl',
      workflow: 'test/workflows/internalControl',
      customFields: [],
      alwaysVisibleFields: [],
      optionallyVisibleFields: [],
    },
    {
      name: 'test/cardTypes/simplePage',
      workflow: 'test/workflows/simple',
      customFields: [],
      alwaysVisibleFields: [],
      optionallyVisibleFields: [],
    },
  ],
};

const treeQueryResult: QueryResult<'tree'>[] = [
  {
    key: 'usdl_43',
    labels: [],
    links: [],
    notifications: [],
    policyChecks: {
      successes: [],
      failures: [],
    },
    deniedOperations: {
      transition: [],
      move: [],
      delete: [],
      editField: [],
      editContent: [],
    },
    rank: '0|i',
    title: 'SDL Decision',
    cardType: 'test/cardTypes/decision',
    children: [
      {
        key: 'usdl_44',
        labels: [],
        links: [],
        notifications: [],
        policyChecks: {
          successes: [],
          failures: [],
        },
        deniedOperations: {
          transition: [],
          move: [],
          delete: [],
          editField: [],
          editContent: [],
        },
        rank: '0|i',
        title: 'SDL Project',
        cardType: 'test/cardTypes/simplePage',
        children: [
          {
            key: 'usdl_45',
            labels: [],
            links: [],
            notifications: [],
            policyChecks: {
              successes: [],
              failures: [],
            },
            deniedOperations: {
              transition: [],
              move: [],
              delete: [],
              editField: [],
              editContent: [],
            },
            rank: '0|a',
            title: 'Untitled',
            cardType: 'test/cardTypes/controlledDocument',
          },
          {
            key: 'usdl_46',
            labels: [],
            links: [],
            notifications: [],
            policyChecks: {
              successes: [],
              failures: [],
            },
            deniedOperations: {
              transition: [],
              move: [],
              delete: [],
              editField: [],
              editContent: [],
            },
            rank: '0|b',
            title: 'Demand phase',
            cardType: 'test/cardTypes/simplePage',
          },
          {
            key: 'usdl_47',
            labels: [],
            links: [],
            notifications: [],
            policyChecks: {
              successes: [],
              failures: [],
            },
            deniedOperations: {
              transition: [],
              move: [],
              delete: [],
              editField: [],
              editContent: [],
            },
            rank: '0|d',
            title: 'Design phase',
            cardType: 'test/cardTypes/simplePage',
            children: [
              {
                key: 'usdl_53',
                labels: [],
                links: [],
                notifications: [],
                policyChecks: {
                  successes: [],
                  failures: [],
                },
                deniedOperations: {
                  transition: [],
                  move: [],
                  delete: [],
                  editField: [],
                  editContent: [],
                },
                rank: '0|c',
                title: 'Threat model',
                cardType: 'test/cardTypes/controlledDocument',
              },
            ],
          },
          {
            key: 'usdl_48',
            labels: [],
            links: [],
            notifications: [],
            policyChecks: {
              successes: [],
              failures: [],
            },
            deniedOperations: {
              transition: [],
              move: [],
              delete: [],
              editField: [],
              editContent: [],
            },
            rank: '0|e',
            title: 'Implementation phase',
            cardType: 'test/cardTypes/simplePage',
          },
          {
            key: 'usdl_49',
            labels: [],
            links: [],
            notifications: [],
            policyChecks: {
              successes: [],
              failures: [],
            },
            deniedOperations: {
              transition: [],
              move: [],
              delete: [],
              editField: [],
              editContent: [],
            },
            rank: '',
            title: '',
            cardType: '',
          },
          {
            key: 'usdl_50',
            labels: [],
            links: [],
            notifications: [],
            policyChecks: {
              successes: [],
              failures: [],
            },
            deniedOperations: {
              transition: [],
              move: [],
              delete: [],
              editField: [],
              editContent: [],
            },
            rank: '0|f',
            title: 'Release phase',
            cardType: 'test/cardTypes/simplePage',
          },
          {
            key: 'usdl_51',
            labels: [],
            links: [],
            notifications: [],
            policyChecks: {
              successes: [],
              failures: [],
            },
            deniedOperations: {
              transition: [],
              move: [],
              delete: [],
              editField: [],
              editContent: [],
            },
            rank: '0|g',
            title: 'Operations phase',
            cardType: 'test/cardTypes/simplePage',
          },
          {
            key: 'usdl_52',
            labels: [],
            links: [],
            notifications: [],
            policyChecks: {
              successes: [],
              failures: [],
            },
            deniedOperations: {
              transition: [],
              move: [],
              delete: [],
              editField: [],
              editContent: [],
            },
            rank: '0|h',
            title: 'Meetings',
            cardType: 'test/cardTypes/simplePage',
          },
        ],
      },
    ],
  },
];
