import type { Project } from '@/lib/definitions';

import type {
  QueryResult,
  CalculationLink,
} from '@cyberismo/data-handler/types/queries';
import type { ExpandedLinkType } from '@/lib/definitions';

import { expect, test, describe } from 'vitest';

import {
  countChildren,
  deepCopy,
  findCard,
  findParentCard,
  findPathTo,
  findWorkflowForCardType,
  flattenTree,
  getDefaultValue,
  getMoveableCards,
  createPredicate,
  isCardTypePermittedForLinkType,
  isAlreadyLinked,
  canCreateLinkToCard,
  parseNestedDataAttributes,
  parseDataAttributes,
} from '@/lib/utils';

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

test('Deep copy returns a different object', () => {
  const obj = { a: 1 };
  const result = deepCopy(obj);

  expect(result).toEqual(obj);
  expect(result).not.toBe(obj);
});

test('deepCopy returns undefined when input is undefined', () => {
  const result = deepCopy(undefined);
  expect(result).toBeUndefined();
});

test('deepCopy returns null when input is null', () => {
  const result = deepCopy(null);
  expect(result).toBeNull();
});

const testProject: Project = {
  name: 'Test project',
  prefix: 'test',
  workflows: [
    {
      name: 'test/workflows/controlledDocument',
      displayName: '',
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
      displayName: '',
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
      displayName: '',
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
      displayName: '',
      workflow: 'test/workflows/controlledDocument',
      customFields: [],
      alwaysVisibleFields: [],
      optionallyVisibleFields: [],
    },
    {
      name: 'test/cardTypes/internalControl',
      displayName: '',
      workflow: 'test/workflows/internalControl',
      customFields: [],
      alwaysVisibleFields: [],
      optionallyVisibleFields: [],
    },
    {
      name: 'test/cardTypes/simplePage',
      displayName: '',
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
    policyChecks: {},
    deniedOperations: {},
    rank: '0|i',
    title: 'SDL Decision',
    cardType: 'test/cardTypes/decision',
    children: [
      {
        key: 'usdl_44',
        policyChecks: {},
        deniedOperations: {},
        rank: '0|i',
        title: 'SDL Project',
        cardType: 'test/cardTypes/simplePage',
        children: [
          {
            key: 'usdl_45',
            policyChecks: {},
            deniedOperations: {},
            rank: '0|a',
            title: 'Untitled',
            cardType: 'test/cardTypes/controlledDocument',
          },
          {
            key: 'usdl_46',
            policyChecks: {},
            deniedOperations: {},
            rank: '0|b',
            title: 'Demand phase',
            cardType: 'test/cardTypes/simplePage',
          },
          {
            key: 'usdl_47',
            policyChecks: {},
            deniedOperations: {},
            rank: '0|d',
            title: 'Design phase',
            cardType: 'test/cardTypes/simplePage',
            children: [
              {
                key: 'usdl_53',
                policyChecks: {},
                deniedOperations: {},
                rank: '0|c',
                title: 'Threat model',
                cardType: 'test/cardTypes/controlledDocument',
              },
            ],
          },
          {
            key: 'usdl_48',
            policyChecks: {},
            deniedOperations: {},
            rank: '0|e',
            title: 'Implementation phase',
            cardType: 'test/cardTypes/simplePage',
          },
          {
            key: 'usdl_49',
            policyChecks: {},
            deniedOperations: {},
            rank: '',
            title: '',
            cardType: '',
          },
          {
            key: 'usdl_50',
            policyChecks: {},
            deniedOperations: {},
            rank: '0|f',
            title: 'Release phase',
            cardType: 'test/cardTypes/simplePage',
          },
          {
            key: 'usdl_51',
            policyChecks: {},
            deniedOperations: {},
            rank: '0|g',
            title: 'Operations phase',
            cardType: 'test/cardTypes/simplePage',
          },
          {
            key: 'usdl_52',
            policyChecks: {},
            deniedOperations: {},
            rank: '0|h',
            title: 'Meetings',
            cardType: 'test/cardTypes/simplePage',
          },
        ],
      },
    ],
  },
];

// Test data for link-related functions
const mockExpandedLinkType: ExpandedLinkType = {
  name: 'testLink',
  displayName: '',
  outboundDisplayName: 'Test Link Out',
  inboundDisplayName: 'Test Link In',
  enableLinkDescription: false,
  direction: 'outbound',
  sourceCardTypes: ['typeA'],
  destinationCardTypes: ['typeB'],
  id: 1,
};

const mockPotentialTargetCard: QueryResult<'tree'> = {
  key: 'card2',
  cardType: 'typeB',
  title: 'Card 2',
  policyChecks: {},
  deniedOperations: {},
  rank: '1',
};

const mockCurrentCardLinks: CalculationLink[] = [
  {
    key: 'card3',
    linkType: 'anotherLink',
    direction: 'outbound',
    title: 'Card 3',
    displayName: 'Card 3 Link',
    linkSource: 'user',
  },
];

test('createPredicate creates a working predicate function', () => {
  const baseFunction = (a: number, b: number, c: number) => a + b + c;
  const predicate = createPredicate(baseFunction, 1, 2);
  expect(predicate(3)).toBe(6);
});

describe('isCardTypePermittedForLinkType', () => {
  test('returns true for permitted outbound link', () => {
    const linkType: ExpandedLinkType = {
      ...mockExpandedLinkType,
      direction: 'outbound',
      destinationCardTypes: ['typeB'],
    };
    const card: QueryResult<'tree'> = {
      ...mockPotentialTargetCard,
      cardType: 'typeB',
    };
    expect(isCardTypePermittedForLinkType(linkType, card)).toBe(true);
  });

  test('returns false for non-permitted outbound link', () => {
    const linkType: ExpandedLinkType = {
      ...mockExpandedLinkType,
      direction: 'outbound',
      destinationCardTypes: ['typeC'],
    };
    const card: QueryResult<'tree'> = {
      ...mockPotentialTargetCard,
      cardType: 'typeB',
    };
    expect(isCardTypePermittedForLinkType(linkType, card)).toBe(false);
  });

  test('returns true for permitted inbound link', () => {
    const linkType: ExpandedLinkType = {
      ...mockExpandedLinkType,
      direction: 'inbound',
      sourceCardTypes: ['typeA'],
    };
    const card: QueryResult<'tree'> = {
      ...mockPotentialTargetCard,
      cardType: 'typeA',
    };
    expect(isCardTypePermittedForLinkType(linkType, card)).toBe(true);
  });

  test('returns false for non-permitted inbound link', () => {
    const linkType: ExpandedLinkType = {
      ...mockExpandedLinkType,
      direction: 'inbound',
      sourceCardTypes: ['typeC'],
    };
    const card: QueryResult<'tree'> = {
      ...mockPotentialTargetCard,
      cardType: 'typeA',
    };
    expect(isCardTypePermittedForLinkType(linkType, card)).toBe(false);
  });

  test('returns true if destinationCardTypes is empty for outbound', () => {
    const linkType: ExpandedLinkType = {
      ...mockExpandedLinkType,
      direction: 'outbound',
      destinationCardTypes: [],
    };
    expect(
      isCardTypePermittedForLinkType(linkType, mockPotentialTargetCard),
    ).toBe(true);
  });

  test('returns true if sourceCardTypes is empty for inbound', () => {
    const linkType: ExpandedLinkType = {
      ...mockExpandedLinkType,
      direction: 'inbound',
      sourceCardTypes: [],
    };
    expect(
      isCardTypePermittedForLinkType(linkType, mockPotentialTargetCard),
    ).toBe(true);
  });
});

describe('isAlreadyLinked', () => {
  test('returns true if card is already linked with same type and direction', () => {
    const links: CalculationLink[] = [
      {
        key: 'card2',
        linkType: 'testLink',
        direction: 'outbound',
        title: 'Card 2',
        displayName: 'Card 2 Link',
        linkSource: 'user',
      },
    ];
    expect(
      isAlreadyLinked(links, mockPotentialTargetCard, mockExpandedLinkType),
    ).toBe(true);
  });

  test('returns false if card is linked but with different type', () => {
    const links: CalculationLink[] = [
      {
        key: 'card2',
        linkType: 'otherLink',
        direction: 'outbound',
        title: 'Card 2',
        displayName: 'Card 2 Link',
        linkSource: 'user',
      },
    ];
    expect(
      isAlreadyLinked(links, mockPotentialTargetCard, mockExpandedLinkType),
    ).toBe(false);
  });

  test('returns false if card is linked but with different direction', () => {
    const links: CalculationLink[] = [
      {
        key: 'card2',
        linkType: 'testLink',
        direction: 'inbound',
        title: 'Card 2',
        displayName: 'Card 2 Link',
        linkSource: 'user',
      },
    ];
    const linkType: ExpandedLinkType = {
      ...mockExpandedLinkType,
      direction: 'outbound',
    };
    expect(isAlreadyLinked(links, mockPotentialTargetCard, linkType)).toBe(
      false,
    );
  });

  test('returns false if card is not linked', () => {
    expect(
      isAlreadyLinked(
        mockCurrentCardLinks,
        mockPotentialTargetCard,
        mockExpandedLinkType,
      ),
    ).toBe(false);
  });

  test('returns false if card is linked with link description even if link exists', () => {
    const links: CalculationLink[] = [
      {
        key: 'card2',
        linkType: 'testLink',
        direction: 'outbound',
        title: 'Card 2',
        displayName: 'Card 2 Link',
        linkSource: 'user',
        linkDescription: 'something',
      },
    ];
    const linkTypeWithDescription: ExpandedLinkType = {
      ...mockExpandedLinkType,
      enableLinkDescription: true,
    };
    expect(
      isAlreadyLinked(links, mockPotentialTargetCard, linkTypeWithDescription),
    ).toBe(false);
  });
});

describe('canCreateLinkToCard', () => {
  const currentCardKey = 'card1';

  test('returns false if selectedLinkType is undefined', () => {
    expect(
      canCreateLinkToCard(
        currentCardKey,
        undefined,
        mockCurrentCardLinks,
        mockPotentialTargetCard,
      ),
    ).toBe(false);
  });

  test('returns false if potentialTargetCard key is the same as currentCardKey', () => {
    const card: QueryResult<'tree'> = {
      ...mockPotentialTargetCard,
      key: currentCardKey,
    };
    expect(
      canCreateLinkToCard(
        currentCardKey,
        mockExpandedLinkType,
        mockCurrentCardLinks,
        card,
      ),
    ).toBe(false);
  });

  test('returns false if card type is not permitted', () => {
    const nonPermittingLinkType: ExpandedLinkType = {
      ...mockExpandedLinkType,
      direction: 'outbound',
      destinationCardTypes: ['typeX'],
    };
    expect(
      canCreateLinkToCard(
        currentCardKey,
        nonPermittingLinkType,
        mockCurrentCardLinks,
        mockPotentialTargetCard,
      ),
    ).toBe(false);
  });

  test('returns false if card is already linked', () => {
    const alreadyLinkedSetupLinks: CalculationLink[] = [
      {
        key: mockPotentialTargetCard.key,
        linkType: mockExpandedLinkType.name,
        direction: mockExpandedLinkType.direction,
        title: 'Card 2',
        displayName: 'Card 2 Link',
        linkSource: 'user',
      },
    ];
    expect(
      canCreateLinkToCard(
        currentCardKey,
        mockExpandedLinkType,
        alreadyLinkedSetupLinks,
        mockPotentialTargetCard,
      ),
    ).toBe(false);
  });

  test('returns true if all conditions are met (linkable)', () => {
    const linkableLinkType: ExpandedLinkType = {
      name: 'testLink',
      displayName: '',
      outboundDisplayName: 'Test Link Out',
      inboundDisplayName: 'Test Link In',
      enableLinkDescription: false,
      direction: 'outbound',
      sourceCardTypes: ['typeSomethingElse'],
      destinationCardTypes: ['typeB'],
      id: 1,
    };
    const noExistingLinks: CalculationLink[] = [];

    expect(
      canCreateLinkToCard(
        currentCardKey,
        linkableLinkType,
        noExistingLinks,
        mockPotentialTargetCard,
      ),
    ).toBe(true);
  });
});

describe('parseNestedDataAttributes', () => {
  test('handles flat attributes', () => {
    const attribs = {
      key: 'test',
      anotherKey: 'value',
    };

    const result = parseNestedDataAttributes(attribs);

    expect(result).toEqual({
      key: 'test',
      anotherKey: 'value',
    });
  });

  test('handles nested attributes with dot notation', () => {
    const attribs = {
      key: 'test',
      'anotherKey.key1': 'test',
      'anotherKey.key2': 'test2',
    };

    const result = parseNestedDataAttributes(attribs);

    expect(result).toEqual({
      key: 'test',
      anotherKey: {
        key1: 'test',
        key2: 'test2',
      },
    });
  });

  test('handles deeply nested attributes', () => {
    const attribs = {
      key: 'test',
      'nested.level1.level2.level3': 'deep value',
      'nested.level1.sibling': 'sibling value',
    };

    const result = parseNestedDataAttributes(attribs);

    expect(result).toEqual({
      key: 'test',
      nested: {
        level1: {
          level2: {
            level3: 'deep value',
          },
          sibling: 'sibling value',
        },
      },
    });
  });

  test('preserves original string values', () => {
    const attribs = {
      numberValue: '42',
      boolValue: 'true',
      objectValue: '{"name":"test","value":123}',
      arrayValue: '[1,2,3]',
      'nested.jsonValue': '{"nested":true}',
    };

    const result = parseNestedDataAttributes(attribs);

    expect(result).toEqual({
      numberValue: '42',
      boolValue: 'true',
      objectValue: '{"name":"test","value":123}',
      arrayValue: '[1,2,3]',
      nested: {
        jsonValue: '{"nested":true}',
      },
    });
  });

  describe('parseDataAttributes', () => {
    test('correctly parses base64-encoded unicode JSON in options', () => {
      const optionsObj = { label: '测试🌟', value: 'üñîçødë' };
      const json = JSON.stringify(optionsObj);
      // Encode to base64
      const bytes = new TextEncoder().encode(json);
      const binary = Array.from(bytes)
        .map((b) => String.fromCharCode(b))
        .join('');
      const base64 = btoa(binary);
      const attribs = {
        key: 'test',
        options: base64,
      };
      const result = parseDataAttributes(attribs);
      expect(result.label).toBe(optionsObj.label);
      expect(result.value).toBe(optionsObj.value);
      // Also check that the original keys are present
      expect(result.key).toBe('test');
    });
    test('correctly parses even if options is not present', () => {
      const attribs = {
        key: 'test',
      };
      const result = parseDataAttributes(attribs);
      expect(result.key).toBe('test');
    });
  });
});
