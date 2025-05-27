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
} from '@cyberismo/data-handler/interfaces/resource-interfaces';
import {
  CardAttachment,
  TemplateConfiguration,
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
};

export type ResourceName = keyof Resources;

export type AdditionalState = {
  isUpdating: boolean;
};

export type AdditionalProperties = {
  callUpdate: <T>(fn: () => Promise<T>, key2?: string) => Promise<T>;
  isUpdating: (key2?: string) => boolean;
};

export type SwrResult<T extends ResourceName> = {
  [key in T]: Resources[T] | null;
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
