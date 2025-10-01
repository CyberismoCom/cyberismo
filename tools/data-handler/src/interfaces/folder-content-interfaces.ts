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

import type { Schema } from 'jsonschema';

// All file mappings for lookup (filename -> property name)
export const ALL_FILE_MAPPINGS = {
  'index.adoc.hbs': 'contentTemplate',
  'query.lp.hbs': 'queryTemplate',
  'parameterSchema.json': 'schema',
  'model.lp': 'model',
  'view.lp.hbs': 'viewTemplate',
} as const;

// Reverse mappings from property names to filenames
export const REVERSE_FILE_MAPPINGS = {
  contentTemplate: 'index.adoc.hbs',
  queryTemplate: 'query.lp.hbs',
  schema: 'parameterSchema.json',
  model: 'model.lp',
  viewTemplate: 'view.lp.hbs',
} as const;

// Content interface for Graph Model resources
export interface GraphModelContent {
  model?: string;
}

// Content interface for Graph View resources
export interface GraphViewContent {
  viewTemplate?: string;
}

// Content interface for Report resources
export interface ReportContent {
  contentTemplate: string;
  queryTemplate: string;
  schema?: Schema;
}

/**
 * Get filename with property name
 * @param propertyName Property name.
 * @returns filename that matches property name
 */
export function filename(propertyName: string): string | undefined {
  return REVERSE_FILE_MAPPINGS[
    propertyName as keyof typeof REVERSE_FILE_MAPPINGS
  ];
}

/**
 * Get property name for a filename
 * @param filename Filename.
 * @returns property name that matches filename
 */
export function propertyName(filename: string): string | undefined {
  return ALL_FILE_MAPPINGS[filename as keyof typeof ALL_FILE_MAPPINGS];
}
