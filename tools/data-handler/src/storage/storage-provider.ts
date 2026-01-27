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

import type {
  CardMetadata,
  ProjectSettings,
  ResourceFolderType,
} from '../interfaces/project-interfaces.js';

/**
 * Information about an attachment file.
 */
export interface AttachmentInfo {
  fileName: string;
  mimeType: string | null;
  size?: number;
}

/**
 * Card data as stored in the storage backend.
 */
export interface CardStorageData {
  /** Unique card key (e.g., 'project_abcd1234') */
  key: string;
  /** Card metadata (index.json content) */
  metadata: CardMetadata;
  /** Card content (index.adoc content) */
  content: string;
  /** List of attachments */
  attachments: AttachmentInfo[];
  /** Parent card key, or undefined for root cards */
  parent?: string;
  /** Location: 'project' for project cards, or template name for template cards */
  location: string;
}

/**
 * Resource data as stored in the storage backend.
 */
export interface ResourceStorageData {
  /** Full resource name (e.g., 'prefix/cardTypes/myType') */
  name: string;
  /** Resource type */
  type: ResourceFolderType;
  /** Resource metadata (the JSON file content) */
  metadata: Record<string, unknown>;
  /** Content files for folder resources (e.g., calculations have calculation.lp) */
  contentFiles?: Map<string, string>;
  /** Source: 'local' for project resources, 'module' for imported modules */
  source: 'local' | 'module';
  /** Module name if source is 'module' */
  moduleName?: string;
}

/**
 * Transaction interface for atomic operations.
 */
export interface StorageTransaction {
  /** Commit all changes made during the transaction */
  commit(): Promise<void>;
  /** Rollback all changes made during the transaction */
  rollback(): Promise<void>;
}

/**
 * Storage provider interface for abstracting persistence backends.
 *
 * This interface allows data-handler to work with different storage backends:
 * - FileSystem: Current behavior for CLI/local use
 * - Redis: For SaaS multi-tenant storage
 * - Database: For PostgreSQL/SQLite backends
 *
 * The in-memory caches (CardCache, ResourceCache) remain as fast lookup layers.
 * Providers are responsible for I/O only.
 */
export interface StorageProvider {
  // ============ Lifecycle ============

  /**
   * Initialize the storage provider.
   * Called once when the provider is first used.
   */
  initialize(): Promise<void>;

  /**
   * Close the storage provider and release resources.
   */
  close(): Promise<void>;

  // ============ Card Operations ============

  /**
   * Get all cards from storage.
   * @param location Optional filter: 'project' for project cards, template name for template cards
   * @returns Array of card data
   */
  getAllCards(location?: string): Promise<CardStorageData[]>;

  /**
   * Get a single card by key.
   * @param key Card key
   * @returns Card data or undefined if not found
   */
  getCard(key: string): Promise<CardStorageData | undefined>;

  /**
   * Check if a card exists.
   * @param key Card key
   * @returns true if card exists, false otherwise
   */
  cardExists(key: string): Promise<boolean>;

  /**
   * Create a new card with initial directory structure.
   * @param card Card data to create
   */
  createCard(card: CardStorageData): Promise<void>;

  /**
   * Save a card (creates or updates).
   * @param card Card data to save
   */
  saveCard(card: CardStorageData): Promise<void>;

  /**
   * Delete a card (recursive - includes children and attachments).
   * @param key Card key to delete
   * @returns true if card was deleted, false if not found
   */
  deleteCard(key: string): Promise<boolean>;

  /**
   * Move a card to a new parent.
   * In filesystem terms, this copies the directory and deletes the original.
   * @param key Card key to move
   * @param newParentKey New parent card key, or null for root
   * @param newPath New filesystem path for the card
   */
  moveCard(key: string, newParentKey: string | null, newPath: string): Promise<void>;

  // ============ Separate Content/Metadata Operations ============
  // These are provided for performance optimization - some operations
  // only need to update content or metadata, not both.

  /**
   * Get card content (the .adoc file).
   * @param key Card key
   * @returns Content string or undefined if not found
   */
  getCardContent(key: string): Promise<string | undefined>;

  /**
   * Save card content only.
   * @param key Card key
   * @param content Content string
   */
  saveCardContent(key: string, content: string): Promise<void>;

  /**
   * Get card metadata (the index.json file).
   * @param key Card key
   * @returns Metadata or undefined if not found
   */
  getCardMetadata(key: string): Promise<CardMetadata | undefined>;

  /**
   * Save card metadata only.
   * @param key Card key
   * @param metadata Metadata object
   */
  saveCardMetadata(key: string, metadata: CardMetadata): Promise<void>;

