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

export type { Schema };

// All file mappings for lookup (filename -> property name)
export const ALL_FILE_MAPPINGS = {
  'calculation.lp': 'calculation',
  'index.adoc.hbs': 'contentTemplate',
  'model.lp': 'model',
  'parameterSchema.json': 'schema',
  'query.lp.hbs': 'queryTemplate',
  'view.lp.hbs': 'viewTemplate',
} as const;

// Reverse mappings from property names to filenames
export const CONTENT_FILES = {
  calculation: 'calculation.lp',
  contentTemplate: 'index.adoc.hbs',
  model: 'model.lp',
  queryTemplate: 'query.lp.hbs',
  schema: 'parameterSchema.json',
  viewTemplate: 'view.lp.hbs',
} as const;

// Union type of all valid content property names
export type ContentPropertyName = keyof typeof CONTENT_FILES;

// Content interface for Calculation resources
export interface CalculationContent {
  calculation: string;
}

// Content interface for Graph Model resources
export interface GraphModelContent {
  model: string;
}

// Content interface for Graph View resources
export interface GraphViewContent {
  viewTemplate?: string;
  schema?: Schema;
}

// Content interface for Report resources
export interface ReportContent {
  contentTemplate: string;
  queryTemplate: string;
  schema?: Schema;
}

export type FolderResourceContent =
  | CalculationContent
  | GraphModelContent
  | GraphViewContent
  | ReportContent;

/**
 * Get filename with property name
 * @param propertyName Property name.
 * @returns filename that matches property name
 */
export function filename(propertyName: string): string | undefined {
  return CONTENT_FILES[propertyName as keyof typeof CONTENT_FILES];
}

/**
 * Get property name for a filename
 * @param filename Filename.
 * @returns property name that matches filename
 */
export function contentPropertyName(
  filename: string,
): ContentPropertyName | undefined {
  return ALL_FILE_MAPPINGS[filename as keyof typeof ALL_FILE_MAPPINGS];
}
