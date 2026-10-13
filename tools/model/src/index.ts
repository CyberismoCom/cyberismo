/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2026

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

// Browser-safe shared types. Nothing here may import Node built-ins.
export * from './interfaces/clean.js';
export * from './interfaces/folder-content-interfaces.js';
export * from './interfaces/macros.js';
export * from './interfaces/operations.js';
export * from './interfaces/project-interfaces.js';
export * from './interfaces/resource-interfaces.js';
export * from './interfaces/version-source.js';
export * from './macros/common.js';
export * from './macros/types.js';
export * from './project-errors.js';
export * from './types/queries.js';

// resource-interfaces and queries both declare EnumDefinition. The root
// exports the field-type one; the query result's is under './types/queries'.
export type { EnumDefinition } from './interfaces/resource-interfaces.js';
