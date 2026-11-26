// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router';
import type { NodeRendererProps, NodeApi } from 'react-arborist';

vi.mock('@/lib/api', () => ({
  useUser: () => ({
    user: { id: 'test', email: '', name: '', role: 'editor' },
  }),
  useAvailableProjects: () => ({ data: undefined }),
}));

vi.mock('@/lib/hooks', () => ({
  useResizeObserver: () => ({ width: 400, height: 400, ref: vi.fn() }),
}));

import { BaseTreeComponent } from '@/components/BaseTreeComponent';

type Node = { id: string; name: string; children?: Node[] };

const NoopRenderer = ({
  node,
}: NodeRendererProps<Node> & {
  onNodeClick?: (node: NodeApi<Node>) => void;
}) => <div>{node.data.name}</div>;

describe('BaseTreeComponent back button', () => {
  it('does not render a back button when onBackClick is not provided', () => {
    render(
      <BrowserRouter>
        <BaseTreeComponent<Node>
          title="Configuration - Test"
          linkTo="/configuration"
          data={[]}
          nodeRenderer={NoopRenderer}
          idAccessor="id"
          childrenAccessor="children"
        />
      </BrowserRouter>,
    );
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  });

  it('renders a back button that calls onBackClick when clicked', () => {
    const onBackClick = vi.fn();
    render(
      <BrowserRouter>
        <BaseTreeComponent<Node>
          title="Configuration - Test"
          linkTo="/configuration"
          onBackClick={onBackClick}
          backLabel="Back"
          data={[]}
          nodeRenderer={NoopRenderer}
          idAccessor="id"
          childrenAccessor="children"
        />
      </BrowserRouter>,
    );

    const backButton = screen.getByRole('button', { name: 'Back' });
    fireEvent.click(backButton);
    expect(onBackClick).toHaveBeenCalledTimes(1);
  });
});

describe('BaseTreeComponent selection', () => {
  const data: Node[] = [
    {
      id: 'root',
      name: 'Root',
      children: [
        {
          id: 'parent',
          name: 'Parent',
          children: [{ id: 'child', name: 'Child' }],
        },
      ],
    },
    { id: 'other', name: 'Other' },
  ];

  const renderTree = (openByDefault: boolean) => (
    <BrowserRouter>
      <BaseTreeComponent<Node>
        data={data}
        selectedId="child"
        openByDefault={openByDefault}
        nodeRenderer={NoopRenderer}
        idAccessor="id"
        childrenAccessor="children"
      />
    </BrowserRouter>
  );

  it('keeps the selected node visible when openByDefault is cleared', async () => {
    // As when a card is selected in search results and the search is cleared.
    const { rerender } = render(renderTree(true));
    expect(await screen.findByText('Child')).toBeTruthy();

    rerender(renderTree(false));

    await waitFor(() => expect(screen.queryByText('Child')).toBeTruthy());
    expect(screen.getByText('Parent')).toBeTruthy();
  });

  it('does not take the focus when openByDefault changes', async () => {
    // As when the user types the first letter in the search field.
    const withInput = (openByDefault: boolean) => (
      <>
        <input aria-label="Search" />
        {renderTree(openByDefault)}
      </>
    );
    const { rerender } = render(withInput(false));
    await screen.findByText('Child');
    const input = screen.getByRole('textbox', { name: 'Search' });
    input.focus();

    rerender(withInput(true));
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(document.activeElement).toBe(input);
  });
});
