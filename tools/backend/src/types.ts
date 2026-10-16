// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { Context } from 'hono';

export interface ResourceFileContentResponse {
  content: string;
}

export interface ResourceValidationResponse {
  errors: string[];
}

export interface TreeOptions {
  recursive?: boolean;
  cardKey?: string;
}

/**
 * User roles - checked directly in middleware
 * Role hierarchy: Admin > Editor > Reader
 * - Admin: All operations including configuration
 * - Editor: Can create, edit, and manage content but not config
 * - Reader: Can only view content
 * Orthogonal role (outside hierarchy):
 * - Connector: Service accounts that can only create/update calculations
 */
export enum UserRole {
  Admin = 'admin',
  Editor = 'editor',
  Reader = 'reader',
  Connector = 'connector',
}

/**
 * User information returned by the /me endpoint
 */
export interface UserInfo {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

/**
 * Extended app variables including authentication info
 */
export interface AppVars {
  tree?: TreeOptions;
  user?: UserInfo;
}

export type AppContext = Context<{ Variables: AppVars }>;
