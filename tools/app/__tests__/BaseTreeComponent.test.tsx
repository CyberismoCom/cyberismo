/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026

  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router';
import type { NodeRendererProps, NodeApi } from 'react-arborist';

vi.mock('@/lib/api', () => ({
  useUser: () => ({
    user: { id: 'test', email: '', name: '', role: 'editor' },
  }),
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
