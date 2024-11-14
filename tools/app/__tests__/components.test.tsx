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
        tree={testTree}
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
        tree={testTree}
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
  cards: [
    {
      key: 'usdl_43',
      path: '/Users/test/dev/cyberismo/unified-sdl/cardRoot/usdl_43',
      children: [
        {
          key: 'usdl_44',
          path: '/Users/test/dev/cyberismo/unified-sdl/cardRoot/usdl_43/c/usdl_44',
          children: [
            {
              key: 'usdl_45',
              path: '/Users/test/dev/cyberismo/unified-sdl/cardRoot/usdl_43/c/usdl_44/c/usdl_45',
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
              path: '/Users/test/dev/cyberismo/unified-sdl/cardRoot/usdl_43/c/usdl_44/c/usdl_46',
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
              path: '/Users/test/dev/cyberismo/unified-sdl/cardRoot/usdl_43/c/usdl_44/c/usdl_47',
              children: [
                {
                  key: 'usdl_53',
                  path: '/Users/test/dev/cyberismo/unified-sdl/cardRoot/usdl_43/c/usdl_44/c/usdl_47/c/usdl_53',
                  children: [],
                  metadata: {
                    cardType: 'test/cardTypes/controlledDocument',
                    title: 'Threat model',
                    workflowState: 'Draft',
                    rank: '0|a',
                    links: [],
                  },
                },
              ],
              metadata: {
                cardType: 'test/cardTypes/simplePage',
                title: 'Design phase',
                workflowState: 'Created',
                rank: '0|c',
                links: [],
              },
            },
            {
              key: 'usdl_48',
              path: '/Users/test/dev/cyberismo/unified-sdl/cardRoot/usdl_43/c/usdl_44/c/usdl_48',
              children: [],
              metadata: {
                cardType: 'test/cardTypes/simplePage',
                title: 'Implementation phase',
                workflowState: 'Created',
                rank: '0|d',
                links: [],
              },
            },
            {
              key: 'usdl_49',
              path: '/Users/test/dev/cyberismo/unified-sdl/cardRoot/usdl_43/c/usdl_44/c/usdl_49',
              children: [],
              // this card has no metadata
            },
            {
              key: 'usdl_50',
              path: '/Users/test/dev/cyberismo/unified-sdl/cardRoot/usdl_43/c/usdl_44/c/usdl_50',
              children: [],
              metadata: {
                cardType: 'test/cardTypes/simplePage',
                title: 'Release phase',
                workflowState: 'Created',
                rank: '0|e',
                links: [],
              },
            },
            {
              key: 'usdl_51',
              path: '/Users/test/dev/cyberismo/unified-sdl/cardRoot/usdl_43/c/usdl_44/c/usdl_51',
              children: [],
              metadata: {
                cardType: 'test/cardTypes/simplePage',
                title: 'Operations phase',
                workflowState: 'Created',
                rank: '0|f',
                links: [],
              },
            },
            {
              key: 'usdl_52',
              path: '/Users/test/dev/cyberismo/unified-sdl/cardRoot/usdl_43/c/usdl_44/c/usdl_52',
              children: [],
              metadata: {
                cardType: 'test/cardTypes/simplePage',
                title: 'Meetings',
                workflowState: 'Created',
                rank: '0|g',
                links: [],
              },
            },
          ],
          metadata: {
            cardType: 'test/cardTypes/simplePage',
            title: 'SDL Project',
            workflowState: 'Created',
            rank: '0|a',
            links: [],
          },
        },
      ],
      metadata: {
        cardType: 'test/cardTypes/decision',
        title: 'SDL Decision',
        workflowState: 'Draft',
        rank: '0|b',
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

const testTree: QueryResult<'tree'>[] = [
  {
    key: 'usdl_43',
    results: [
      {
        key: 'usdl_44',
        results: [
          {
            key: 'usdl_45',
            results: [],
            title: 'Untitled',
            workflowState: 'Draft',
            rank: '0|a',
            links: [],
            labels: [],
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
          },
          {
            key: 'usdl_46',
            results: [],
            title: 'Demand phase',
            workflowState: 'Created',
            rank: '0|b',
            links: [],
            labels: [],
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
          },
          {
            key: 'usdl_47',
            results: [
              {
                key: 'usdl_53',
                results: [],
                title: 'Threat model',
                workflowState: 'Draft',
                rank: '0|a',
                links: [],

                labels: [],
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
              },
            ],
            title: 'Design phase',
            workflowState: 'Created',
            rank: '0|c',
            links: [],

            labels: [],
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
          },
          {
            key: 'usdl_48',
            results: [],
            title: 'Implementation phase',
            workflowState: 'Created',
            rank: '0|d',
            links: [],
            labels: [],
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
          },
          {
            key: 'usdl_49',
            results: [],
            links: [],
            title: 'Some title',
            rank: '0|uio',
            labels: [],
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
          },
          {
            key: 'usdl_50',
            results: [],
            title: 'Release phase',
            workflowState: 'Created',
            rank: '0|e',
            links: [],
            labels: [],
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
          },
          {
            key: 'usdl_51',
            results: [],
            title: 'Operations phase',
            workflowState: 'Created',
            rank: '0|f',
            links: [],
            labels: [],
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
          },
          {
            key: 'usdl_52',
            results: [],
            title: 'Meetings',
            workflowState: 'Created',
            rank: '0|g',
            links: [],
            labels: [],
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
          },
        ],
        title: 'SDL Project',
        workflowState: 'Created',
        rank: '0|a',
        links: [],
        labels: [],
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
      },
    ],
    title: 'SDL Decision',
    workflowState: 'Draft',
    rank: '0|b',
    links: [],
    'base/fieldTypes/progress': 'progress',
    labels: [],
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
  },
];
