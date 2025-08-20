/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

// These are used within this file for additional definitions.
import {
  CardType,
  DataType,
  FieldType,
  Link,
  LinkType,
  Workflow,
} from '@cyberismo/data-handler/interfaces/resource-interfaces';
import { CardAttachment } from '@cyberismo/data-handler/interfaces/project-interfaces';
import { LinkDirection } from '@cyberismo/data-handler/types/queries';

// These are exported as-is.
export {
  type CustomField,
  type DataType,
  type EnumDefinition,
  type FieldType,
  type Workflow,
  type WorkflowState,
  type WorkflowTransition,
} from '@cyberismo/data-handler/interfaces/resource-interfaces';
export { type CardAttachment } from '@cyberismo/data-handler/interfaces/project-interfaces';

/**
 * App wide configuration which is static and should not be changed at runtime.
 */
export type AppConfig = {
  staticMode: boolean;
};

// Single card with metadata and children, but no content.
// Used in displaying the tree menu view.
export interface Card {
  key: string;
  path: string;
  metadata?: CardMetadata;
  children?: Card[];
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

// Card's metadata as a record.
export type CardMetadata = {
  title: string;
  workflowState: string;
  cardType: string;
  rank: string;
  links: Link[];
} & Record<string, MetadataValue>;

// Card usage mode.
export enum CardMode {
  VIEW,
  EDIT,
}

// Single card data when viewed in recently viewed list.
export interface CardView {
  key: string;
  children: string[];
  timestamp: string;
}

// Common base for create requests that use an identifier
export interface CreateWithIdentifier {
  identifier: string;
}

// Data for creating a new field type
export interface CreateFieldTypeData extends CreateWithIdentifier {
  dataType: DataType;
}

// Data for creating a new card type
export interface CreateCardTypeData extends CreateWithIdentifier {
  workflowName: string;
}

// Data for creating a new graph view
export type CreateGraphViewData = CreateWithIdentifier;

// Data for creating a new graph model
export type CreateGraphModelData = CreateWithIdentifier;

// Data for creating a new link type
export type CreateLinkTypeData = CreateWithIdentifier;

// Data for creating a new report
export type CreateReportData = CreateWithIdentifier;

// Data for creating a new template
export type CreateTemplateData = CreateWithIdentifier;

// Data for creating a new workflow
export type CreateWorkflowData = CreateWithIdentifier;

// Data for creating a new calculation
export interface CreateCalculationData {
  fileName: string;
}

// Array of field types.
export type FieldTypes = Array<FieldType>;

// Field type key.
export type FieldTypeKey = string;

// Single metadata value types.
export type MetadataValue =
  | string
  | number
  | boolean
  | Date
  | string[]
  | Link[]
  | null;

// Expanded link from DataHandler.
export type ParsedLink = Link & {
  fromCard: string;
};

// Project definition.
export interface Project {
  name: string;
  prefix: string;
  cardTypes: CardType[];
  workflows: Workflow[];
}

export type ExpandedLinkType = LinkType & {
  id: number;
  direction: LinkDirection;
};
