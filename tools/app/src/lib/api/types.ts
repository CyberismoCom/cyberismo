/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { Project, FieldTypes, MetadataValue } from '../definitions';
import {
  CardType,
  LinkType,
  CalculationMetadata,
  FieldType,
  GraphModel,
  GraphView,
  Report,
  TemplateConfiguration,
  Workflow,
} from '@cyberismo/data-handler/interfaces/resource-interfaces';
import {
  Card,
  CardAttachment,
  ResourceFolderType,
} from '@cyberismo/data-handler/interfaces/project-interfaces';
import { QueryResult } from '@cyberismo/data-handler/types/queries';
import { SWRResponse } from 'swr';

export type CardResponse = {
  parsedContent: string;
  rawContent: string;
  attachments: CardAttachment[];
} & QueryResult<'card'>;

export type Resources = {
  project: Project;
  card: CardResponse;
  fieldTypes: FieldTypes;
  cardType: CardType;
  templates: TemplateConfiguration[];
  linkTypes: LinkType[];
  tree: QueryResult<'tree'>[];
  resourceTree: ResourceNode[];
};

export type ResourceName = keyof Resources;

export type AdditionalState = {
  isUpdating: boolean;
};

export type AdditionalProperties = {
  callUpdate: <T>(fn: () => Promise<T>, key2?: string) => Promise<T>;
  isUpdating: (key2?: string) => boolean;
};

export type SwrResult<T extends ResourceName, InitialData = null> = {
  [key in T]: Resources[T] | InitialData;
} & Omit<SWRResponse<Resources[T]>, 'data'> &
  AdditionalProperties;

export type FullCardUpdate = {
  content: string;
  metadata: Record<string, MetadataValue>;
  state: { name: string };
  parent: string;
  index: number;
};

export type CardUpdate = Partial<FullCardUpdate>;

// Base resource node type
interface BaseResourceNode {
  id: string;
  name: string;
  children?: ResourceNode[];
}

// Resource group node (e.g., "cardTypes", "templates")
interface ResourceGroupNode extends BaseResourceNode {
  type: 'resourceGroup';
  name: ResourceFolderType;
}

// Module node (e.g., "decision", "project")
interface ModuleNode extends BaseResourceNode {
  type: 'module';
  name: string;
}

// Modules group node (top-level "modules")
interface ModulesGroupNode extends BaseResourceNode {
  type: 'modulesGroup';
  name: 'modules';
}

// Individual resource nodes with proper data types
interface CardTypeNode extends BaseResourceNode {
  type: 'cardTypes';
  data: CardType;
}

interface FieldTypeNode extends BaseResourceNode {
  type: 'fieldTypes';
  data: FieldType;
}

interface LinkTypeNode extends BaseResourceNode {
  type: 'linkTypes';
  data: LinkType;
}

interface CardNode extends BaseResourceNode {
  type: 'card';
  data: Card;
}

interface WorkflowNode extends BaseResourceNode {
  type: 'workflows';
  data: Workflow;
}

interface TemplateNode extends BaseResourceNode {
  type: 'templates';
  data: TemplateConfiguration; // Templates can be either resource metadata or card data
}

interface ReportNode extends BaseResourceNode {
  type: 'reports';
  data: Report;
}

interface GraphModelNode extends BaseResourceNode {
  type: 'graphModels';
  data: GraphModel;
}

interface GraphViewNode extends BaseResourceNode {
  type: 'graphViews';
  data: GraphView;
}

interface CalculationNode extends BaseResourceNode {
  type: 'calculations';
  data: CalculationMetadata;
}

// File node for static sub-editors
interface FileNode extends BaseResourceNode {
  type: 'file';
  name: string;
}

// Union type for all possible resource nodes
export type ResourceNode =
  | ResourceGroupNode
  | ModuleNode
  | ModulesGroupNode
  | CardTypeNode
  | FieldTypeNode
  | LinkTypeNode
  | WorkflowNode
  | TemplateNode
  | ReportNode
  | GraphModelNode
  | GraphViewNode
  | CalculationNode
  | CardNode
  | FileNode;

// Type guard helpers for working with ResourceNode
export const isResourceOfType = <T extends ResourceNode['type']>(
  node: ResourceNode,
  type: T,
): node is Extract<ResourceNode, { type: T }> => {
  return node.type === type;
};
