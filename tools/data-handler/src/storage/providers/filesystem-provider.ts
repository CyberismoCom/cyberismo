/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2025

  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { copyFile, mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

import mime from 'mime-types';

import type {
  AttachmentInfo,
  CardStorageData,
  ResourceStorageData,
  StorageProvider,
  StorageTransaction,
} from '../storage-provider.js';
import type {
  CardMetadata,
  ProjectSettings,
  ResourceFolderType,
} from '../../interfaces/project-interfaces.js';
import { CardNameRegEx } from '../../interfaces/project-interfaces.js';
import { readJsonFile, writeJsonFile } from '../../utils/json.js';
import { getChildLogger } from '../../utils/log-utils.js';
import { copyDir, deleteDir, pathExists, stripExtension } from '../../utils/file-utils.js';
import { cardPathParts, parentCard } from '../../utils/card-utils.js';
import { VALID_FOLDER_RESOURCE_FILES } from '../../utils/constants.js';

const cardMetadataFile = 'index.json';
const cardContentFile = 'index.adoc';

/**
 * A no-op transaction for filesystem operations.
 * Filesystem operations are not truly transactional, but this provides
 * the interface for consistency with other providers.
 */
class FileSystemTransaction implements StorageTransaction {
  async commit(): Promise<void> {
    // Filesystem operations are committed immediately
  }

  async rollback(): Promise<void> {
    // Cannot truly rollback filesystem operations
    // In a production system, you might want to implement
    // copy-on-write or journaling for this
  }
}

/**
 * Configuration for FileSystemProvider.
 */
export interface FileSystemProviderConfig {
  /** Base path to the project root */
  basePath: string;
  /** Card key prefix (e.g., 'test') */
  prefix: string;
}

/**
 * FileSystemProvider implements StorageProvider using the local filesystem.
 *
 * This extracts the current filesystem I/O behavior from CardCache,
 * CardContainer, and ResourceObject into a unified provider.
 *
 * Directory structure expected:
 * ```
 * basePath/
 * ├── cardRoot/           # Project cards
 * │   └── <card_key>/
 * │       ├── index.json  # Card metadata
 * │       ├── index.adoc  # Card content
 * │       └── a/          # Attachments
 * ├── .cards/
 * │   ├── local/
 * │   │   ├── cardsConfig.json
 * │   │   ├── calculations/
 * │   │   ├── cardTypes/
 * │   │   ├── fieldTypes/
 * │   │   ├── graphModels/
 * │   │   ├── graphViews/
 * │   │   ├── linkTypes/
 * │   │   ├── reports/
 * │   │   ├── templates/
 * │   │   └── workflows/
 * │   └── modules/
 * │       └── <module_name>/
 * ```
 */
export class FileSystemProvider implements StorageProvider {
  private basePath: string;
  private prefix: string;

  private static get logger() {
    return getChildLogger({ module: 'FileSystemProvider' });
  }

  constructor(config: FileSystemProviderConfig) {
    this.basePath = config.basePath;
    this.prefix = config.prefix;
  }

  // ============ Path Helpers ============

  private get cardRootFolder(): string {
    return join(this.basePath, 'cardRoot');
  }

  private get resourcesFolder(): string {
    return join(this.basePath, '.cards', 'local');
  }

  private get modulesFolder(): string {
    return join(this.basePath, '.cards', 'modules');
  }

  private get configFile(): string {
    return join(this.resourcesFolder, 'cardsConfig.json');
  }

  private resourcePath(type: ResourceFolderType): string {
    return join(this.resourcesFolder, type);
  }

  private moduleResourcePath(
    moduleName: string,
    type: ResourceFolderType,
  ): string {
    return join(this.modulesFolder, moduleName, type);
  }

  /**
   * Determines the location from a given card path.
   * Returns 'project' for project cards, or template name for template cards.
   */
  private determineLocationFromPath(path: string): string {
    return cardPathParts(this.prefix, path).template || 'project';
  }

  // ============ Lifecycle ============

  async initialize(): Promise<void> {
    // FileSystem provider doesn't need initialization
    FileSystemProvider.logger.info(
      { basePath: this.basePath },
      'FileSystemProvider initialized',
    );
  }

  async close(): Promise<void> {
    // FileSystem provider doesn't need cleanup
    FileSystemProvider.logger.info('FileSystemProvider closed');
  }

  // ============ Card Operations ============

  async getAllCards(location?: string): Promise<CardStorageData[]> {
    const cards: CardStorageData[] = [];

    // Collect cards from cardRoot
    const projectCards = await this.collectCardsFromPath(this.cardRootFolder);
    cards.push(...projectCards);

    // Collect cards from templates
    const templatesPath = join(this.resourcesFolder, 'templates');
    if (pathExists(templatesPath)) {
      const templateCards = await this.collectTemplateCards(templatesPath);
      cards.push(...templateCards);
    }

    // Collect cards from module templates
    if (pathExists(this.modulesFolder)) {
      const moduleCards = await this.collectModuleTemplateCards();
      cards.push(...moduleCards);
    }

    // Filter by location if specified
    if (location) {
      return cards.filter((card) => card.location === location);
    }

    return cards;
  }

  private async collectCardsFromPath(path: string): Promise<CardStorageData[]> {
    if (!pathExists(path)) {
      return [];
    }

    const cards: CardStorageData[] = [];

    try {
      const allEntries = await readdir(path, {
        withFileTypes: true,
        recursive: true,
      });

      const cardEntries = allEntries.filter(
        (entry) => entry.isDirectory() && CardNameRegEx.test(entry.name),
      );

      const cardPromises = cardEntries.map(async (entry) => {
        const cardPath = join(entry.parentPath, entry.name);
        return this.loadCardFromPath(cardPath);
      });

      const loadedCards = await Promise.all(cardPromises);
      cards.push(...loadedCards.filter((c): c is CardStorageData => c !== null));
    } catch (error) {
      FileSystemProvider.logger.error(
        { error, path },
        'Failed to collect cards from path',
      );
    }

    return cards;
  }

  private async collectTemplateCards(
    templatesPath: string,
  ): Promise<CardStorageData[]> {
    const cards: CardStorageData[] = [];

    try {
      const templateDirs = readdirSync(templatesPath, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);

      for (const templateDir of templateDirs) {
        const templateCardsPath = join(templatesPath, templateDir, 'c');
        if (pathExists(templateCardsPath)) {
          const templateCards = await this.collectCardsFromPath(templateCardsPath);
          cards.push(...templateCards);
        }
      }
    } catch (error) {
      FileSystemProvider.logger.debug(
        { error },
        'Failed to collect template cards',
      );
    }

    return cards;
  }

  private async collectModuleTemplateCards(): Promise<CardStorageData[]> {
    const cards: CardStorageData[] = [];

    try {
      const moduleNames = readdirSync(this.modulesFolder, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);

      for (const moduleName of moduleNames) {
        const moduleTemplatesPath = join(
          this.modulesFolder,
          moduleName,
          'templates',
        );
        if (pathExists(moduleTemplatesPath)) {
          const moduleCards = await this.collectTemplateCards(moduleTemplatesPath);
          cards.push(...moduleCards);
        }
      }
    } catch (error) {
      FileSystemProvider.logger.debug(
        { error },
        'Failed to collect module template cards',
      );
    }

    return cards;
  }

  private async loadCardFromPath(
    cardPath: string,
  ): Promise<CardStorageData | null> {
    try {
      const key = basename(cardPath);
      const location = this.determineLocationFromPath(cardPath);

      const [content, metadataRaw, attachments] = await Promise.all([
        this.readCardContent(cardPath),
        this.readCardMetadataRaw(cardPath),
        this.fetchAttachments(cardPath),
      ]);

      let metadata: CardMetadata;
      try {
        metadata = JSON.parse(metadataRaw);
        // Inject links if missing (for backward compatibility)
        if (!metadata.links) {
          metadata.links = [];
        }
      } catch (error) {
        const metadataPath = join(cardPath, cardMetadataFile);
        FileSystemProvider.logger.error(
          { error, metadataPath },
          'Invalid card metadata file',
        );
        throw new Error(
          `Invalid JSON in file '${metadataPath}': ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      return {
        key,
        metadata,
        content,
        attachments,
        parent: parentCard(cardPath),
        location,
      };
    } catch (error) {
      FileSystemProvider.logger.warn(
        { error, cardPath },
        'Failed to load card from path',
      );
      return null;
    }
  }

  private async readCardContent(cardPath: string): Promise<string> {
    try {
      return await readFile(join(cardPath, cardContentFile), {
        encoding: 'utf-8',
      });
    } catch {
      return '';
    }
  }

  private async readCardMetadataRaw(cardPath: string): Promise<string> {
    const metadataPath = join(cardPath, cardMetadataFile);
    let metadata = await readFile(metadataPath, { encoding: 'utf-8' });

    // Inject links if missing (for backward compatibility)
    if (metadata !== '' && !metadata.includes('"links":')) {
      const end = metadata.lastIndexOf('}');
      metadata = metadata.slice(0, end - 1) + ',\n    "links": []\n' + '}';
    }

    return metadata;
  }

  private async fetchAttachments(cardPath: string): Promise<AttachmentInfo[]> {
    const attachmentPath = join(cardPath, 'a');
    if (!pathExists(attachmentPath)) {
      return [];
    }

    const attachments: AttachmentInfo[] = [];
    const seenAttachments = new Set<string>();

    try {
      const entries = await readdir(attachmentPath, {
        withFileTypes: true,
        recursive: true,
      });

      for (const entry of entries) {
        if (!entry.isFile()) continue;

        const attachmentKey = `${entry.parentPath}:${entry.name}`;
        if (seenAttachments.has(attachmentKey)) {
          FileSystemProvider.logger.warn(
            `Duplicate attachment found: ${entry.name} at ${cardPath}`,
          );
          continue;
        }
        seenAttachments.add(attachmentKey);

        const filePath = join(entry.parentPath, entry.name);
        let size: number | undefined;
        try {
          const stats = statSync(filePath);
          size = stats.size;
        } catch {
          // Size is optional
        }

        attachments.push({
          fileName: entry.name,
          mimeType: mime.lookup(entry.name) || null,
          size,
        });
      }
    } catch (error) {
      FileSystemProvider.logger.warn(
        { error, attachmentPath },
        'Failed to read attachments',
      );
    }

    return attachments;
  }

  async getCard(key: string): Promise<CardStorageData | undefined> {
    // Search in cardRoot first
    const projectCardPath = await this.findCardPath(key, this.cardRootFolder);
    if (projectCardPath) {
      const card = await this.loadCardFromPath(projectCardPath);
      return card ?? undefined;
    }

    // Search in templates
    const allCards = await this.getAllCards();
    return allCards.find((card) => card.key === key);
  }

  async cardExists(key: string): Promise<boolean> {
    // Check in cardRoot first
    const projectCardPath = await this.findCardPath(key, this.cardRootFolder);
    if (projectCardPath) {
      return true;
    }

    // Check in templates
    const templatesPath = join(this.resourcesFolder, 'templates');
    if (pathExists(templatesPath)) {
      const templatePath = await this.findCardPath(key, templatesPath);
      if (templatePath) {
        return true;
      }
    }

    // Check in module templates
    if (pathExists(this.modulesFolder)) {
      const moduleTemplatePath = await this.findCardPath(key, this.modulesFolder);
      if (moduleTemplatePath) {
        return true;
      }
    }

    return false;
  }

  async createCard(card: CardStorageData): Promise<void> {
    // Determine the path for the new card
    let cardPath: string;

    if (card.location === 'project') {
      if (card.parent) {
        const parentPath = await this.findCardPath(card.parent, this.cardRootFolder);
        if (parentPath) {
          // Child cards go into a 'c' subdirectory of the parent
          cardPath = join(parentPath, 'c', card.key);
        } else {
          // Parent not found, create at root
          cardPath = join(this.cardRootFolder, card.key);
        }
      } else {
        // Root level card
        cardPath = join(this.cardRootFolder, card.key);
      }
    } else {
      // Template card - extract template name from location
      // location format: 'prefix/templates/templateName'
      const locationParts = card.location.split('/');
      const templateName = locationParts.length >= 3 ? locationParts[2] : card.location;

      if (card.parent) {
        const parentPath = await this.findCardPath(card.parent, this.resourcesFolder);
        if (parentPath) {
          cardPath = join(parentPath, 'c', card.key);
        } else {
          cardPath = join(this.resourcesFolder, 'templates', templateName, 'c', card.key);
        }
      } else {
        cardPath = join(this.resourcesFolder, 'templates', templateName, 'c', card.key);
      }
    }

    // Create the directory
    await mkdir(cardPath, { recursive: true });

    // Write metadata file
    const metadataPath = join(cardPath, cardMetadataFile);
    await writeJsonFile(metadataPath, card.metadata);

    // Write content file
    const contentPath = join(cardPath, cardContentFile);
    await writeFile(contentPath, card.content);

    // Create attachment folder and save attachments if any
    if (card.attachments && card.attachments.length > 0) {
      const attachmentFolder = join(cardPath, 'a');
      await mkdir(attachmentFolder, { recursive: true });
    }
  }

  async moveCard(key: string, newParentKey: string | null, newPath: string): Promise<void> {
    const currentPath = await this.findCardPath(key, this.cardRootFolder);
    if (!currentPath) {
      throw new Error(`Card ${key} not found`);
    }

    // Copy to new location
    await copyDir(currentPath, newPath);

    // Delete original
    await deleteDir(currentPath);
  }

  private async findCardPath(
    key: string,
    basePath: string,
  ): Promise<string | undefined> {
    if (!pathExists(basePath)) {
      return undefined;
    }

    try {
      const entries = await readdir(basePath, {
        withFileTypes: true,
        recursive: true,
      });

      for (const entry of entries) {
        if (entry.isDirectory() && entry.name === key) {
          return join(entry.parentPath, entry.name);
        }
      }
    } catch {
      // Path doesn't exist or isn't readable
    }

    return undefined;
  }

  async saveCard(card: CardStorageData): Promise<void> {
    // For filesystem, we need the card path to save
    // This is typically handled by the caller, but we can derive it
    // from the location for new cards or look it up for existing cards
    const existingCard = await this.getCard(card.key);
    let cardPath: string;

    if (existingCard) {
      // Find the existing path
      const foundPath = await this.findCardPath(card.key, this.cardRootFolder);
      if (!foundPath) {
        throw new Error(`Cannot find path for existing card ${card.key}`);
      }
      cardPath = foundPath;
    } else {
      // New card - determine path based on parent and location
      if (card.location === 'project') {
        if (card.parent) {
          const parentPath = await this.findCardPath(
            card.parent,
            this.cardRootFolder,
          );
          if (parentPath) {
            cardPath = join(parentPath, card.key);
          } else {
            cardPath = join(this.cardRootFolder, card.key);
          }
        } else {
          cardPath = join(this.cardRootFolder, card.key);
        }
      } else {
        // Template card
        const templatePath = join(
          this.resourcesFolder,
          'templates',
          card.location,
          'c',
        );
        cardPath = join(templatePath, card.key);
      }
    }

    // Ensure directory exists
    await mkdir(cardPath, { recursive: true });

    // Save content and metadata
    await this.saveCardContent(card.key, card.content);
    await this.saveCardMetadata(card.key, card.metadata);
  }

  async deleteCard(key: string): Promise<boolean> {
    const cardPath = await this.findCardPath(key, this.cardRootFolder);
    if (!cardPath) {
      // Try templates
      const allCards = await this.getAllCards();
      const templateCard = allCards.find(
        (c) => c.key === key && c.location !== 'project',
      );
      if (templateCard) {
        // Cannot delete template cards through this interface
        return false;
      }
      return false;
    }

    try {
      await deleteDir(cardPath);
      return true;
    } catch (error) {
      FileSystemProvider.logger.error(
        { error, cardPath },
        'Failed to delete card',
      );
      return false;
    }
  }

  // ============ Content/Metadata Operations ============

  async getCardContent(key: string): Promise<string | undefined> {
    const cardPath = await this.findCardPath(key, this.cardRootFolder);
    if (!cardPath) {
      const card = await this.getCard(key);
      return card?.content;
    }

    try {
      return await readFile(join(cardPath, cardContentFile), {
        encoding: 'utf-8',
      });
    } catch {
      return undefined;
    }
  }

  async saveCardContent(key: string, content: string): Promise<void> {
    const cardPath = await this.findCardPath(key, this.cardRootFolder);
    if (!cardPath) {
      throw new Error(`Card ${key} not found`);
    }

    const contentFile = join(cardPath, cardContentFile);
    await writeFile(contentFile, content);
  }

  async getCardMetadata(key: string): Promise<CardMetadata | undefined> {
    const cardPath = await this.findCardPath(key, this.cardRootFolder);
    if (!cardPath) {
      const card = await this.getCard(key);
      return card?.metadata;
    }

    try {
      return await readJsonFile(join(cardPath, cardMetadataFile));
    } catch {
      return undefined;
    }
  }

  async saveCardMetadata(key: string, metadata: CardMetadata): Promise<void> {
    const cardPath = await this.findCardPath(key, this.cardRootFolder);
    if (!cardPath) {
      throw new Error(`Card ${key} not found`);
    }

    const metadataFile = join(cardPath, cardMetadataFile);
    await writeJsonFile(metadataFile, metadata);
  }

  // ============ Attachment Operations ============

  async getAttachment(
    cardKey: string,
    fileName: string,
  ): Promise<Buffer | undefined> {
    const cardPath = await this.findCardPath(cardKey, this.cardRootFolder);
    if (!cardPath) {
      return undefined;
    }

    const attachmentPath = join(cardPath, 'a', fileName);
    try {
      return await readFile(attachmentPath);
    } catch {
      return undefined;
    }
  }

  async saveAttachment(
    cardKey: string,
    fileName: string,
    data: Buffer,
  ): Promise<void> {
    const cardPath = await this.findCardPath(cardKey, this.cardRootFolder);
    if (!cardPath) {
      throw new Error(`Card ${cardKey} not found`);
    }

    const attachmentFolder = join(cardPath, 'a');
    await mkdir(attachmentFolder, { recursive: true });

    const attachmentPath = join(attachmentFolder, fileName);
    await writeFile(attachmentPath, data);
  }

  async copyAttachment(
    sourceCardKey: string,
    sourceFileName: string,
    destCardKey: string,
    destFileName: string,
  ): Promise<void> {
    // Find source card - search in all locations
    let sourceCardPath = await this.findCardPath(sourceCardKey, this.cardRootFolder);
    if (!sourceCardPath) {
      sourceCardPath = await this.findCardPath(sourceCardKey, this.resourcesFolder);
    }
    if (!sourceCardPath) {
      sourceCardPath = await this.findCardPath(sourceCardKey, this.modulesFolder);
    }
    if (!sourceCardPath) {
      throw new Error(`Source card ${sourceCardKey} not found`);
    }

    // Find destination card
    let destCardPath = await this.findCardPath(destCardKey, this.cardRootFolder);
    if (!destCardPath) {
      destCardPath = await this.findCardPath(destCardKey, this.resourcesFolder);
    }
    if (!destCardPath) {
      throw new Error(`Destination card ${destCardKey} not found`);
    }

    const sourcePath = join(sourceCardPath, 'a', sourceFileName);
    const destFolder = join(destCardPath, 'a');
    const destPath = join(destFolder, destFileName);

    // Ensure destination folder exists
    await mkdir(destFolder, { recursive: true });

    // Copy the file
    await copyFile(sourcePath, destPath);
  }

  async deleteAttachment(cardKey: string, fileName: string): Promise<boolean> {
    const cardPath = await this.findCardPath(cardKey, this.cardRootFolder);
    if (!cardPath) {
      return false;
    }

    const attachmentPath = join(cardPath, 'a', fileName);
    try {
      await unlink(attachmentPath);
      return true;
    } catch {
      return false;
    }
  }

  async listAttachments(cardKey: string): Promise<AttachmentInfo[]> {
    const cardPath = await this.findCardPath(cardKey, this.cardRootFolder);
    if (!cardPath) {
      return [];
    }

    return this.fetchAttachments(cardPath);
  }

  // ============ Resource Operations ============

  async getAllResources(type?: ResourceFolderType): Promise<ResourceStorageData[]> {
    const resources: ResourceStorageData[] = [];

    const resourceTypes: ResourceFolderType[] = type
      ? [type]
      : [
          'calculations',
          'cardTypes',
          'fieldTypes',
          'graphModels',
          'graphViews',
          'linkTypes',
          'reports',
          'templates',
          'workflows',
        ];

    // Collect local resources
    for (const resourceType of resourceTypes) {
      const localResources = await this.collectResourcesOfType(
        resourceType,
        'local',
      );
      resources.push(...localResources);
    }

    // Collect module resources
    if (pathExists(this.modulesFolder)) {
      try {
        const moduleNames = readdirSync(this.modulesFolder, {
          withFileTypes: true,
        })
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name);

        for (const moduleName of moduleNames) {
          for (const resourceType of resourceTypes) {
            const moduleResources = await this.collectResourcesOfType(
              resourceType,
              'module',
              moduleName,
            );
            resources.push(...moduleResources);
          }
        }
      } catch {
        // Modules folder doesn't exist or isn't readable
      }
    }

    return resources;
  }

  private async collectResourcesOfType(
    type: ResourceFolderType,
    source: 'local' | 'module',
    moduleName?: string,
  ): Promise<ResourceStorageData[]> {
    const resources: ResourceStorageData[] = [];

    const resourceFolder =
      source === 'local'
        ? this.resourcePath(type)
        : this.moduleResourcePath(moduleName!, type);

    if (!pathExists(resourceFolder)) {
      return resources;
    }

    try {
      const entries = readdirSync(resourceFolder, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.json')) {
          const identifier = stripExtension(entry.name);
          const name =
            source === 'local'
              ? `${this.prefix}/${type}/${identifier}`
              : `${moduleName}/${type}/${identifier}`;

          const metadataPath = join(resourceFolder, entry.name);
          let metadata: Record<string, unknown>;
          try {
            metadata = JSON.parse(readFileSync(metadataPath, 'utf-8'));
          } catch {
            FileSystemProvider.logger.warn(
              { metadataPath },
              'Failed to read resource metadata',
            );
            continue;
          }

          // Collect content files for folder resources
          const contentFiles = this.collectResourceContentFiles(
            resourceFolder,
            identifier,
            type,
          );

          resources.push({
            name,
            type,
            metadata,
            contentFiles: contentFiles.size > 0 ? contentFiles : undefined,
            source,
            moduleName: source === 'module' ? moduleName : undefined,
          });
        }
      }
    } catch {
      // Folder doesn't exist or isn't readable
    }

    return resources;
  }

  private collectResourceContentFiles(
    resourceFolder: string,
    identifier: string,
    type: ResourceFolderType,
  ): Map<string, string> {
    const contentFiles = new Map<string, string>();

    const folderResourceTypes: ResourceFolderType[] = [
      'calculations',
      'graphModels',
      'graphViews',
      'reports',
      'templates',
    ];

    if (!folderResourceTypes.includes(type)) {
      return contentFiles;
    }

    const internalFolder = join(resourceFolder, identifier);
    if (!pathExists(internalFolder)) {
      return contentFiles;
    }

    try {
      const entries = readdirSync(internalFolder, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && VALID_FOLDER_RESOURCE_FILES.includes(entry.name)) {
          const filePath = join(internalFolder, entry.name);
          try {
            const content = readFileSync(filePath, 'utf-8');
            contentFiles.set(entry.name, content);
          } catch {
            FileSystemProvider.logger.warn(
              { filePath },
              'Failed to read resource content file',
            );
          }
        }
      }
    } catch {
      // Internal folder doesn't exist
    }

    return contentFiles;
  }

  async getResource(
    name: string,
    type: ResourceFolderType,
  ): Promise<ResourceStorageData | undefined> {
    // Parse the name to get prefix and identifier
    const parts = name.split('/');
    let prefix: string;
    let identifier: string;

    if (parts.length === 3) {
      // Full name: prefix/type/identifier
      prefix = parts[0];
      identifier = parts[2];
    } else if (parts.length === 1) {
      // Short name: identifier only
      prefix = this.prefix;
      identifier = name;
    } else {
      return undefined;
    }

    const source = prefix === this.prefix ? 'local' : 'module';
    const resourceFolder =
      source === 'local'
        ? this.resourcePath(type)
        : this.moduleResourcePath(prefix, type);

    const metadataPath = join(resourceFolder, `${identifier}.json`);

    if (!pathExists(metadataPath)) {
      return undefined;
    }

    try {
      const metadata = JSON.parse(readFileSync(metadataPath, 'utf-8'));
      const contentFiles = this.collectResourceContentFiles(
        resourceFolder,
        identifier,
        type,
      );

      return {
        name: `${prefix}/${type}/${identifier}`,
        type,
        metadata,
        contentFiles: contentFiles.size > 0 ? contentFiles : undefined,
        source,
        moduleName: source === 'module' ? prefix : undefined,
      };
    } catch {
      return undefined;
    }
  }

  async resourceExists(name: string, type: ResourceFolderType): Promise<boolean> {
    const parts = name.split('/');
    let prefix: string;
    let identifier: string;

    if (parts.length === 3) {
      prefix = parts[0];
      identifier = parts[2];
    } else if (parts.length === 1) {
      prefix = this.prefix;
      identifier = name;
    } else {
      return false;
    }

    const source = prefix === this.prefix ? 'local' : 'module';
    const resourceFolder =
      source === 'local'
        ? this.resourcePath(type)
        : this.moduleResourcePath(prefix, type);

    const metadataPath = join(resourceFolder, `${identifier}.json`);
    return pathExists(metadataPath);
  }

  async createResource(resource: ResourceStorageData): Promise<void> {
    // createResource has the same implementation as saveResource
    // but semantically indicates a new resource is being created
    return this.saveResource(resource);
  }

  async saveResource(resource: ResourceStorageData): Promise<void> {
    const parts = resource.name.split('/');
    if (parts.length !== 3) {
      throw new Error(`Invalid resource name: ${resource.name}`);
    }

    const [prefix, type, identifier] = parts;
    const source = prefix === this.prefix ? 'local' : 'module';

    if (source === 'module') {
      throw new Error('Cannot modify module resources');
    }

    const resourceFolder = this.resourcePath(resource.type);
    await mkdir(resourceFolder, { recursive: true });

    // Save metadata
    const metadataPath = join(resourceFolder, `${identifier}.json`);
    await writeJsonFile(metadataPath, resource.metadata);

    // Save content files if present
    if (resource.contentFiles && resource.contentFiles.size > 0) {
      const internalFolder = join(resourceFolder, identifier);
      await mkdir(internalFolder, { recursive: true });

      for (const [fileName, content] of resource.contentFiles) {
        const filePath = join(internalFolder, fileName);
        await writeFile(filePath, content);
      }
    }
  }

  async renameResource(
    oldName: string,
    newName: string,
    type: ResourceFolderType,
  ): Promise<void> {
    // Parse old name
    const oldParts = oldName.split('/');
    const oldPrefix = oldParts.length === 3 ? oldParts[0] : this.prefix;
    const oldIdentifier = oldParts.length === 3 ? oldParts[2] : oldName;

    // Parse new name
    const newParts = newName.split('/');
    const newIdentifier = newParts.length === 3 ? newParts[2] : newName;

    if (oldPrefix !== this.prefix) {
      throw new Error('Cannot rename module resources');
    }

    const resourceFolder = this.resourcePath(type);
    const oldMetadataPath = join(resourceFolder, `${oldIdentifier}.json`);
    const newMetadataPath = join(resourceFolder, `${newIdentifier}.json`);

    if (!pathExists(oldMetadataPath)) {
      throw new Error(`Resource ${oldName} not found`);
    }

    // Rename metadata file
    await rename(oldMetadataPath, newMetadataPath);

    // Rename internal folder if it exists (for folder resources)
    const oldInternalFolder = join(resourceFolder, oldIdentifier);
    const newInternalFolder = join(resourceFolder, newIdentifier);
    if (pathExists(oldInternalFolder)) {
      await rename(oldInternalFolder, newInternalFolder);
    }
  }

  async deleteResource(
    name: string,
    type: ResourceFolderType,
  ): Promise<boolean> {
    const resource = await this.getResource(name, type);
    if (!resource || resource.source === 'module') {
      return false;
    }

    const parts = resource.name.split('/');
    const identifier = parts[2];

    const resourceFolder = this.resourcePath(type);
    const metadataPath = join(resourceFolder, `${identifier}.json`);

    try {
      await unlink(metadataPath);

      // Delete internal folder if exists
      const internalFolder = join(resourceFolder, identifier);
      if (pathExists(internalFolder)) {
        await deleteDir(internalFolder);
      }

      return true;
    } catch {
      return false;
    }
  }

  // ============ Resource File Operations ============

  async getResourceFile(
    name: string,
    type: ResourceFolderType,
    fileName: string,
  ): Promise<string | undefined> {
    const resource = await this.getResource(name, type);
    if (!resource) {
      return undefined;
    }

    return resource.contentFiles?.get(fileName);
  }

  async saveResourceFile(
    name: string,
    type: ResourceFolderType,
    fileName: string,
    content: string,
  ): Promise<void> {
    const parts = name.split('/');
    const prefix = parts.length === 3 ? parts[0] : this.prefix;
    const identifier = parts.length === 3 ? parts[2] : name;

    if (prefix !== this.prefix) {
      throw new Error('Cannot modify module resources');
    }

    const resourceFolder = this.resourcePath(type);
    const internalFolder = join(resourceFolder, identifier);

    await mkdir(internalFolder, { recursive: true });
    const filePath = join(internalFolder, fileName);
    await writeFile(filePath, content);
  }

  async deleteResourceFile(
    name: string,
    type: ResourceFolderType,
    fileName: string,
  ): Promise<boolean> {
    const parts = name.split('/');
    const prefix = parts.length === 3 ? parts[0] : this.prefix;
    const identifier = parts.length === 3 ? parts[2] : name;

    if (prefix !== this.prefix) {
      throw new Error('Cannot delete module resource files');
    }

    const resourceFolder = this.resourcePath(type);
    const filePath = join(resourceFolder, identifier, fileName);

    if (!pathExists(filePath)) {
      return false;
    }

    try {
      await unlink(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async listResourceFiles(name: string, type: ResourceFolderType): Promise<string[]> {
    const parts = name.split('/');
    const prefix = parts.length === 3 ? parts[0] : this.prefix;
    const identifier = parts.length === 3 ? parts[2] : name;

    const source = prefix === this.prefix ? 'local' : 'module';
    const resourceFolder =
      source === 'local'
        ? this.resourcePath(type)
        : this.moduleResourcePath(prefix, type);

    const internalFolder = join(resourceFolder, identifier);

    if (!pathExists(internalFolder)) {
      return [];
    }

    try {
      const entries = readdirSync(internalFolder, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name);
    } catch {
      return [];
    }
  }

  // ============ Project Configuration ============

  async getProjectConfig(): Promise<ProjectSettings | undefined> {
    if (!pathExists(this.configFile)) {
      return undefined;
    }

    try {
      return await readJsonFile(this.configFile);
    } catch {
      return undefined;
    }
  }

  async saveProjectConfig(config: ProjectSettings): Promise<void> {
    const configDir = dirname(this.configFile);
    await mkdir(configDir, { recursive: true });
    await writeJsonFile(this.configFile, config);
  }

  // ============ Transaction Support ============

  async beginTransaction(): Promise<StorageTransaction> {
    return new FileSystemTransaction();
  }
}
