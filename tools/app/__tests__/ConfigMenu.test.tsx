// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

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
  useAvailableProjects: () => ({ data: undefined }),
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