  // ============ Attachment Operations ============

  /**
   * Get an attachment's data.
   * @param cardKey Card key
   * @param fileName Attachment file name
   * @returns Attachment data buffer or undefined if not found
   */
  getAttachment(cardKey: string, fileName: string): Promise<Buffer | undefined>;

  /**
   * Save an attachment.
   * @param cardKey Card key
   * @param fileName Attachment file name
   * @param data Attachment data
   */
  saveAttachment(
    cardKey: string,
    fileName: string,
    data: Buffer,
  ): Promise<void>;

  /**
   * Copy an attachment from one card to another.
   * @param sourceCardKey Source card key
   * @param sourceFileName Source file name
   * @param destCardKey Destination card key
   * @param destFileName Destination file name
   */
  copyAttachment(
    sourceCardKey: string,
    sourceFileName: string,
    destCardKey: string,
    destFileName: string,
  ): Promise<void>;

  /**
   * Delete an attachment.
   * @param cardKey Card key
   * @param fileName Attachment file name
   * @returns true if attachment was deleted, false if not found
   */
  deleteAttachment(cardKey: string, fileName: string): Promise<boolean>;

  /**
   * List all attachments for a card.
   * @param cardKey Card key
   * @returns Array of attachment info
   */
  listAttachments(cardKey: string): Promise<AttachmentInfo[]>;

  // ============ Resource Operations ============

  /**
   * Get all resources.
   * @param type Optional filter by resource type
   * @returns Array of resource data
   */
  getAllResources(type?: ResourceFolderType): Promise<ResourceStorageData[]>;

  /**
   * Get a single resource.
   * @param name Resource name (can be short or full name)
   * @param type Resource type
   * @returns Resource data or undefined if not found
   */
  getResource(
    name: string,
    type: ResourceFolderType,
  ): Promise<ResourceStorageData | undefined>;

  /**
   * Check if a resource exists.
   * @param name Resource name
   * @param type Resource type
   * @returns true if resource exists, false otherwise
   */
  resourceExists(name: string, type: ResourceFolderType): Promise<boolean>;

  /**
   * Create a new resource.
   * @param resource Resource data to create
   */
  createResource(resource: ResourceStorageData): Promise<void>;

  /**
   * Save a resource (creates or updates).
   * @param resource Resource data to save
   */
  saveResource(resource: ResourceStorageData): Promise<void>;

  /**
   * Rename a resource.
   * @param oldName Current resource name
   * @param newName New resource name
   * @param type Resource type
   */
  renameResource(
    oldName: string,
    newName: string,
    type: ResourceFolderType,
  ): Promise<void>;

  /**
   * Delete a resource.
   * @param name Resource name
   * @param type Resource type
   * @returns true if resource was deleted, false if not found
   */
  deleteResource(name: string, type: ResourceFolderType): Promise<boolean>;

  // ============ Resource Content File Operations ============
  // For folder resources that have internal content files (calculations, reports, etc.)

  /**
   * Get a content file from a folder resource.
   * @param name Resource name
   * @param type Resource type
   * @param fileName Content file name (e.g., 'calculation.lp')
   * @returns File content or undefined if not found
   */
  getResourceFile(
    name: string,
    type: ResourceFolderType,
    fileName: string,
  ): Promise<string | undefined>;

  /**
   * Save a content file to a folder resource.
   * @param name Resource name
   * @param type Resource type
   * @param fileName Content file name
   * @param content File content
   */
  saveResourceFile(
    name: string,
    type: ResourceFolderType,
    fileName: string,
    content: string,
  ): Promise<void>;

  /**
   * Delete a content file from a folder resource.
   * @param name Resource name
   * @param type Resource type
   * @param fileName Content file name
   * @returns true if file was deleted, false if not found
   */
  deleteResourceFile(
    name: string,
    type: ResourceFolderType,
    fileName: string,
  ): Promise<boolean>;

  /**
   * List all content files in a folder resource.
   * @param name Resource name
   * @param type Resource type
   * @returns Array of file names
   */
  listResourceFiles(name: string, type: ResourceFolderType): Promise<string[]>;

  // ============ Project Configuration ============

  /**
   * Get project configuration (cardsConfig.json).
   * @returns Project configuration or undefined if not found
   */
  getProjectConfig(): Promise<ProjectSettings | undefined>;

  /**
   * Save project configuration.
   * @param config Project configuration
   */
  saveProjectConfig(config: ProjectSettings): Promise<void>;

  // ============ Transaction Support ============

  /**
   * Begin a transaction for atomic operations.
   * @returns Transaction object
   */
  beginTransaction(): Promise<StorageTransaction>;
}
