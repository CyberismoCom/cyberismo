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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

const push = vi.fn();
vi.mock('@/lib/hooks', () => ({
  useAppRouter: () => ({ push }),
}));

vi.mock('react-redux', () => ({
  useDispatch: () => vi.fn(),
}));

vi.mock('react-router', () => ({
  useParams: () => ({ projectPrefix: 'proj' }),
}));

vi.mock('@/lib/api', () => ({
  useResourceTree: () => ({ resourceTree: [] }),
  useUser: () => ({
    user: { id: 'u1', email: '', name: '', role: 'admin' },
  }),
}));

vi.mock('@/lib/api/project', () => ({
  useProject: () => ({
    project: { name: 'Test Project' },
    updateCard: vi.fn(),
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (s: string) => s }),
}));

let baseTreeProps: { onBackClick?: () => void; title?: string } = {};
vi.mock('@/components/BaseTreeComponent', () => ({
  BaseTreeComponent: (props: { onBackClick?: () => void; title?: string }) => {
    baseTreeProps = props;
    return null;
  },
}));

import ConfigMenu from '@/components/ConfigMenu';

describe('ConfigMenu back button', () => {
  beforeEach(() => {
    push.mockClear();
    baseTreeProps = {};
  });

  it('navigates to the project-scoped cards route when back is triggered', () => {
    render(<ConfigMenu />);

    expect(baseTreeProps.title).toBe('Configuration - Test Project');
    expect(baseTreeProps.onBackClick).toBeInstanceOf(Function);

    baseTreeProps.onBackClick?.();

    expect(push).toHaveBeenCalledWith('/projects/proj/cards');
  });
});
