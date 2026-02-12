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
 * Permissions for authorization
 * Each permission represents a specific action that can be performed
 */
export enum Permission {
  // Card operations
  CardRead = 'card:read',
  CardCreate = 'card:create',
  CardUpdate = 'card:update',
  CardDelete = 'card:delete',

  // Resource operations
  CardTypeRead = 'cardType:read',
  CardTypeCreate = 'cardType:create',
  CardTypeUpdate = 'cardType:update',
  CardTypeDelete = 'cardType:delete',

  WorkflowRead = 'workflow:read',
  WorkflowCreate = 'workflow:create',
  WorkflowUpdate = 'workflow:update',
  WorkflowDelete = 'workflow:delete',

  FieldTypeRead = 'fieldType:read',
  FieldTypeCreate = 'fieldType:create',
  FieldTypeUpdate = 'fieldType:update',
  FieldTypeDelete = 'fieldType:delete',

  LinkTypeRead = 'linkType:read',
  LinkTypeCreate = 'linkType:create',
  LinkTypeUpdate = 'linkType:update',
  LinkTypeDelete = 'linkType:delete',

  TemplateRead = 'template:read',
  TemplateCreate = 'template:create',
  TemplateUpdate = 'template:update',
  TemplateDelete = 'template:delete',

  ReportRead = 'report:read',
  ReportCreate = 'report:create',
  ReportUpdate = 'report:update',
  ReportDelete = 'report:delete',

  GraphModelRead = 'graphModel:read',
  GraphModelCreate = 'graphModel:create',
  GraphModelUpdate = 'graphModel:update',
  GraphModelDelete = 'graphModel:delete',

  GraphViewRead = 'graphView:read',
  GraphViewCreate = 'graphView:create',
  GraphViewUpdate = 'graphView:update',
  GraphViewDelete = 'graphView:delete',

  // Project operations
  ProjectRead = 'project:read',
  ProjectUpdate = 'project:update',
  ProjectModuleManage = 'project:module:manage',

  // Logic and calculations
  LogicProgramRead = 'logicProgram:read',
  LogicProgramUpdate = 'logicProgram:update',
  CalculationExecute = 'calculation:execute',

  // Tree and labels
  TreeRead = 'tree:read',
  LabelRead = 'label:read',
  LabelManage = 'label:manage',
}

/**
 * User roles - each role maps to a set of permissions
 * - Admin: All permissions including configuration
 * - Editor: Can create, edit, and manage content but not config
 * - Reader: Can only view content
 */
export enum UserRole {
  Admin = 'admin',
  Editor = 'editor',
  Reader = 'reader',
}

/**
 * Map of roles to their permissions
 */
export const RolePermissions: Record<UserRole, Permission[]> = {
  [UserRole.Admin]: Object.values(Permission),
  [UserRole.Editor]: [
    // Card operations
    Permission.CardRead,
    Permission.CardCreate,
    Permission.CardUpdate,
    Permission.CardDelete,
    // Read-only access to resource types
    Permission.CardTypeRead,
    Permission.WorkflowRead,
    Permission.FieldTypeRead,
    Permission.LinkTypeRead,
    Permission.TemplateRead,
    Permission.ReportRead,
    Permission.GraphModelRead,
    Permission.GraphViewRead,
    // Project read
    Permission.ProjectRead,
    // Logic and calculations
    Permission.LogicProgramRead,
    Permission.CalculationExecute,
    // Tree and labels
    Permission.TreeRead,
    Permission.LabelRead,
    Permission.LabelManage,
  ],
  [UserRole.Reader]: [
    // Read-only access
    Permission.CardRead,
    Permission.CardTypeRead,
    Permission.WorkflowRead,
    Permission.FieldTypeRead,
    Permission.LinkTypeRead,
    Permission.TemplateRead,
    Permission.ReportRead,
    Permission.GraphModelRead,
    Permission.GraphViewRead,
    Permission.ProjectRead,
    Permission.LogicProgramRead,
    Permission.CalculationExecute,
    Permission.TreeRead,
    Permission.LabelRead,
  ],
};

/**
 * User information returned by the /me endpoint
 */
export interface UserInfo {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  permissions: Permission[];
}

/**
 * Extended app variables including authentication info
 */
export interface AppVars {
  tree?: TreeOptions;
  user?: UserInfo;
}

export type AppContext = Context<{ Variables: AppVars }>;
