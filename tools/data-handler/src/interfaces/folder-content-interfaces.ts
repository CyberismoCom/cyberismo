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

// File mappings for Report resources
export const REPORT_FILE_MAPPINGS = {
  'index.adoc.hbs': 'contentTemplate',
  'query.lp.hbs': 'queryTemplate',
  'parameterSchema.json': 'schema',
};

// File mappings for Graph Model resources
export const GRAPH_MODEL_FILE_MAPPINGS = {
  'model.lp': 'model',
};

// File mappings for Graph View resources
export const GRAPH_VIEW_FILE_MAPPINGS = {
  'view.lp.hbs': 'viewTemplate',
};

// All file mappings combined for lookup
export const ALL_FILE_MAPPINGS = {
  ...REPORT_FILE_MAPPINGS,
  ...GRAPH_MODEL_FILE_MAPPINGS,
  ...GRAPH_VIEW_FILE_MAPPINGS,
};

// Reverse mappings from property names to filenames
export const REVERSE_FILE_MAPPINGS = {
  contentTemplate: 'index.adoc.hbs',
  queryTemplate: 'query.lp.hbs',
  schema: 'parameterSchema.json',
  model: 'model.lp',
  viewTemplate: 'view.lp.hbs',
};

// Content interface for Report resources
export interface ReportContent {
  contentTemplate: string;
  queryTemplate: string;
  schema?: Schema;
}

// Content interface for Graph Model resources
export interface GraphModelContent {
  model?: string;
}

// Content interface for Graph View resources
export interface GraphViewContent {
  viewTemplate?: string;
}

// Check if a filename is a report file
export function isReportFile(
  filename: string,
): filename is keyof typeof REPORT_FILE_MAPPINGS {
  return filename in REPORT_FILE_MAPPINGS;
}

// Check if a filename is a graph model file
export function isGraphModelFile(
  filename: string,
): filename is keyof typeof GRAPH_MODEL_FILE_MAPPINGS {
  return filename in GRAPH_MODEL_FILE_MAPPINGS;
}

// Check if a filename is a graph view file
export function isGraphViewFile(
  filename: string,
): filename is keyof typeof GRAPH_VIEW_FILE_MAPPINGS {
  return filename in GRAPH_VIEW_FILE_MAPPINGS;
}

// Get property name for a filename
export function propertyName(filename: string): string | undefined {
  return ALL_FILE_MAPPINGS[filename as keyof typeof ALL_FILE_MAPPINGS];
}

// Get filename with property name
export function filename(propertyName: string): string | undefined {
  return REVERSE_FILE_MAPPINGS[
    propertyName as keyof typeof REVERSE_FILE_MAPPINGS
  ];
}
