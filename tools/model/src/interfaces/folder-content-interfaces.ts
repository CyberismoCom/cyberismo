// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

// A JSON schema, as read from a resource's parameterSchema.json.
export type JsonSchema = { [key: string]: unknown };

// All file mappings for lookup (filename -> property name)
export const ALL_FILE_MAPPINGS = {
  'calculation.lp': 'calculation',
  'index.adoc.hbs': 'contentTemplate',
  'model.lp': 'model',
  'parameterSchema.json': 'schema',
  'query.lp': 'skillQuery',
  'query.lp.hbs': 'queryTemplate',
  'skill.md': 'skillContent',
  'view.lp.hbs': 'viewTemplate',
} as const;

// Reverse mappings from property names to filenames
export const CONTENT_FILES = {
  calculation: 'calculation.lp',
  contentTemplate: 'index.adoc.hbs',
  model: 'model.lp',
  queryTemplate: 'query.lp.hbs',
  schema: 'parameterSchema.json',
  skillContent: 'skill.md',
  skillQuery: 'query.lp',
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
  schema?: JsonSchema;
}

// Content interface for Report resources
export interface ReportContent {
  contentTemplate: string;
  queryTemplate: string;
  schema?: JsonSchema;
}

// Content interface for Skill resources
export interface SkillContent {
  skillContent: string;
  skillQuery: string;
}

export type FolderResourceContent =
  | CalculationContent
  | GraphModelContent
  | GraphViewContent
  | ReportContent
  | SkillContent;

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
