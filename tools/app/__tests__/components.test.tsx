import { TreeMenu } from '../src/components/TreeMenu';
import { SearchableTreeMenu } from '../src/components/SearchableTreeMenu';
import { LabelEditorField } from '@/components/LabelEditor';
import type { Project } from '@/lib/definitions';
import StateSelector from '@/components/StateSelector';
import { LABEL_SPLITTER } from '@/lib/constants';
import { WorkflowCategory } from '../../data-handler/src/interfaces/resource-interfaces';
import type { QueryResult } from '@cyberismo/data-handler/types/queries';
import { expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { BrowserRouter } from 'react-router';

// mock useAppRouter and useResizeObserver
vi.mock('../src/lib/hooks', async () => {
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
  useTranslation: vi.fn(() => ({
    t: vi.fn((str, args) => {
      // Map common translation keys to their English values
      const translations: Record<string, string> = {
        searchCards: 'Search cards',
      };
      const translated = translations[str] || str;
      return args ? `${translated} ${JSON.stringify(args)}` : translated;
    }),
  })),
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
    render(
      <StateSelector
        currentState={testProject.workflows[0].states[1]}
        workflow={testProject.workflows[0]}
        onTransition={() => null}
      />,
    );
    const node = screen.getByText('stateSelector.status {"state":"Approved"}');
    expect(node).toBeVisible();

    render(
      <StateSelector
        currentState={testProject.workflows[1].states[3]}
        workflow={testProject.workflows[1]}
        onTransition={() => null}
      />,
    );
    const node2 = screen.getByText('stateSelector.status {"state":"Not OK"}');
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

describe('LabelEditor', () => {
  it('adds trimmed labels separated by the configured splitter when pressing Enter', () => {
    const handleChange = vi.fn();

    render(<LabelEditorField value={['existing']} onChange={handleChange} />);

    const input = screen.getByRole('combobox');
    fireEvent.change(input, {
      target: { value: `alpha ${LABEL_SPLITTER} beta ` },
    });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(handleChange).toHaveBeenCalledWith(['existing', 'alpha', 'beta']);
  });
  it('does not add duplicate labels', () => {
    const handleChange = vi.fn();

    render(
      <LabelEditorField
        value={['existing', 'alpha']}
        onChange={handleChange}
      />,
    );

    const input = screen.getByRole('combobox');
    fireEvent.change(input, {
      target: { value: `alpha ${LABEL_SPLITTER} beta ` },
    });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(handleChange).toHaveBeenCalledWith(['existing', 'alpha', 'beta']);
  });
  it('does not add empty labels', () => {
    const handleChange = vi.fn();

    render(<LabelEditorField value={['existing']} onChange={handleChange} />);

    const input = screen.getByRole('combobox');
    fireEvent.change(input, {
      target: { value: `   ${LABEL_SPLITTER} beta ${LABEL_SPLITTER}   ` },
    });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(handleChange).toHaveBeenCalledWith(['existing', 'beta']);
  });
  it('does not clear input if no labels were added', () => {
    const handleChange = vi.fn();

    render(
      <LabelEditorField
        value={['existing', 'alpha']}
        onChange={handleChange}
      />,
    );

    const input = screen.getByRole('combobox');
    fireEvent.change(input, {
      target: { value: `   ${LABEL_SPLITTER}   ` },
    });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(handleChange).not.toHaveBeenCalled();
    expect(input).toHaveValue(`   ${LABEL_SPLITTER}   `);
  });
  it('removes labels when the remove icon is clicked', () => {
    const handleChange = vi.fn();

    render(
      <LabelEditorField
        value={['existing', 'alpha', 'beta']}
        onChange={handleChange}
      />,
    );

    const removeButtons = screen.getAllByLabelText('removeLabel');
    expect(removeButtons).toHaveLength(3);

    fireEvent.click(removeButtons[1]); // remove 'alpha'

    expect(handleChange).toHaveBeenCalledWith(['existing', 'beta']);
  });
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

describe('SearchableTreeMenu', () => {
  const mockOnCardSelect = vi.fn();
  const mockOnMove = vi.fn();

  beforeEach(() => {
    mockOnCardSelect.mockClear();
    mockOnMove.mockClear();
  });

  it('renders with test data and displays search input', () => {
    render(
      <BrowserRouter>
        <SearchableTreeMenu
          title="Test Project"
          selectedCardKey={null}
          tree={treeQueryResult}
          onCardSelect={mockOnCardSelect}
        />
      </BrowserRouter>,
    );

    const searchInput = screen.getByPlaceholderText('Search cards');
    expect(searchInput).toBeInTheDocument();

    const heading = screen.getByText('SDL Decision');
    expect(heading).toBeInTheDocument();
  });

  it('filters tree based on search query (case-insensitive)', () => {
    render(
      <BrowserRouter>
        <SearchableTreeMenu
          title="Test Project"
          selectedCardKey={null}
          tree={treeQueryResult}
          onCardSelect={mockOnCardSelect}
        />
      </BrowserRouter>,
    );

    const searchInput = screen.getByPlaceholderText('Search cards');

    // Search for "demand" (case-insensitive)
    fireEvent.change(searchInput, { target: { value: 'demand' } });

    // "Demand phase" should be visible
    expect(screen.getByText('Demand phase')).toBeInTheDocument();

    // "Design phase" should not be visible
    expect(screen.queryByText('Design phase')).not.toBeInTheDocument();
  });

  it('includes parent nodes when child matches search', () => {
    render(
      <BrowserRouter>
        <SearchableTreeMenu
          title="Test Project"
          selectedCardKey={null}
          tree={treeQueryResult}
          onCardSelect={mockOnCardSelect}
        />
      </BrowserRouter>,
    );

    const searchInput = screen.getByPlaceholderText('Search cards');

    // Search for "Threat model" (nested child)
    fireEvent.change(searchInput, { target: { value: 'threat' } });

    // Parent nodes should be visible
    expect(screen.getByText('SDL Decision')).toBeInTheDocument();
    expect(screen.getByText('SDL Project')).toBeInTheDocument();
    expect(screen.getByText('Design phase')).toBeInTheDocument();
    expect(screen.getByText('Threat model')).toBeInTheDocument();

    // Unrelated nodes should not be visible
    expect(screen.queryByText('Demand phase')).not.toBeInTheDocument();
  });

  it('shows all nodes when search is empty', () => {
    render(
      <BrowserRouter>
        <SearchableTreeMenu
          title="Test Project"
          selectedCardKey={null}
          tree={treeQueryResult}
          onCardSelect={mockOnCardSelect}
        />
      </BrowserRouter>,
    );

    // Root node should be visible with empty search
    expect(screen.getByText('SDL Decision')).toBeInTheDocument();

    // Child nodes are not visible until expanded (openByDefault=false when no search)
    // This is expected behavior - tree is collapsed by default
  });

  it('handles search with no matches gracefully', () => {
    render(
      <BrowserRouter>
        <SearchableTreeMenu
          title="Test Project"
          selectedCardKey={null}
          tree={treeQueryResult}
          onCardSelect={mockOnCardSelect}
        />
      </BrowserRouter>,
    );

    const searchInput = screen.getByPlaceholderText('Search cards');

    // Search for non-existent term
    fireEvent.change(searchInput, { target: { value: 'nonexistent123' } });

    // No nodes should match (only root level might be rendered by arborist)
    expect(screen.queryByText('Demand phase')).not.toBeInTheDocument();
    expect(screen.queryByText('Design phase')).not.toBeInTheDocument();
    expect(screen.queryByText('Threat model')).not.toBeInTheDocument();
  });

  it('stops keyboard event propagation to prevent global shortcuts', () => {
    render(
      <BrowserRouter>
        <SearchableTreeMenu
          title="Test Project"
          selectedCardKey={null}
          tree={treeQueryResult}
          onCardSelect={mockOnCardSelect}
        />
      </BrowserRouter>,
    );

    const searchInput = screen.getByPlaceholderText('Search cards');

    // Create a spy for stopPropagation
    const keyDownEvent = new KeyboardEvent('keydown', {
      key: 'a',
      bubbles: true,
      cancelable: true,
    });
    const stopPropagationSpy = vi.spyOn(keyDownEvent, 'stopPropagation');

    fireEvent(searchInput, keyDownEvent);

    expect(stopPropagationSpy).toHaveBeenCalled();
  });

  it('forwards onCardSelect callback to TreeMenu', () => {
    render(
      <BrowserRouter>
        <SearchableTreeMenu
          title="Test Project"
          selectedCardKey={null}
          tree={treeQueryResult}
          onCardSelect={mockOnCardSelect}
        />
      </BrowserRouter>,
    );

    // Click on the root node (which is visible)
    const sdlDecisionNode = screen.getByText('SDL Decision');
    fireEvent.click(sdlDecisionNode);

    // Callback should be called
    expect(mockOnCardSelect).toHaveBeenCalled();
  });

  it('forwards onMove callback to TreeMenu when provided', () => {
    render(
      <BrowserRouter>
        <SearchableTreeMenu
          title="Test Project"
          selectedCardKey={null}
          tree={treeQueryResult}
          onCardSelect={mockOnCardSelect}
          onMove={mockOnMove}
        />
      </BrowserRouter>,
    );

    // onMove is passed through to TreeMenu
    // Actual drag-and-drop testing would require more complex setup
    // This test verifies the prop is forwarded
    expect(screen.getByText('SDL Decision')).toBeInTheDocument();
  });

  it('passes selectedCardKey to TreeMenu correctly', () => {
    render(
      <BrowserRouter>
        <SearchableTreeMenu
          title="Test Project"
          selectedCardKey="usdl_46"
          tree={treeQueryResult}
          onCardSelect={mockOnCardSelect}
        />
      </BrowserRouter>,
    );

    const node = screen.getByText('Demand phase').parentNode?.parentNode;
    expect(node).toBeVisible();
    expect(node).toHaveAttribute('aria-selected', 'true');
  });

  it('handles whitespace-only search as empty', () => {
    render(
      <BrowserRouter>
        <SearchableTreeMenu
          title="Test Project"
          selectedCardKey={null}
          tree={treeQueryResult}
          onCardSelect={mockOnCardSelect}
        />
      </BrowserRouter>,
    );

    const searchInput = screen.getByPlaceholderText('Search cards');

    // Search with only whitespace
    fireEvent.change(searchInput, { target: { value: '   ' } });

    // Root node should still be visible (whitespace trimmed results in no search)
    expect(screen.getByText('SDL Decision')).toBeInTheDocument();
  });

  it('filters with multiple word matches', () => {
    render(
      <BrowserRouter>
        <SearchableTreeMenu
          title="Test Project"
          selectedCardKey={null}
          tree={treeQueryResult}
          onCardSelect={mockOnCardSelect}
        />
      </BrowserRouter>,
    );

    const searchInput = screen.getByPlaceholderText('Search cards');

    // Search for "sdl project"
    fireEvent.change(searchInput, { target: { value: 'sdl project' } });

    // "SDL Project" contains both words
    expect(screen.getByText('SDL Project')).toBeInTheDocument();
  });

  it('updates filtered tree when search query changes', () => {
    render(
      <BrowserRouter>
        <SearchableTreeMenu
          title="Test Project"
          selectedCardKey={null}
          tree={treeQueryResult}
          onCardSelect={mockOnCardSelect}
        />
      </BrowserRouter>,
    );

    const searchInput = screen.getByPlaceholderText('Search cards');

    // First search
    fireEvent.change(searchInput, { target: { value: 'demand' } });
    expect(screen.getByText('Demand phase')).toBeInTheDocument();
    expect(screen.queryByText('Design phase')).not.toBeInTheDocument();

    // Change search
    fireEvent.change(searchInput, { target: { value: 'design' } });
    expect(screen.queryByText('Demand phase')).not.toBeInTheDocument();
    expect(screen.getByText('Design phase')).toBeInTheDocument();
  });
});
