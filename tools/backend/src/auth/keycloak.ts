/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2025
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { JWTPayload } from 'jose';
import { UserRole } from '../types.js';
import type { UserInfo } from '../types.js';
import type { AuthProvider } from './types.js';

export interface KeycloakConfig {
  issuer: string;
  audience: string;
}

interface KeycloakJWTPayload extends JWTPayload {
  email?: string;
  name?: string;
  preferred_username?: string;
  realm_access?: {
    roles?: string[];
  };
}

export class KeycloakAuthProvider implements AuthProvider {
  private readonly issuer: string;
  private readonly audience: string;
  private jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

  constructor(config: KeycloakConfig) {
    this.issuer = config.issuer;
    this.audience = config.audience;
  }

  private getJWKS(): ReturnType<typeof createRemoteJWKSet> {
    if (!this.jwks) {
      const jwksUrl = new URL(
        `${this.issuer.replace(/\/$/, '')}/protocol/openid-connect/certs`,
      );
      this.jwks = createRemoteJWKSet(jwksUrl);
    }
    return this.jwks;
  }

  async authenticate(req: Request): Promise<UserInfo | null> {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return null;
    }

    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) {
      return null;
    }

    try {
      const jwks = this.getJWKS();
      const { payload } = await jwtVerify(token, jwks, {
        issuer: this.issuer,
        audience: this.audience,
      });

      const claims = payload as KeycloakJWTPayload;
      const role = this.mapRole(claims.realm_access?.roles);

      return {
        id: claims.sub ?? 'unknown',
        email: claims.email ?? '',
        name: claims.name ?? claims.preferred_username ?? 'Unknown',
        role,
      };
    } catch {
      // TODO: add proper logging
      return null;
    }
  }

  private mapRole(roles?: string[]): UserRole {
    if (!roles) {
      return UserRole.Reader;
    }
    if (roles.includes('admin')) {
      return UserRole.Admin;
    }
    if (roles.includes('editor')) {
      return UserRole.Editor;
    }
    return UserRole.Reader;
  }
}
