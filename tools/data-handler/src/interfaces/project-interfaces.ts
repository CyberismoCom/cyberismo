/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2024

  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import type { Link, TemplateConfiguration } from './resource-interfaces.js';

// Single card; either in project or in template.
export interface Card {
  key: string;
  path: string;
  content?: string;
  metadata?: CardMetadata;
  parent?: string;
  children: string[];
  attachments: CardAttachment[];
  calculations?: unknown[];
}

// Single card, but childrenCards as Card array
export interface CardWithChildrenCards extends Card {
  childrenCards: CardWithChildrenCards[];
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
  cardType: string;
  labels?: string[];
  lastTransitioned?: string;
  lastUpdated?: string;
  links: Link[];
  rank: string;
  templateCardKey?: string;
  title: string;
  workflowState: string;
}

// todo: do we need in the future separation between module-template-cards and local template-cards
export enum CardLocation {
  all = 'all',
  projectOnly = 'project',
  templatesOnly = 'local',
}

// Card's index.json file content.
export interface CardMetadata extends PredefinedCardMetadata {
  [key: string]: MetadataContent;
}

export const validContexts = ['localApp', 'exportedSite', 'exportedDocument'];

export type Context = 'localApp' | 'exportedSite' | 'exportedDocument';

export const isContext = (context: string): context is Context => {
  return validContexts.includes(context);
};

// Content in project (apart from cards) is either .schema files or cardsConfig.json.
type ContentType = DotSchemaContent | ProjectSettings;

// Credentials for private modules.
export interface Credentials {
  username?: string;
  token?: string;
}

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

/**
 * Options for exporting to pdf.
 * @param name - Name of the exported document.
 * @param title - Title of the exported document.
 * @param date - Date of the exported document.
 * @param cardKey - Key of the card to be exported.
 * @param recursive - Whether to export recursively ie. export all cards below the given card.
 * @param revremark - Revision remark of the exported document.
 */
export interface ExportPdfOptions {
  name: string;
  title: string;
  date?: Date;
  cardKey?: string;
  recursive?: boolean;
  revremark?: string;
  version?: string;
}

export type FileContentType = 'adoc' | 'html';

// Metadata content type.
export type MetadataContent =
  | bigint
  | number
  | boolean
  | string
  | string[]
  | Link[]
  | null
  | undefined;

// Module content
export interface ModuleContent extends ProjectSettings {
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
  category?: string;
  description?: string;
  version: number;
  modules: string[];
  hubs: HubSetting[];
  numberOfCards: number;
}

// Project's settings (=cardsConfig.json).
export interface ProjectSettings {
  schemaVersion?: number;
  version: number;
  cardKeyPrefix: string;
  name: string;
  category?: string;
  description: string;
  modules: ModuleSetting[];
  hubs: HubSetting[];
}

// Hub configuration
export interface HubSetting {
  location: string;
  description?: string;
  displayName?: string;
}

// Module configuration for a hub.
export interface ModuleSettingFromHub extends ModuleSetting {
  documentationLocation: string;
  displayName: string;
}

// Module configuration.
export interface ModuleSetting extends ModuleSettingOptions {
  name: string;
  location: string;
}

// Additional options for module configuration.
export interface ModuleSettingOptions {
  branch?: string;
  private?: boolean;
  credentials?: Credentials;
}

// Resources that are possible to remove.
export type RemovableResourceTypes =
  | 'attachment'
  | 'calculation'
  | 'card'
  | 'cardType'
  | 'fieldType'
  | 'graphModel'
  | 'graphView'
  | 'hub'
  | 'link'
  | 'linkType'
  | 'module'
  | 'report'
  | 'template'
  | 'workflow'
  | 'label';

// TODO: fix terminology. In DH, modules are not resources.
// Also, this contains non-folder resources
// This was done likely like this, because on the CLI, they act similarly to resources
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

// This covers all 'true' resources
export type ResourceType = Exclude<ResourceFolderType, 'modules'>;

// All resource types; both singular and plural.
export type ResourceTypes =
  | RemovableResourceTypes
  | ResourceFolderType
  | 'attachments'
  | 'calculation'
  | 'cards'
  | 'hubs'
  | 'importableModules'
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
