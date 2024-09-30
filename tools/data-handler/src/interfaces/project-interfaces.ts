/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

// @todo: consider splitting this to several smaller files.

// Content in project files is either .schema, or project setting file.
// Interfaces are mainly symmetrical, optional members for values that are not needed.
export interface dotSchemaContent {
  id: string;
  version: number;
  cardkeyPrefix?: never;
  name?: never;
}

// Project's settings (=cardsconfig.json).
export interface projectSettings {
  id?: never;
  version?: never;
  cardkeyPrefix: string;
  name: string;
}

// Module content
export interface moduleSettings extends projectSettings {
  path: string;
  cardtypes: string[];
  calculations: string[];
  fieldtypes: string[];
  linktypes: string[];
  templates: string[];
  workflows: string[];
}

// Content in project (apart from cards) is either .schema files or cardsconfig.json.
type contentType = dotSchemaContent | projectSettings;

// Files in project in addition to cards (.schema files and cardsconfig.json).
export interface projectFile {
  content: contentType;
  path: string;
  name: string;
}

// One card; either in project or in template.
export interface card {
  key: string;
  path: string;
  content?: string;
  metadata?: cardMetadata;
  parent?: string;
  children?: card[];
  attachments?: attachmentDetails[];
}

// When cards are listed using 'show cards'
export interface cardListContainer {
  name: string;
  type: string;
  cards: string[];
}

// Cardtype content.
export interface cardtype {
  name: string;
  workflow: string;
  customFields?: customField[];
  alwaysVisibleFields?: string[];
  optionallyVisibleFields?: string[];
}

// Card's index.json file content.
export interface cardMetadata {
  title: string;
  cardtype: string;
  workflowState: string;
  rank: string;
  lastTransitioned?: string;
  lastUpdated?: string;
  links?: link[];
  [key: string]: metadataContent;
}

// Link content.
export interface link {
  linkType: string;
  cardKey: string;
  linkDescription?: string;
}

// FieldType content.
export interface fieldtype {
  name: string;
  displayName?: string;
  fieldDescription?: string;
  dataType: string;
  enumValues?: enumValue[];
}

export interface linktype {
  name: string;
  outboundDisplayName: string;
  inboundDisplayName: string;
  sourceCardTypes: string[];
  destinationCardTypes: string[];
  enableLinkDescription: boolean;
}

// Project metadata details.
export interface project {
  name: string;
  path: string;
  prefix: string;
  numberOfCards: number;
}

// Project resource, such as workflow, template or cardtype
export interface resource {
  name: string;
  path?: string;
}

// Template content.
export interface templateContent {
  name: string;
  cards?: card[];
}

// Template configuration details.
export interface template {
  name: string;
  path: string;
  project: string;
  numberOfCards: number;
  metadata: templateMetadata;
}

// Template configuration content details.
export interface templateMetadata {
  displayName?: string;
  description?: string;
  category?: string;
}

// Workflow's json file content.
export interface workflowMetadata {
  name: string;
  states: workflowState[];
  transitions: workflowTransition[];
}

// Workflow state categories.
export enum workflowCategory {
  initial = 'initial',
  active = 'active',
  closed = 'closed',
}

// Workflow state.
export interface workflowState {
  name: string;
  category?: workflowCategory;
}

// Workflow transition.
export interface workflowTransition {
  name: string;
  fromState: string[];
  toState: string;
  requiredCardFields?: string[];
}

// Custom field enum value
export interface enumValue {
  enumValue: string;
  enumDisplayValue: string;
  enumDescription: string;
}

// Custom field
export interface customField {
  name: string;
  description?: string;
  displayName?: string;
  isEditable: boolean;
}

// Attachment details
export interface attachmentDetails {
  card: string;
  path: string;
  fileName: string;
  mimeType: string | null;
}

// Name for a card (consists of prefix and a random 8-character base36 string; e.g. 'test_abcd1234')
export const cardNameRegEx = new RegExp(/^[a-z]+_[0-9a-z]+$/);

// Define which details of a card are fetched.
export interface fetchCardDetails {
  attachments?: boolean;
  calculations?: true;
  children?: boolean;
  content?: boolean;
  contentType?: string; // 'adoc', 'html'
  metadata?: boolean;
  parent?: boolean;
}

export type metadataContent =
  | number
  | boolean
  | string
  | string[]
  | link[]
  | null
  | undefined;

export type csvRowRaw = {
  [key: string]: string;
};

export interface importCsvRow {
  title: string;
  template: string;
  description?: string;
  labels?: string[];
  [key: string]: string | string[] | undefined; // Custom fields
}
