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

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom';

// Only the two data sources are stubbed; the role cap in useUser and the
// hierarchy in useHasMinRole both run for real.
const state = vi.hoisted(() => ({
  readOnlyMode: false,
  role: 'editor' as string | null,
}));

vi.mock('@/lib/api/projectSettings', () => ({
  useProjectReadOnlyMode: () => state.readOnlyMode,
}));

vi.mock('@/lib/api/common', () => ({
  useSWRHook: () => ({
    user: state.role
      ? { id: '1', email: 'a@b', name: 'A', role: state.role }
      : null,
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { UserRole, useHasMinRole } from '@/lib/auth';
import { ReadOnlyBanner } from '@/components/ReadOnlyBanner';

function Probe({ role }: { role: UserRole }) {
  const allowed = useHasMinRole(role);
  return <span>{allowed ? 'yes' : 'no'}</span>;
}

function can(role: UserRole) {
  const { unmount } = render(<Probe role={role} />);
  const allowed = screen.getByText(/^(yes|no)$/).textContent === 'yes';
  unmount();
  return allowed;
}

beforeEach(() => {
  state.readOnlyMode = false;
  state.role = 'editor';
});

describe('read-only mode role cap', () => {
  it('leaves permissions alone while the mode is off', () => {
    expect(can(UserRole.Reader)).toBe(true);
    expect(can(UserRole.Editor)).toBe(true);
    expect(can(UserRole.Admin)).toBe(false);
  });

  it('drops an editor to reader while the mode is on', () => {
    state.readOnlyMode = true;

    expect(can(UserRole.Reader)).toBe(true);
    expect(can(UserRole.Editor)).toBe(false);
  });

  // Admins are exempt so the mode can always be switched back off.
  it('leaves an admin untouched while the mode is on', () => {
    state.role = 'admin';
    state.readOnlyMode = true;

    expect(can(UserRole.Editor)).toBe(true);
    expect(can(UserRole.Admin)).toBe(true);
  });

  it('grants nothing to a signed-out user either way', () => {
    state.role = null;
    state.readOnlyMode = true;

    expect(can(UserRole.Reader)).toBe(false);
  });
});

describe('ReadOnlyBanner', () => {
  it('renders nothing while the mode is off', () => {
    const { container } = render(<ReadOnlyBanner />);

    expect(container).toBeEmptyDOMElement();
  });

  it('tells non-admins that editing is disabled', () => {
    state.readOnlyMode = true;

    render(<ReadOnlyBanner />);

    expect(screen.getByText('readOnlyMode.banner')).toBeInTheDocument();
  });

  // Admins are not downgraded, so the banner is their only signal that the
  // mode is on — they get the same message as everyone else.
  it('shows the same banner to admins', () => {
    state.role = 'admin';
    state.readOnlyMode = true;

    render(<ReadOnlyBanner />);

    expect(screen.getByText('readOnlyMode.banner')).toBeInTheDocument();
  });
});
