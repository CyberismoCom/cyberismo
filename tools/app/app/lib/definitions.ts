/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import {
  cardtype,
  workflowCategory,
} from '@cyberismocom/data-handler/interfaces/project-interfaces';

export interface Project {
  name: string;
  cards: Card[];
  workflows: Workflow[];
  cardTypes: cardtype[];
}

// Single card with metadata and children, but no content.
// Used in displaying the tree menu view.
export interface Card {
  key: string;
  path: string;
  metadata?: CardMetadata;
  children?: Card[];
}

//
export interface CardView {
  key: string;
  children: string[];
  timestamp: string;
}

// Single card with content and metadata, but no info of children.
// Used for displaying card details view.
export interface CardDetails {
  key: string;
  path: string;
  content?: string;
  metadata?: CardMetadata;
  attachments?: CardAttachment[];
}

export type CardMetadata = {
  summary: string;
  workflowState: string;
  cardtype: string;
} & Record<string, MetadataValue>;

export type MetadataValue = string | number | boolean | Date | string[] | null;

export interface CardAttachment {
  card: string;
  fileName: string;
  path: string;
}

export enum CardMode {
  VIEW,
  EDIT,
}

export interface Workflow {
  name: string;
  states: WorkflowState[];
  transitions: WorkflowTransition[];
}

export interface WorkflowState {
  name: string;
  category?: workflowCategory;
}

export interface WorkflowTransition {
  name: string;
  fromState: string[];
  toState: string;
}

export interface customField {
  name: string;
  displayName: string;
  isEditable: boolean;
}

export type FieldTypes = Array<FieldTypeDefinition>;

export type FieldTypeKey = string;

export type DataType =
  | 'shorttext'
  | 'longtext'
  | 'enum'
  | 'date'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'enum'
  | 'list'
  | 'date'
  | 'datetime'
  | 'person';

export type EnumDefinition = {
  enumValue: string;
  enumDisplayValue: string;
  enumDescription?: string;
};

export interface FieldTypeDefinition {
  name: string;
  displayName?: string;
  fieldDescription?: string;
  dataType: DataType;
  enumValues?: Array<EnumDefinition>;
}

export interface Attachment {
  type: 'image' | 'file';
  fileName: string;
  data: Blob;
  image?: string;
}
