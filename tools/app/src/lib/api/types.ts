/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import type { Project, FieldTypes, MetadataValue } from '../definitions';
import type {
  Calculation,
  CardType,
  LinkType,
  FieldType,
  GraphModel,
  GraphView,
  Report,
  TemplateConfiguration,
  Workflow,
} from '@cyberismo/data-handler/interfaces/resource-interfaces';
import type {
  Card,
  CardAttachment,
  ResourceFolderType,
} from '@cyberismo/data-handler/interfaces/project-interfaces';
import type { QueryResult } from '@cyberismo/data-handler/types/queries';
import type { SWRResponse } from 'swr';
import { RESOURCES } from '@/lib/constants';

export type CardResponse = {
  parsedContent: string;
  rawContent: string;
  attachments: CardAttachment[];
} & QueryResult<'card'>;

export type LogicProgramResponse = {
  logicProgram: string;
};

export type ValidateResourceResponse = {
  errors: string[];
};

export type User = {
  id: string;
  email: string;
  name: string;
  role: string;
};

export type Resources = {
  project: Project;
  card: CardResponse;
  fieldTypes: FieldTypes;
  cardType: CardType;
  templates: TemplateConfiguration[];
  linkTypes: LinkType[];
  tree: QueryResult<'tree'>[];
  labels: string[];
  resourceTree: AnyNode[];
  logicPrograms: LogicProgramResponse;
  validateResource: ValidateResourceResponse;
  general: GeneralSettings;
  user: User;
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
  children?: AnyNode[];
  readOnly?: boolean;
}

export interface GeneralSettings {
  name: string;
  cardKeyPrefix: string;
  modules: {
    name: string;
    cardKeyPrefix: string;
  }[];
}

interface GeneralNode extends BaseResourceNode {
  type: 'general';
  data: GeneralSettings;
  readonly: false;
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
  prefix: string;
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

export interface CalculationNode extends BaseResourceNode {
  type: 'calculations';
  data: Calculation;
}

// File node for static sub-editors
export interface FileNode extends BaseResourceNode {
  type: 'file';
  name: string;
  displayName: string;
  resourceName: string;
  fileName: string;
  data: {
    content: string;
  };
}

// Union type for all possible resource nodes
export type AnyNode =
  | CardNode
  | FileNode
  | GeneralNode
  | ModuleNode
  | ResourceGroupNode
  | ResourceNode;

export type NodeKey = AnyNode['type'];
// map key to node type
export type NodeTypeMap = {
  calculations: CalculationNode;
  card: CardNode;
  cardTypes: CardTypeNode;
  fieldTypes: FieldTypeNode;
  file: FileNode;
  general: GeneralNode;
  graphModels: GraphModelNode;
  graphViews: GraphViewNode;
  linkTypes: LinkTypeNode;
  module: ModuleNode;
  reports: ReportNode;
  resourceGroup: ResourceGroupNode;
  templates: TemplateNode;
  workflows: WorkflowNode;
};

export type GenericNode<T extends NodeKey> = NodeTypeMap[T];

export type ResourceNode =
  | CalculationNode
  | CardTypeNode
  | FieldTypeNode
  | GraphModelNode
  | GraphViewNode
  | LinkTypeNode
  | ReportNode
  | WorkflowNode
  | TemplateNode;
export type NodeType = AnyNode['type'];

// Type guard helpers for working with ResourceNode
export const isResourceOfType = <T extends ResourceNode['type']>(
  node: AnyNode,
  type: T,
): node is Extract<AnyNode, { type: T }> => {
  return node.type === type;
};

/**
 * Checks if a node is a resource node.
 * @param node - The node to check.
 * @returns True if the node is a resource node, false otherwise.
 */
export const isResourceNode = (node: AnyNode): node is ResourceNode => {
  return (RESOURCES as readonly string[]).includes(node.type);
};
