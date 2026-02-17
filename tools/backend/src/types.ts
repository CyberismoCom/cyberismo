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
 */
export enum UserRole {
  Admin = 'admin',
  Editor = 'editor',
  Reader = 'reader',
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
