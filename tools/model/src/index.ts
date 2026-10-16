// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

// Browser-safe shared types. Nothing here may import Node built-ins.
export * from './interfaces/actor.js';
export * from './interfaces/change-event.js';
export * from './interfaces/clean.js';
export * from './interfaces/directory.js';
export * from './interfaces/errors.js';
export * from './interfaces/folder-content-interfaces.js';
export * from './interfaces/macros.js';
export * from './interfaces/mutation-input.js';
export * from './interfaces/operations.js';
export * from './interfaces/project-interfaces.js';
export * from './interfaces/resource-interfaces.js';
export * from './interfaces/resource-name.js';
export * from './interfaces/verbs.js';
export * from './interfaces/version-source.js';
export * from './macros/common.js';
export * from './macros/types.js';
export * from './project-errors.js';
export * from './types/queries.js';

// resource-interfaces and queries both declare EnumDefinition. The root
// exports the field-type one; the query result's is under './types/queries'.
export type { EnumDefinition } from './interfaces/resource-interfaces.js';
