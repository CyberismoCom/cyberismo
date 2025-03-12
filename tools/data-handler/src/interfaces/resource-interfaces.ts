/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { Schema } from 'jsonschema';

/**
 * Each resource represents a file (or a folder in some cases) with metadata stored
 * in JSON file. Name of the file is the name of the resource. Each resource is expected to be
 * in a correct place in folder structure.
 */

// Calculation does not have own metadata.
export type CalculationMetadata = ResourceBaseMetadata;

// Card type content.
export interface CardType extends ResourceBaseMetadata {
  workflow: string;
  customFields: CustomField[];
  alwaysVisibleFields: string[];
  optionallyVisibleFields: string[];
}

// Custom field
export interface CustomField {
  name: string;
  description?: string;
  displayName?: string;
  isCalculated: boolean;
}

// Supported data types.
export type DataType =
  | 'shortText'
  | 'longText'
  | 'enum'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'list'
  | 'date'
  | 'dateTime'
  | 'person';

// Custom field enum value
export interface EnumDefinition {
  enumValue: string;
  enumDisplayValue?: string;
  enumDescription?: string;
}

// Field type content.
export interface FieldType extends ResourceBaseMetadata {
  displayName?: string;
  fieldDescription?: string;
  dataType: DataType;
  enumValues?: Array<EnumDefinition>;
}

// File-based resources metadata content.
export type ResourceContent =
  | CardType
  | FieldType
  | LinkType
  | ReportMetadata
  | TemplateMetadata
  | Workflow;

// Link content.
export interface Link {
  linkType: string;
  cardKey: string;
  linkDescription?: string;
}

// Link type resource.
export interface LinkType extends ResourceBaseMetadata {
  outboundDisplayName: string;
  inboundDisplayName: string;
  sourceCardTypes: string[];
  destinationCardTypes: string[];
  enableLinkDescription: boolean;
}

// Report resource.
export interface Report {
  name: string;
  metadata: ReportMetadata;
  contentTemplate: string;
  queryTemplate: string;
  schema?: Schema;
}

// Metadata for report
export interface ReportMetadata extends ResourceBaseMetadata {
  displayName: string;
  description: string;
  category: string;
}

// Base interface for all resources.
export interface ResourceBaseMetadata {
  name: string;
  usedIn?: string[];
}

// Template configuration details.
export interface TemplateConfiguration {
  name: string;
  path: string;
  numberOfCards: number;
  metadata: TemplateMetadata;
}

// Template configuration content details.
export interface TemplateMetadata extends ResourceBaseMetadata {
  displayName?: string;
  description?: string;
  category?: string;
}

// Workflow's json file content.
export interface Workflow extends ResourceBaseMetadata {
  states: WorkflowState[];
  transitions: WorkflowTransition[];
}

// Workflow state categories.
export enum WorkflowCategory {
  initial = 'initial',
  active = 'active',
  closed = 'closed',
  none = 'none',
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
}
