/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { Link, TemplateConfiguration } from './resource-interfaces.js';

// Single card; either in project or in template.
export interface Card {
  key: string;
  path: string;
  content?: string;
  metadata?: CardMetadata;
  parent?: string;
  children: Card[];
  attachments: CardAttachment[];
}

// Attachment details
export interface CardAttachment {
  card: string;
  path: string;
  fileName: string;
  mimeType: string | null;
}

// When cards are listed using 'show cards'
export interface CardListContainer {
  name: string;
  type: string;
  cards: string[];
}
// Remember to add all these keys to utils/constants.ts
export interface PredefinedCardMetadata {
  title: string;
  cardType: string;
  workflowState: string;
  rank: string;
  lastTransitioned?: string;
  lastUpdated?: string;
  templateCardKey?: string;
}

// todo: do we need in the future separation between module-template-cards and local template-cards
export enum CardLocation {
  all = 'all',
  projectOnly = 'project',
  templatesOnly = 'local',
}

// Card's index.json file content.
export interface CardMetadata extends PredefinedCardMetadata {
  labels?: string[];
  links: Link[];
  [key: string]: MetadataContent;
}

// Content in project (apart from cards) is either .schema files or cardsConfig.json.
type ContentType = DotSchemaContent | ProjectSettings;

// Single CSV row as read from a file.
export type CSVRowRaw = {
  [key: string]: string;
};

export interface DotSchemaItem {
  id: string;
  version: number;
  file?: string;
}
export type DotSchemaContent = DotSchemaItem[];

// Defines which details of a card are fetched.
export interface FetchCardDetails {
  attachments?: boolean;
  calculations?: true;
  children?: boolean;
  content?: boolean;
  contentType?: FileContentType;
  metadata?: boolean;
  parent?: boolean;
}
export interface ProjectFetchCardDetails extends FetchCardDetails {
  location?: CardLocation;
}

export type FileContentType = 'adoc' | 'html';

// Metadata content type.
export type MetadataContent =
  | number
  | boolean
  | string
  | string[]
  | Link[]
  | null
  | undefined;

// Module content
export interface ModuleSettings extends ProjectSettings {
  path: string;
  calculations: string[];
  cardTypes: string[];
  fieldTypes: string[];
  graphModels: string[];
  graphViews: string[];
  linkTypes: string[];
  reports: string[];
  templates: string[];
  workflows: string[];
}

// Files in project in addition to cards (.schema files and cardsConfig.json).
export interface ProjectFile {
  content: ContentType;
  path: string;
  name: string;
}

// Project metadata details. @todo - this overlaps the above; check & merge
export interface ProjectMetadata {
  name: string;
  path: string;
  prefix: string;
  numberOfCards: number;
}

// Project's settings (=cardsConfig.json).
export interface ProjectSettings {
  cardKeyPrefix: string;
  name: string;
}

// Resources that are possible to remove.
export type RemovableResourceTypes =
  | 'attachment'
  | 'card'
  | 'cardType'
  | 'fieldType'
  | 'graphModel'
  | 'graphView'
  | 'link'
  | 'linkType'
  | 'module'
  | 'report'
  | 'template'
  | 'workflow'
  | 'label';

// Project resource, such as workflow, template or card type as file system object.
export interface Resource {
  name: string;
  path: string;
}

// Resources that have own folders.
export type ResourceFolderType =
  | 'calculations'
  | 'cardTypes'
  | 'fieldTypes'
  | 'graphModels'
  | 'graphViews'
  | 'linkTypes'
  | 'modules'
  | 'reports'
  | 'templates'
  | 'workflows';

// All resource types; both singular and plural.
export type ResourceTypes =
  | RemovableResourceTypes
  | ResourceFolderType
  | 'attachments'
  | 'calculation'
  | 'cards'
  | 'label'
  | 'labels'
  | 'links'
  | 'modules'
  | 'project'
  | 'projects';

// Re-export Template Configuration to avoid unnecessary changes to other files.
export { TemplateConfiguration };

// Name for a card (consists of prefix and a random 8-character base36 string; e.g. 'test_abcd1234')
export const CardNameRegEx = new RegExp(/^[a-z]+_[0-9a-z]+$/);
