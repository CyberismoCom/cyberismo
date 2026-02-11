import { describe, it, expect } from 'vitest';
import { MockAuthProvider } from '../../src/auth/mock.js';
import { UserRole } from '../../src/types.js';

describe('MockAuthProvider', () => {
  it('returns default admin user', async () => {
    const provider = new MockAuthProvider();
    const user = await provider.authenticate(
      new Request('http://localhost/api/test'),
    );

    expect(user).toEqual({
      id: 'mock-user',
      email: 'admin@cyberismo.local',
      name: 'Local Admin',
      role: UserRole.Admin,
    });
  });

  it('respects custom name and email config', async () => {
    const provider = new MockAuthProvider({
      name: 'Custom User',
      email: 'custom@example.com',
    });
    const user = await provider.authenticate(
      new Request('http://localhost/api/test'),
    );

    expect(user).toEqual({
      id: 'mock-user',
      email: 'custom@example.com',
      name: 'Custom User',
      role: UserRole.Admin,
    });
  });

  it('always returns Admin role', async () => {
    const provider = new MockAuthProvider({ name: 'Test' });
    const user = await provider.authenticate(
      new Request('http://localhost/api/test'),
    );

    expect(user!.role).toBe(UserRole.Admin);
  });

  it('works with undefined config', async () => {
    const provider = new MockAuthProvider(undefined);
    const user = await provider.authenticate(
      new Request('http://localhost/api/test'),
    );

    expect(user).not.toBeNull();
    expect(user!.id).toBe('mock-user');
  });
});
