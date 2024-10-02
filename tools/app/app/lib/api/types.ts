/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { Project, CardDetails, FieldTypes } from '../definitions';
import {
  CardType,
  LinkType,
  Template,
} from '@cyberismocom/data-handler/interfaces/project-interfaces';
import { QueryResult } from '@cyberismocom/data-handler/types/queries';
import { SWRResponse } from 'swr';

export type Resources = {
  project: Project;
  card: CardDetails;
  fieldTypes: FieldTypes;
  cardType: CardType;
  templates: Template[];
  linkTypes: LinkType[];
  tree: QueryResult<'tree'>[];
};

export type ResourceName = keyof Resources;

export type AdditionalState = {
  isUpdating: boolean;
};

export type AdditionalProperties = {
  callUpdate: <T>(fn: () => Promise<T>) => Promise<T>;
};

export type SwrResult<T extends ResourceName> = {
  [key in T]: Resources[T] | null;
} & Omit<SWRResponse<Resources[T]>, 'data'> &
  AdditionalProperties &
  AdditionalState;

export type FullCardUpdate = {
  content: string;
  metadata: Record<string, any>;
  state: { name: string };
  parent: string;
  index: number;
};

export type CardUpdate = Partial<FullCardUpdate>;
