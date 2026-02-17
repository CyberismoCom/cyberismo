import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { JWTVerifyResult } from 'jose';

const { mockCreateRemoteJWKSet, mockJwtVerify } = vi.hoisted(() => ({
  mockCreateRemoteJWKSet: vi.fn().mockReturnValue('mock-jwks'),
  mockJwtVerify: vi.fn(),
}));

vi.mock('jose', () => ({
  createRemoteJWKSet: mockCreateRemoteJWKSet,
  jwtVerify: mockJwtVerify,
}));

import { KeycloakAuthProvider } from '../../src/auth/keycloak.js';
import { UserRole } from '../../src/types.js';

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/test', { headers });
}

function mockVerifyResult(
  payload: Record<string, unknown>,
): JWTVerifyResult & { payload: Record<string, unknown> } {
  return {
    payload,
    protectedHeader: { alg: 'RS256' },
  };
}

describe('KeycloakAuthProvider', () => {
  const config = {
    issuer: 'https://keycloak.example.com/realms/test',
    audience: 'my-app',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('header handling', () => {
    it('returns null when no Authorization header', async () => {
      const provider = new KeycloakAuthProvider(config);
      expect(await provider.authenticate(makeRequest())).toBeNull();
    });

    it('returns null for empty token after Bearer', async () => {
      const provider = new KeycloakAuthProvider(config);
      // "Bearer " with nothing after gets replaced to empty string
      expect(
        await provider.authenticate(makeRequest({ authorization: 'Bearer ' })),
      ).toBeNull();
    });

    it('extracts token from Bearer header (case-insensitive)', async () => {
      const provider = new KeycloakAuthProvider(config);
      mockJwtVerify.mockResolvedValue(
        mockVerifyResult({ sub: 'u1', email: 'a@b.c', name: 'Test' }),
      );

      await provider.authenticate(
        makeRequest({ authorization: 'bearer my-token' }),
      );

      expect(mockJwtVerify).toHaveBeenCalledWith(
        'my-token',
        'mock-jwks',
        expect.objectContaining({
          issuer: config.issuer,
          audience: config.audience,
        }),
      );
    });
  });

  describe('JWKS', () => {
    it('constructs correct JWKS URL', async () => {
      const provider = new KeycloakAuthProvider(config);
      mockJwtVerify.mockResolvedValue(mockVerifyResult({ sub: 'u1', email: 'a@b.c', realm_access: { roles: ['reader'] } }));

      await provider.authenticate(makeRequest({ authorization: 'Bearer tok' }));

      expect(mockCreateRemoteJWKSet).toHaveBeenCalledWith(
        new URL(
          'https://keycloak.example.com/realms/test/protocol/openid-connect/certs',
        ),
      );
    });

    it('strips trailing slash from issuer', async () => {
      const provider = new KeycloakAuthProvider({
        ...config,
        issuer: 'https://keycloak.example.com/realms/test/',
      });
      mockJwtVerify.mockResolvedValue(mockVerifyResult({ sub: 'u1', email: 'a@b.c', realm_access: { roles: ['reader'] } }));

      await provider.authenticate(makeRequest({ authorization: 'Bearer tok' }));

      expect(mockCreateRemoteJWKSet).toHaveBeenCalledWith(
        new URL(
          'https://keycloak.example.com/realms/test/protocol/openid-connect/certs',
        ),
      );
    });

    it('caches JWKS instance across calls', async () => {
      const provider = new KeycloakAuthProvider(config);
      mockJwtVerify.mockResolvedValue(mockVerifyResult({ sub: 'u1', email: 'a@b.c', realm_access: { roles: ['reader'] } }));

      await provider.authenticate(
        makeRequest({ authorization: 'Bearer tok1' }),
      );
      await provider.authenticate(
        makeRequest({ authorization: 'Bearer tok2' }),
      );

      expect(mockCreateRemoteJWKSet).toHaveBeenCalledTimes(1);
    });
  });

  describe('JWT verification', () => {
    it('passes correct issuer and audience to jwtVerify', async () => {
      const provider = new KeycloakAuthProvider(config);
      mockJwtVerify.mockResolvedValue(mockVerifyResult({ sub: 'u1', email: 'a@b.c', realm_access: { roles: ['reader'] } }));

      await provider.authenticate(makeRequest({ authorization: 'Bearer tok' }));

      expect(mockJwtVerify).toHaveBeenCalledWith('tok', 'mock-jwks', {
        issuer: config.issuer,
        audience: config.audience,
      });
    });

    it('returns null on verification failure', async () => {
      const provider = new KeycloakAuthProvider(config);
      mockJwtVerify.mockRejectedValue(new Error('invalid signature'));

      const result = await provider.authenticate(
        makeRequest({ authorization: 'Bearer bad-token' }),
      );

      expect(result).toBeNull();
    });
  });

  describe('claims extraction', () => {
    it('maps sub to id, errors if not found', async () => {
      const provider = new KeycloakAuthProvider(config);

      mockJwtVerify.mockResolvedValue(mockVerifyResult({ sub: 'user-123', email: 'a@b.c', realm_access: { roles: ['reader'] } }));
      let result = await provider.authenticate(
        makeRequest({ authorization: 'Bearer tok' }),
      );
      expect(result!.id).toBe('user-123');

      mockJwtVerify.mockResolvedValue(mockVerifyResult({}));
      result = await provider.authenticate(
        makeRequest({ authorization: 'Bearer tok' }),
      );
      expect(result).toBe(null);
    });

    it('maps email, errors if not found', async () => {
      const provider = new KeycloakAuthProvider(config);

      mockJwtVerify.mockResolvedValue(
        mockVerifyResult({ sub: 'u1', email: 'test@example.com', realm_access: { roles: ['reader'] } }),
      );
      let result = await provider.authenticate(
        makeRequest({ authorization: 'Bearer tok' }),
      );
      expect(result!.email).toBe('test@example.com');

      mockJwtVerify.mockResolvedValue(mockVerifyResult({ sub: 'u1' }));
      result = await provider.authenticate(
        makeRequest({ authorization: 'Bearer tok' }),
      );
      expect(result).toBe(null);
    });

    it('prefers name over preferred_username, falls back to "Unknown"', async () => {
      const provider = new KeycloakAuthProvider(config);

      mockJwtVerify.mockResolvedValue(
        mockVerifyResult({
          sub: 'u1',
          email: 'a@b.c',
          name: 'Full Name',
          preferred_username: 'username',
          realm_access: { roles: ['reader'] },
        }),
      );
      let result = await provider.authenticate(
        makeRequest({ authorization: 'Bearer tok' }),
      );
      expect(result!.name).toBe('Full Name');

      mockJwtVerify.mockResolvedValue(
        mockVerifyResult({ sub: 'u1', email: 'a@b.c', preferred_username: 'username', realm_access: { roles: ['reader'] } }),
      );
      result = await provider.authenticate(
        makeRequest({ authorization: 'Bearer tok' }),
      );
      expect(result!.name).toBe('username');

      mockJwtVerify.mockResolvedValue(mockVerifyResult({ sub: 'u1', email: 'a@b.c', realm_access: { roles: ['reader'] } }));
      result = await provider.authenticate(
        makeRequest({ authorization: 'Bearer tok' }),
      );
      expect(result!.name).toBe('Unknown');
    });
  });

  describe('role mapping', () => {
    it('maps admin role to Admin', async () => {
      const provider = new KeycloakAuthProvider(config);
      mockJwtVerify.mockResolvedValue(
        mockVerifyResult({
          sub: 'u1',
          email: 'a@b.c',
          realm_access: { roles: ['admin'] },
        }),
      );

      const result = await provider.authenticate(
        makeRequest({ authorization: 'Bearer tok' }),
      );
      expect(result!.role).toBe(UserRole.Admin);
    });

    it('maps editor role to Editor', async () => {
      const provider = new KeycloakAuthProvider(config);
      mockJwtVerify.mockResolvedValue(
        mockVerifyResult({
          sub: 'u1',
          email: 'a@b.c',
          realm_access: { roles: ['editor'] },
        }),
      );

      const result = await provider.authenticate(
        makeRequest({ authorization: 'Bearer tok' }),
      );
      expect(result!.role).toBe(UserRole.Editor);
    });

    it('maps reader role to Reader', async () => {
      const provider = new KeycloakAuthProvider(config);
      mockJwtVerify.mockResolvedValue(
        mockVerifyResult({
          sub: 'u1',
          email: 'a@b.c',
          realm_access: { roles: ['reader'] },
        }),
      );

      const result = await provider.authenticate(
        makeRequest({ authorization: 'Bearer tok' }),
      );
      expect(result!.role).toBe(UserRole.Reader);
    });

    it('errors for no roles', async () => {
      const provider = new KeycloakAuthProvider(config);
      mockJwtVerify.mockResolvedValue(mockVerifyResult({ sub: 'u1', email: 'a@b.c' }));

      const result = await provider.authenticate(
        makeRequest({ authorization: 'Bearer tok' }),
      );
      expect(result).toBeNull();
    });

    it('errors for unknown roles', async () => {
      const provider = new KeycloakAuthProvider(config);
      mockJwtVerify.mockResolvedValue(
        mockVerifyResult({
          sub: 'u1',
          email: 'a@b.c',
          realm_access: { roles: ['viewer'] },
        }),
      );

      const result = await provider.authenticate(
        makeRequest({ authorization: 'Bearer tok' }),
      );
      expect(result).toBeNull();
    });

    it('admin takes priority over editor', async () => {
      const provider = new KeycloakAuthProvider(config);
      mockJwtVerify.mockResolvedValue(
        mockVerifyResult({
          sub: 'u1',
          email: 'a@b.c',
          realm_access: { roles: ['editor', 'admin'] },
        }),
      );

      const result = await provider.authenticate(
        makeRequest({ authorization: 'Bearer tok' }),
      );
      expect(result!.role).toBe(UserRole.Admin);
    });

    it('roles are case-sensitive', async () => {
      const provider = new KeycloakAuthProvider(config);
      mockJwtVerify.mockResolvedValue(
        mockVerifyResult({
          sub: 'u1',
          email: 'a@b.c',
          realm_access: { roles: ['Admin', 'EDITOR'] },
        }),
      );

      const result = await provider.authenticate(
        makeRequest({ authorization: 'Bearer tok' }),
      );
      expect(result).toBeNull();
    });
  });
});
