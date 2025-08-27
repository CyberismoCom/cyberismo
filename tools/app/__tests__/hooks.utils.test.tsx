import { describe, expect, test, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import { render, screen } from '@testing-library/react';

import { useConfigTemplateCreationContext } from '@/lib/hooks';
import type { ResourceNode } from '@/lib/api/types';

let mockedResourceTree: ResourceNode[] | null = null;

// Mock useResourceTree to control resource tree structure
vi.mock('@/lib/api/resources', async () => {
  return {
    useResourceTree: () => ({ resourceTree: mockedResourceTree }),
  };
});

function HookProbe() {
  const { showTemplateCard, templateResource, parentCardKey } =
    useConfigTemplateCreationContext();
  return (
    <div>
      <div data-testid="show">{String(showTemplateCard)}</div>
      <div data-testid="template">{templateResource}</div>
      <div data-testid="parent">{parentCardKey ?? ''}</div>
    </div>
  );
}

function renderAt(pathname: string) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <Routes>
        <Route path="*" element={<HookProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('useConfigTemplateCreationContext', () => {
  beforeEach(() => {
    mockedResourceTree = null;
  });

  test('returns template context on templates route', () => {
    mockedResourceTree = [];
    renderAt('/configuration/test/templates/mytemplate');

    expect(screen.getByTestId('show').textContent).toBe('true');
    expect(screen.getByTestId('template').textContent).toBe(
      'test/templates/mytemplate',
    );
    expect(screen.getByTestId('parent').textContent).toBe('');
  });

  test('resolves template from resourceTree on card route', () => {
    // Mock tree structure: test/templates/mytemplate -> test/cards/test_ic2n3e7w
    mockedResourceTree = [
      {
        id: 'test/templates/mytemplate',
        name: 'test/templates/mytemplate',
        type: 'templates',
        children: [
          {
            id: 'test_ic2n3e7w',
            name: 'test/cards/test_ic2n3e7w',
            type: 'card',
          } as unknown as ResourceNode,
        ],
      } as unknown as ResourceNode,
    ];

    renderAt('/configuration/test/cards/test_ic2n3e7w');

    expect(screen.getByTestId('show').textContent).toBe('true');
    expect(screen.getByTestId('template').textContent).toBe(
      'test/templates/mytemplate',
    );
    expect(screen.getByTestId('parent').textContent).toBe('test_ic2n3e7w');
  });

  test('returns false outside configuration', () => {
    mockedResourceTree = [];
    renderAt('/cards');
    expect(screen.getByTestId('show').textContent).toBe('false');
    expect(screen.getByTestId('template').textContent).toBe('');
    expect(screen.getByTestId('parent').textContent).toBe('');
  });

  test('returns false in other resources', () => {
    mockedResourceTree = [];
    renderAt('/configuration/test/fieldTypes/myfieldtype');
    expect(screen.getByTestId('show').textContent).toBe('false');
    expect(screen.getByTestId('template').textContent).toBe('');
    expect(screen.getByTestId('parent').textContent).toBe('');
  });

  test('handles nested card structure correctly', () => {
    // Test deeper nesting: module/templates/template -> cards -> nested cards
    mockedResourceTree = [
      {
        id: 'test/templates/mytemplate',
        name: 'test/templates/mytemplate',
        type: 'templates',
        children: [
          {
            id: 'parent_card',
            name: 'test/cards/parent_card',
            type: 'card',
            children: [
              {
                id: 'nested_card',
                name: 'test/cards/nested_card',
                type: 'card',
              } as unknown as ResourceNode,
            ],
          } as unknown as ResourceNode,
        ],
      } as unknown as ResourceNode,
    ];

    renderAt('/configuration/test/cards/nested_card');

    expect(screen.getByTestId('show').textContent).toBe('true');
    expect(screen.getByTestId('template').textContent).toBe(
      'test/templates/mytemplate',
    );
    expect(screen.getByTestId('parent').textContent).toBe('nested_card');
  });
});
