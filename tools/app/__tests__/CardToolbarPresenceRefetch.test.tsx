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

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

const useRefetchCardOnPresenceChangeMock = vi.fn();

vi.mock('@/lib/api', () => ({
  useCard: () => ({
    card: { cardType: 'test', workflowState: 'draft' },
    updateWorkFlowState: vi.fn(),
    isUpdating: () => false,
  }),
  usePresence: () => [],
  useProject: () => ({ project: null }),
  useTree: () => ({ tree: [] }),
  useUser: () => ({
    user: { id: 'me', email: '', name: 'Me', role: 'editor' },
  }),
  useWorkflowGraph: () => ({ workflowGraph: null }),
  useRefetchCardOnPresenceChange: (...args: unknown[]) =>
    useRefetchCardOnPresenceChangeMock(...args),
}));

vi.mock('@/lib/hooks', () => ({
  useAppDispatch: () => vi.fn(),
}));

vi.mock('@/components/toolbar/BaseToolbar', () => ({
  default: () => null,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const { CardToolbar } = await import('@/components/toolbar/CardToolbar');

describe('CardToolbar presence-refetch wiring', () => {
  beforeEach(() => {
    useRefetchCardOnPresenceChangeMock.mockReset();
  });

  it('enables the presence refetch hook when refetchOnPresenceChange is true', () => {
    render(<CardToolbar cardKey="TST_1" refetchOnPresenceChange={true} />);

    expect(useRefetchCardOnPresenceChangeMock).toHaveBeenCalledWith(
      [],
      'me',
      'TST_1',
      true,
    );
  });

  it('defaults to disabled so template-card editors are unaffected', () => {
    render(<CardToolbar cardKey="TST_1" />);

    expect(useRefetchCardOnPresenceChangeMock).toHaveBeenCalledWith(
      [],
      'me',
      'TST_1',
      false,
    );
  });
});
