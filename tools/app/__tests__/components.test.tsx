import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { TreeMenu } from '../app/components/TreeMenu';
import { Project } from '@/app/lib/definitions';
import StateSelector from '@/app/components/StateSelector';
import { workflowCategory } from '../../data-handler/src/interfaces/project-interfaces';
import { useTranslation } from 'react-i18next';

// Mock useRouter:
jest.mock('next/navigation', () => ({
  useRouter() {
    return {
      prefetch: () => null,
    };
  },
}));

jest.mock('react-i18next', () => ({
  useTranslation: jest.fn(),
}));

describe('TreeMenu', () => {
  it('renders with test data', () => {
    render(
      <TreeMenu
        cards={testProject.cards}
        title={testProject.name}
        selectedCardKey={null}
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
        cards={testProject.cards}
        title={testProject.name}
        selectedCardKey={'USDL-46'}
      />,
    );
    const node = screen.getByText('Demand phase').parentNode;
    expect(node).toBeVisible();
    expect(node).toHaveClass('Mui-selected');
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
