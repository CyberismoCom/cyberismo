import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { TreeMenu } from '../app/components/TreeMenu';
import { Project } from '@/app/lib/definitions';
import StateSelector from '@/app/components/StateSelector';
import { WorkflowCategory } from '../../data-handler/src/interfaces/resource-interfaces';
import { useTranslation } from 'react-i18next';
import { QueryResult } from '@cyberismocom/data-handler/types/queries';

// mock resize observer
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// mock useAppRouter

jest.mock('../app/lib/hooks', () => ({
  useAppRouter: jest.fn(() => ({
    push: jest.fn(),
  })),
}));

jest.mock('react-i18next', () => ({
  useTranslation: jest.fn(),
}));

describe('TreeMenu', () => {
  it('renders with test data', () => {
    render(
      <TreeMenu
        title={testProject.name}
        selectedCardKey={null}
        tree={treeQueryResult}
      />,
    );

    const heading = screen.getByText('SDL Decision');
    expect(heading).toBeInTheDocument();
  });
});

describe('TreeMenu', () => {
  it('parameter card key is visible and selected in UI', () => {
    render(
      <TreeMenu
        title={testProject.name}
        selectedCardKey={'usdl_46'}
        tree={treeQueryResult}
      />,
    );
    const node = screen.getByText('Demand phase').parentNode?.parentNode;
    expect(node).toBeVisible();
    expect(node).toHaveAttribute('aria-selected', 'true');
  });
});

describe('StateSelector', () => {
  it('renders with test data', () => {
    const useTranslationSpy = useTranslation as jest.Mock;
    const tSpy = jest.fn((str, { state }) => `${str} ${state}`);
    useTranslationSpy.mockReturnValue({
      t: tSpy,
    });
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
