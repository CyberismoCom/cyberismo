// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

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
