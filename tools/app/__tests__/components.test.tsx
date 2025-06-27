import { TreeMenu } from '../src/components/TreeMenu';
import { Project } from '@/lib/definitions';
import StateSelector from '@/components/StateSelector';
import { WorkflowCategory } from '../../data-handler/src/interfaces/resource-interfaces';
import { QueryResult } from '@cyberismo/data-handler/types/queries';
import { expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { BrowserRouter } from 'react-router';

// mock useAppRouter and useResizeObserver
vi.mock('../src/lib/hooks', () => {
  let callCount = 0;
  return {
    useAppRouter: vi.fn(() => ({
      push: vi.fn(),
    })),
    useResizeObserver: vi.fn(() => {
      if (callCount++ % 2 === 0) {
        return { width: 800, height: 2000, ref: vi.fn() }; // Main container height
      }
      return { width: 800, height: 50, ref: vi.fn() }; // Title bar height
    }),
  };
});

vi.mock('@/lib/utils', async () => {
  const actual = await import('@/lib/utils');

  return {
    ...actual,
    config: {
      staticMode: false,
    },
  };
});

vi.mock('react-i18next', () => ({
  useTranslation: vi.fn(),
}));

describe('TreeMenu', () => {
  it('renders with test data', () => {
    render(
      <BrowserRouter>
        <TreeMenu
          title={testProject.name}
          selectedCardKey={null}
          tree={treeQueryResult}
        />
      </BrowserRouter>,
    );

    const heading = screen.getByText('SDL Decision');
    expect(heading).toBeInTheDocument();
  });
});

describe('TreeMenu', () => {
  it('parameter card key is visible and selected in UI', () => {
    render(
      <BrowserRouter>
        <TreeMenu
          title={testProject.name}
          selectedCardKey={'usdl_46'}
          tree={treeQueryResult}
        />
      </BrowserRouter>,
    );
    const node = screen.getByText('Demand phase').parentNode?.parentNode;
    expect(node).toBeVisible();
    expect(node).toHaveAttribute('aria-selected', 'true');
  });
});

describe('StateSelector', () => {
  it('renders with test data', () => {
    vi.mock('react-i18next', () => ({
      useTranslation: vi.fn(() => ({
        t: vi.fn((str, { state }) => `${str} ${state}`),
      })),
    }));

    render(
      <StateSelector
        currentState={testProject.workflows[0].states[1]}
        workflow={testProject.workflows[0]}
        onTransition={() => null}
      />,
    );
    const node = screen.getByText('stateSelector.status Approved');
    expect(node).toBeVisible();

    render(
      <StateSelector
        currentState={testProject.workflows[1].states[3]}
        workflow={testProject.workflows[1]}
        onTransition={() => null}
      />,
    );
    const node2 = screen.getByText('stateSelector.status Not OK');
    expect(node2).toBeVisible();
  });

  it('fails gracefully if currentState and workflow do not match', () => {
    const { container } = render(
      <StateSelector
        currentState={testProject.workflows[1].states[1]}
        workflow={testProject.workflows[0]}
        onTransition={() => null}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

const testProject: Project = {
  name: 'Test project',
  workflows: [
    {
      name: 'test/workflows/controlledDocument',
      displayName: '',
      states: [
        {
          name: 'Draft',
          category: WorkflowCategory.initial,
        },
        {
          name: 'Approved',
          category: WorkflowCategory.closed,
        },
        {
          name: 'Archived',
          category: WorkflowCategory.closed,
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
          category: WorkflowCategory.initial,
        },
        {
          name: 'Not Required',
          category: WorkflowCategory.closed,
        },
        {
          name: 'OK',
          category: WorkflowCategory.closed,
        },
        {
          name: 'Not OK',
          category: WorkflowCategory.active,
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
          category: WorkflowCategory.initial,
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
