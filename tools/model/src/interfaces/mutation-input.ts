/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2026

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import type { Operation } from './operations.js';
import type {
  CalculationMetadata,
  DataType,
  GraphModelMetadata,
  LinkType,
  TemplateMetadata,
  UpdateKey,
  Workflow,
} from './resource-interfaces.js';
import type { ResourceName } from './resource-name.js';

/** Parameters of a resource create, per resource type. */
export interface CreateParamsByType {
  calculations: { content?: CalculationMetadata };
  cardTypes: { workflow: string };
  fieldTypes: { dataType: DataType };
  graphModels: { content?: GraphModelMetadata };
  graphViews: Record<string, never>;
  linkTypes: { content?: LinkType };
  reports: Record<string, never>;
  skills: Record<string, never>;
  templates: { content?: TemplateMetadata };
  workflows: { content?: Workflow };
}

export type CreateParams = CreateParamsByType[keyof CreateParamsByType];

/** Discriminated input describing the change a maintainer wants to make. */
export type MutationInput =
  | {
      kind: 'edit';
      target: ResourceName;
      updateKey: UpdateKey<string>;
      operation: Operation<unknown>;
    }
  | { kind: 'create'; target: ResourceName; params: CreateParams }
  | { kind: 'delete'; target: ResourceName }
  | { kind: 'rename'; target: ResourceName; newIdentifier: string };
