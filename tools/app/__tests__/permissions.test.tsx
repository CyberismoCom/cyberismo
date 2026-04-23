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
import { render, screen } from '@testing-library/react';

import { parseRole, roleSatisfies, UserRole } from '@/lib/auth/roles';
import { useHasRole } from '@/lib/auth/usePermissions';
import { Gate } from '@/lib/auth/Gate';

const useUserMock = vi.fn(() => ({ user: null as unknown }));

vi.mock('@/lib/api', () => ({
  useUser: () => useUserMock(),
}));

beforeEach(() => {
  useUserMock.mockReset();
  useUserMock.mockReturnValue({ user: null });
});

describe('roleSatisfies', () => {
  it('returns false when user role is null', () => {
    expect(roleSatisfies(null, UserRole.Reader)).toBe(false);
    expect(roleSatisfies(null, UserRole.Editor)).toBe(false);
    expect(roleSatisfies(null, UserRole.Admin)).toBe(false);
  });

  it('enforces the reader < editor < admin hierarchy', () => {
    // Reader satisfies reader only
    expect(roleSatisfies(UserRole.Reader, UserRole.Reader)).toBe(true);
    expect(roleSatisfies(UserRole.Reader, UserRole.Editor)).toBe(false);
    expect(roleSatisfies(UserRole.Reader, UserRole.Admin)).toBe(false);

    // Editor satisfies reader and editor
    expect(roleSatisfies(UserRole.Editor, UserRole.Reader)).toBe(true);
    expect(roleSatisfies(UserRole.Editor, UserRole.Editor)).toBe(true);
    expect(roleSatisfies(UserRole.Editor, UserRole.Admin)).toBe(false);

    // Admin satisfies everything
    expect(roleSatisfies(UserRole.Admin, UserRole.Reader)).toBe(true);
    expect(roleSatisfies(UserRole.Admin, UserRole.Editor)).toBe(true);
    expect(roleSatisfies(UserRole.Admin, UserRole.Admin)).toBe(true);
  });

  it('admin passes for editor minimum', () => {
    expect(roleSatisfies(UserRole.Admin, UserRole.Editor)).toBe(true);
  });

  it('reader fails for editor minimum', () => {
    expect(roleSatisfies(UserRole.Reader, UserRole.Editor)).toBe(false);
  });
});

describe('parseRole', () => {
  it('parses known role strings', () => {
    expect(parseRole('reader')).toBe(UserRole.Reader);
    expect(parseRole('editor')).toBe(UserRole.Editor);
    expect(parseRole('admin')).toBe(UserRole.Admin);
  });

  it('returns null for unknown strings', () => {
    expect(parseRole('superuser')).toBeNull();
    expect(parseRole('owner')).toBeNull();
    expect(parseRole('')).toBeNull();
  });

  it('returns null for null and undefined', () => {
    expect(parseRole(null)).toBeNull();
    expect(parseRole(undefined)).toBeNull();
  });

  it('is case-insensitive', () => {
    expect(parseRole('READER')).toBe(UserRole.Reader);
    expect(parseRole('Editor')).toBe(UserRole.Editor);
    expect(parseRole('ADMIN')).toBe(UserRole.Admin);
    expect(parseRole('aDmIn')).toBe(UserRole.Admin);
  });
});

function Probe({ role }: { role: UserRole }) {
  const allowed = useHasRole(role);
  return <span>{allowed ? 'yes' : 'no'}</span>;
}

function renderProbe(role: UserRole) {
  const { unmount } = render(<Probe role={role} />);
  const text = screen.getByText(/^(yes|no)$/).textContent;
  unmount();
  return text === 'yes';
}

describe('useHasRole', () => {
  it('treats a synthetic reader user (static mode) as reader-only', () => {
    useUserMock.mockReturnValue({
      user: { id: 'static-reader', email: '', name: '', role: 'reader' },
    });

    expect(renderProbe(UserRole.Reader)).toBe(true);
    expect(renderProbe(UserRole.Editor)).toBe(false);
    expect(renderProbe(UserRole.Admin)).toBe(false);
  });

  it('returns false when user is null', () => {
    useUserMock.mockReturnValue({ user: null });

    expect(renderProbe(UserRole.Reader)).toBe(false);
    expect(renderProbe(UserRole.Editor)).toBe(false);
    expect(renderProbe(UserRole.Admin)).toBe(false);
  });

  it('handles a reader user correctly', () => {
    useUserMock.mockReturnValue({
      user: { id: '1', email: 'a@b', name: 'A', role: 'reader' },
    });

    expect(renderProbe(UserRole.Reader)).toBe(true);
    expect(renderProbe(UserRole.Editor)).toBe(false);
    expect(renderProbe(UserRole.Admin)).toBe(false);
  });

  it('handles an editor user correctly', () => {
    useUserMock.mockReturnValue({
      user: { id: '1', email: 'a@b', name: 'A', role: 'editor' },
    });

    expect(renderProbe(UserRole.Reader)).toBe(true);
    expect(renderProbe(UserRole.Editor)).toBe(true);
    expect(renderProbe(UserRole.Admin)).toBe(false);
  });

  it('handles an admin user correctly', () => {
    useUserMock.mockReturnValue({
      user: { id: '1', email: 'a@b', name: 'A', role: 'admin' },
    });

    expect(renderProbe(UserRole.Reader)).toBe(true);
    expect(renderProbe(UserRole.Editor)).toBe(true);
    expect(renderProbe(UserRole.Admin)).toBe(true);
  });
});

describe('<Gate>', () => {
  it('renders children when role is satisfied', () => {
    useUserMock.mockReturnValue({
      user: { id: '1', email: 'a@b', name: 'A', role: 'editor' },
    });

    render(
      <Gate role={UserRole.Editor} fallback={<span>blocked</span>}>
        <span>allowed</span>
      </Gate>,
    );

    expect(screen.getByText('allowed')).toBeInTheDocument();
    expect(screen.queryByText('blocked')).not.toBeInTheDocument();
  });

  it('renders fallback when role is not satisfied', () => {
    useUserMock.mockReturnValue({
      user: { id: '1', email: 'a@b', name: 'A', role: 'reader' },
    });

    render(
      <Gate role={UserRole.Editor} fallback={<span>blocked</span>}>
        <span>allowed</span>
      </Gate>,
    );

    expect(screen.queryByText('allowed')).not.toBeInTheDocument();
    expect(screen.getByText('blocked')).toBeInTheDocument();
  });

  it('renders nothing when no fallback is provided and role is not satisfied', () => {
    useUserMock.mockReturnValue({
      user: { id: '1', email: 'a@b', name: 'A', role: 'reader' },
    });

    const { container } = render(
      <Gate role={UserRole.Admin}>
        <span>allowed</span>
      </Gate>,
    );

    expect(screen.queryByText('allowed')).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });
});
