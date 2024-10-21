/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { Schema } from 'jsonschema';

// @todo: consider splitting this to several smaller files.

// Single card; either in project or in template.
export interface Card {
  key: string;
  path: string;
  content?: string;
  metadata?: CardMetadata;
  parent?: string;
  children?: Card[];
  attachments?: CardAttachment[];
}

// Attachment details
export interface CardAttachment {
  card: string;
  path: string;
  fileName: string;
  mimeType: string | null;
}

// When cards are listed using 'show cards'
export interface CardListContainer {
  name: string;
  type: string;
  cards: string[];
}

// Card type content.
export interface CardType {
  name: string;
  workflow: string;
  customFields?: CustomField[];
  alwaysVisibleFields?: string[];
  optionallyVisibleFields?: string[];
}

// Card's index.json file content.
export interface CardMetadata {
  title: string;
  cardType: string;
  workflowState: string;
  rank: string;
  lastTransitioned?: string;
  lastUpdated?: string;
  links?: Link[];
  [key: string]: MetadataContent;
}

// Content in project (apart from cards) is either .schema files or cardsConfig.json.
type ContentType = DotSchemaContent | ProjectSettings;

// Single CSV row as read from a file.
export type CSVRowRaw = {
  [key: string]: string;
};

// Custom field
export interface CustomField {
  name: string;
  description?: string;
  displayName?: string;
  isEditable: boolean;
}

// Supported data types.
export type DataType =
  | 'shortText'
  | 'longText'
  | 'enum'
  | 'date'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'enum'
  | 'list'
  | 'date'
  | 'dateTime'
  | 'person';

export interface DotSchemaItem {
  id: string;
  version: number;
  file?: string;
}
export type DotSchemaContent = DotSchemaItem[];

// Custom field enum value
export interface EnumDefinition {
  enumValue: string;
  enumDisplayValue: string;
  enumDescription: string;
}

// Defines which details of a card are fetched.
export interface FetchCardDetails {
  attachments?: boolean;
  calculations?: true;
  children?: boolean;
  content?: boolean;
  contentType?: string; // 'adoc', 'html'
  metadata?: boolean;
  parent?: boolean;
}

// FieldType content.
export interface FieldTypeDefinition {
  name: string;
  displayName?: string;
  fieldDescription?: string;
  dataType: DataType;
  enumValues?: Array<EnumDefinition>;
}

// Link content.
export interface Link {
  linkType: string;
  cardKey: string;
  linkDescription?: string;
}

// Link type content.
export interface LinkType {
  name: string;
  outboundDisplayName: string;
  inboundDisplayName: string;
  sourceCardTypes: string[];
  destinationCardTypes: string[];
  enableLinkDescription: boolean;
}

// Metadata content type.
export type MetadataContent =
  | number
  | boolean
  | string
  | string[]
  | Link[]
  | null
  | undefined;

// Module content
export interface ModuleSettings extends ProjectSettings {
  path: string;
  calculations: string[];
  cardTypes: string[];
  fieldTypes: string[];
  linkTypes: string[];
  reports: string[];
  templates: string[];
  workflows: string[];
}

// Files in project in addition to cards (.schema files and cardsConfig.json).
export interface ProjectFile {
  content: ContentType;
  path: string;
  name: string;
}

// Project's settings (=cardsConfig.json).
export interface ProjectSettings {
  cardKeyPrefix: string;
  name: string;
}

// Project metadata details. @todo - this overlaps the above; check & merge
export interface ProjectMetadata {
  name: string;
  path: string;
  prefix: string;
  numberOfCards: number;
}

// Project resource, such as workflow, template or card type as file system object.
export interface Resource {
  name: string;
  path?: string;
}

// Resources that have own folders.
export type ResourceFolderType =
  | 'calculation'
  | 'cardType'
  | 'fieldType'
  | 'linkType'
  | 'module'
  | 'report'
  | 'template'
  | 'workflow';

// Resources that are possible to remove.
// todo: add possibility to remove calculations, card types, field types, workflows and reports
export type RemovableResourceTypes =
  | 'attachment'
  | 'card'
  | 'link'
  | 'linkType'
  | 'module'
  | 'template';

// All resource types; both singular and plural.
export type ResourceTypes =
  | RemovableResourceTypes
  | 'attachments'
  | 'calculation'
  | 'calculations'
  | 'cards'
  | 'cardType'
  | 'cardTypes'
  | 'fieldType'
  | 'fieldTypes'
  | 'links'
  | 'linkTypes'
  | 'modules'
  | 'project'
  | 'projects'
  | 'report'
  | 'reports'
  | 'templates'
  | 'workflow'
  | 'workflows';

// Template configuration details.
export interface Template {
  name: string;
  path: string;
  numberOfCards: number;
  metadata: TemplateMetadata;
}

// Template configuration content details.
export interface TemplateMetadata {
  displayName?: string;
  description?: string;
  category?: string;
}

// Workflow state categories.
export enum WorkflowCategory {
  initial = 'initial',
  active = 'active',
  closed = 'closed',
}

// Workflow's json file content.
export interface WorkflowMetadata {
  name: string;
  states: WorkflowState[];
  transitions: WorkflowTransition[];
}

// Workflow state.
export interface WorkflowState {
  name: string;
  category?: WorkflowCategory;
}

// Workflow transition.
export interface WorkflowTransition {
  name: string;
  fromState: string[];
  toState: string;
  requiredCardFields?: string[];
}

export interface ReportMetadata {
  displayName: string;
  description: string;
  category: string;
}

export interface Report {
  metadata: ReportMetadata;
  contentTemplate: string;
  queryTemplate: string;
  schema?: Schema;
}

// Name for a card (consists of prefix and a random 8-character base36 string; e.g. 'test_abcd1234')
export const CardNameRegEx = new RegExp(/^[a-z]+_[0-9a-z]+$/);
