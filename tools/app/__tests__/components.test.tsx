import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { TreeMenu } from '../app/components/TreeMenu';
import { Project } from '@/app/lib/definitions';
import StateSelector from '@/app/components/StateSelector';
import { workflowCategory } from '../../data-handler/src/interfaces/project-interfaces';
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
        selectedCardKey={'USDL-46'}
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
      key: 'USDL-43',
      path: '/Users/test/dev/cyberismo/unified-sdl/cardroot/USDL-43',
      children: [
        {
          key: 'USDL-44',
          path: '/Users/test/dev/cyberismo/unified-sdl/cardroot/USDL-43/c/USDL-44',
          children: [
            {
              key: 'USDL-45',
              path: '/Users/test/dev/cyberismo/unified-sdl/cardroot/USDL-43/c/USDL-44/c/USDL-45',
              children: [],
              metadata: {
                cardtype: 'controlledDocument',
                title: 'Untitled',
                workflowState: 'Draft',
                rank: '0|a',
                links: [],
              },
            },
            {
              key: 'USDL-46',
              path: '/Users/test/dev/cyberismo/unified-sdl/cardroot/USDL-43/c/USDL-44/c/USDL-46',
              children: [],
              metadata: {
                cardtype: 'simplePage',
                title: 'Demand phase',
                workflowState: 'Created',
                rank: '0|b',
                links: [],
              },
            },
            {
              key: 'USDL-47',
              path: '/Users/test/dev/cyberismo/unified-sdl/cardroot/USDL-43/c/USDL-44/c/USDL-47',
              children: [
                {
                  key: 'USDL-53',
                  path: '/Users/test/dev/cyberismo/unified-sdl/cardroot/USDL-43/c/USDL-44/c/USDL-47/c/USDL-53',
                  children: [],
                  metadata: {
                    cardtype: 'controlledDocument',
                    title: 'Threat model',
                    workflowState: 'Draft',
                    rank: '0|a',
                    links: [],
                  },
                },
              ],
              metadata: {
                cardtype: 'simplePage',
                title: 'Design phase',
                workflowState: 'Created',
                rank: '0|c',
                links: [],
              },
            },
            {
              key: 'USDL-48',
              path: '/Users/test/dev/cyberismo/unified-sdl/cardroot/USDL-43/c/USDL-44/c/USDL-48',
              children: [],
              metadata: {
                cardtype: 'simplePage',
                title: 'Implementation phase',
                workflowState: 'Created',
                rank: '0|d',
                links: [],
              },
            },
            {
              key: 'USDL-49',
              path: '/Users/test/dev/cyberismo/unified-sdl/cardroot/USDL-43/c/USDL-44/c/USDL-49',
              children: [],
              // this card has no metadata
            },
            {
              key: 'USDL-50',
              path: '/Users/test/dev/cyberismo/unified-sdl/cardroot/USDL-43/c/USDL-44/c/USDL-50',
              children: [],
              metadata: {
                cardtype: 'simplePage',
                title: 'Release phase',
                workflowState: 'Created',
                rank: '0|e',
                links: [],
              },
            },
            {
              key: 'USDL-51',
              path: '/Users/test/dev/cyberismo/unified-sdl/cardroot/USDL-43/c/USDL-44/c/USDL-51',
              children: [],
              metadata: {
                cardtype: 'simplePage',
                title: 'Operations phase',
                workflowState: 'Created',
                rank: '0|f',
                links: [],
              },
            },
            {
              key: 'USDL-52',
              path: '/Users/test/dev/cyberismo/unified-sdl/cardroot/USDL-43/c/USDL-44/c/USDL-52',
              children: [],
              metadata: {
                cardtype: 'simplePage',
                title: 'Meetings',
                workflowState: 'Created',
                rank: '0|g',
                links: [],
              },
            },
          ],
          metadata: {
            cardtype: 'simplePage',
            title: 'SDL Project',
            workflowState: 'Created',
            rank: '0|a',
            links: [],
          },
        },
      ],
      metadata: {
        cardtype: 'decision',
        title: 'SDL Decision',
        workflowState: 'Draft',
        rank: '0|b',
        links: [],
      },
    },
  ],
  workflows: [
    {
      name: 'controlled-document-workflow',
      states: [
        {
          name: 'Draft',
          category: workflowCategory.initial,
        },
        {
          name: 'Approved',
          category: workflowCategory.closed,
        },
        {
          name: 'Archived',
          category: workflowCategory.closed,
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
          category: workflowCategory.initial,
        },
        {
          name: 'Not Required',
          category: workflowCategory.closed,
        },
        {
          name: 'OK',
          category: workflowCategory.closed,
        },
        {
          name: 'Not OK',
          category: workflowCategory.active,
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
          category: workflowCategory.initial,
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
      name: 'simplepage',
      workflow: 'simple-workflow',
    },
  ],
};

const testTree: QueryResult<'tree'>[] = [
  {
    key: 'USDL-43',
    results: [
      {
        key: 'USDL-44',
        results: [
          {
            key: 'USDL-45',
            results: [],
            title: 'Untitled',
            workflowState: 'Draft',
            rank: '0|a',
            links: [],
            labels: [],
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
            key: 'USDL-46',
            results: [],
            title: 'Demand phase',
            workflowState: 'Created',
            rank: '0|b',
            links: [],
            labels: [],
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
            key: 'USDL-47',
            results: [
              {
                key: 'USDL-53',
                results: [],
                title: 'Threat model',
                workflowState: 'Draft',
                rank: '0|a',
                links: [],

                labels: [],
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
            key: 'USDL-48',
            results: [],
            title: 'Implementation phase',
            workflowState: 'Created',
            rank: '0|d',
            links: [],
            labels: [],
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
            key: 'USDL-49',
            results: [],
            links: [],
            title: 'Some title',
            rank: '0|uio',
            labels: [],
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
            key: 'USDL-50',
            results: [],
            title: 'Release phase',
            workflowState: 'Created',
            rank: '0|e',
            links: [],
            labels: [],
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
            key: 'USDL-51',
            results: [],
            title: 'Operations phase',
            workflowState: 'Created',
            rank: '0|f',
            links: [],
            labels: [],
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
            key: 'USDL-52',
            results: [],
            title: 'Meetings',
            workflowState: 'Created',
            rank: '0|g',
            links: [],
            labels: [],
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
    'base/fieldtypes/progress': 'progress',
    labels: [],
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
