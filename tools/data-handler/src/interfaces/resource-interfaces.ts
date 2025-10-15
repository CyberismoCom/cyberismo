/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2024
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import type {
  CalculationContent,
  GraphModelContent,
  GraphViewContent,
  ReportContent,
} from './folder-content-interfaces.js';

/**
 * Each resource represents a file (or a folder in some cases) with metadata stored
 * in JSON file. Name of the file is the name of the resource. Each resource is expected to be
 * in a correct place in folder structure.
 */

// Calculation metadata.
export interface CalculationMetadata extends ResourceBaseMetadata {
  calculation: string;
}
export interface Calculation extends CalculationMetadata {
  content: CalculationContent;
}
export type CalculationContentPropertyName = 'calculation';
export interface CalculationContentUpdateKey {
  key: 'content';
  subKey: CalculationContentPropertyName;
}
export type CalculationUpdateKey = string | CalculationContentUpdateKey;

// Card type content.
export interface CardType extends ResourceBaseMetadata {
  workflow: string;
  customFields: CustomField[];
  alwaysVisibleFields: string[];
  optionallyVisibleFields: string[];
}

// Base content update key interface
export interface ContentUpdateKey {
  key: 'content';
  subKey: string; // Resource-specific types should narrow this
}

// Custom field
// todo: merge with FieldType.
export interface CustomField {
  name: string;
  description?: string;
  displayName?: string;
  isCalculated: boolean;
}

// Supported data types.
export type DataType =
  | 'boolean'
  | 'date'
  | 'dateTime'
  | 'enum'
  | 'integer'
  | 'list'
  | 'longText'
  | 'number'
  | 'person'
  | 'shortText';

// Custom field enum value
export interface EnumDefinition {
  enumValue: string;
  enumDisplayValue?: string;
  enumDescription?: string;
}

// Field type content.
export interface FieldType extends ResourceBaseMetadata {
  dataType: DataType;
  enumValues?: Array<EnumDefinition>;
}

// Graph model content.
export interface GraphModelMetadata extends ResourceBaseMetadata {
  category?: string;
}
export interface GraphModel extends GraphModelMetadata {
  content: GraphModelContent;
}
export type GraphModelContentPropertyName = 'model';
export interface GraphModelContentUpdateKey {
  key: 'content';
  subKey: GraphModelContentPropertyName;
}
export type GraphModelUpdateKey = string | GraphModelContentUpdateKey;

// Graph view content.
export interface GraphViewMetadata extends ResourceBaseMetadata {
  category?: string;
}
export type GraphViewContentPropertyName = 'viewTemplate';
export interface GraphView extends GraphViewMetadata {
  content: GraphViewContent;
}
export interface GraphViewContentUpdateKey {
  key: 'content';
  subKey: GraphViewContentPropertyName;
}
export type GraphViewUpdateKey = string | GraphViewContentUpdateKey;

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
export interface Report extends ResourceBaseMetadata {
  content: ReportContent;
}

// Resource-specific content names
export type ReportContentPropertyName =
  | 'contentTemplate'
  | 'queryTemplate'
  | 'schema';
export interface ReportContentUpdateKey {
  key: 'content';
  subKey: ReportContentPropertyName;
}
export type ReportUpdateKey = string | ReportContentUpdateKey;

// Metadata for report
export interface ReportMetadata extends ResourceBaseMetadata {
  category: string;
}

// Base interface for all resources.
export interface ResourceBaseMetadata {
  name: string;
  description?: string;
  displayName: string;
  usedIn?: string[];
}

// All resources metadata content.
export type ResourceContent =
  | CalculationMetadata
  | CardType
  | FieldType
  | GraphModel
  | GraphView
  | LinkType
  | ReportMetadata
  | TemplateMetadata
  | Workflow;

// Template configuration details.
export interface TemplateConfiguration extends TemplateMetadata {
  path: string;
  numberOfCards: number;
}

// Template configuration content details.
export interface TemplateMetadata extends ResourceBaseMetadata {
  category?: string;
}

// Generic update key
export type UpdateKey = string | ContentUpdateKey;

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
