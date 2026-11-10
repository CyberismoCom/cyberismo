// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

// node
import type { Dirent } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { readdir, readFile } from 'node:fs/promises';

import type { CardMetadata, MetadataContent } from '@cyberismo/model';
import { CardNameRegEx } from '@cyberismo/model';
import { getChildLogger } from '../../shared/utils/log-utils.js';
import { ROOT } from '../../shared/utils/constants.js';

// A card's own files, inside its folder.
export const CARD_CONTENT_FILE = 'index.adoc';
export const CARD_METADATA_FILE = 'index.json';
// A card's attachment folder, inside its folder.
export const ATTACHMENT_FOLDER = 'a';
// A card's children live in this folder, inside its folder.
export const CHILDREN_FOLDER = 'c';

// An attachment as the tree stores it: a file directly in its card's
// attachment folder. Its full path is derived from its card's.
export interface StoredAttachment {
  fileName: string;
}

// A card as the tree stores it: identity, tree position and the card's own
// data. No path: a card's folder is derived from the edges and the tree's
// root folder (see pathOf).
export interface StoredCard {
  key: string;
  parent: string;
  children: string[];
  metadata?: CardMetadata;
  content?: string;
  attachments: StoredAttachment[];
}

// Stored metadata is frozen; node-level reads share it. Always a fresh
// object, so the tree never aliases metadata its producer still holds.
export function normalizedMetadata(
  metadata?: CardMetadata,
): CardMetadata | undefined {
  if (!metadata) {
    return metadata;
  }
  const stored: Record<string, MetadataContent> = {};
  for (const [key, value] of Object.entries(metadata)) {
    stored[key] = Array.isArray(value) ? frozenList(value) : value;
  }
  if (!Array.isArray(stored.links)) {
    stored.links = frozenList([]);
  }
  return Object.freeze(stored) as CardMetadata;
}

// 'links' and 'externalLinks' hold objects, so the elements are frozen too.
function frozenList(values: unknown[]): MetadataContent {
  return Object.freeze(
    values.map((item) =>
      item !== null && typeof item === 'object'
        ? Object.freeze({ ...item })
        : item,
    ),
  ) as MetadataContent;
}

const logger = getChildLogger({ module: 'cardTree' });

// Gets all directory entries recursively.
async function entries(path: string): Promise<Dirent[]> {
  try {
    return await readdir(path, { withFileTypes: true, recursive: true });
  } catch (error) {
    logger.error({ error }, 'Reading entries');
    return [];
  }
}

// Every card's attachment listing, taken out of the one recursive sweep the
// load already has; going back to disk per card read the same directories a
// second time.
function attachmentsByCard(
  allEntries: Dirent[],
  cardFolders: Map<string, string>,
): Map<string, StoredAttachment[]> {
  const attachments = new Map<string, StoredAttachment[]>();

  for (const entry of allEntries) {
    // Only files directly in a card's attachment folder are attachments;
    // subfolders of it are not scanned.
    if (entry.isDirectory()) {
      continue;
    }
    const folder = resolve(entry.parentPath);
    if (basename(folder) !== ATTACHMENT_FOLDER) {
      continue;
    }
    const cardKey = cardFolders.get(dirname(folder));
    if (!cardKey) {
      continue;
    }
    const attachment: StoredAttachment = { fileName: entry.name };
    const listing = attachments.get(cardKey);
    if (listing) {
      listing.push(attachment);
    } else {
      attachments.set(cardKey, [attachment]);
    }
  }

  return attachments;
}

// Gets content from disk.
async function fetchContent(currentPath: string): Promise<string> {
  return readFile(join(currentPath, CARD_CONTENT_FILE), {
    encoding: 'utf-8',
  });
}

// Gets metadata from disk.
async function fetchMetadata(currentPath: string): Promise<string> {
  return readFile(join(currentPath, CARD_METADATA_FILE), {
    encoding: 'utf-8',
  });
}

/**
 * Reads the cards under a tree's root folder from disk. A card's parent comes
 * from where its folder sits: directly under the root it is a root card,
 * anywhere else it is in its parent's 'c' folder.
 * @param rootPath Folder the tree's cards are rooted at.
 * @param treeName Tree the cards are read for; names the scan in the log.
 */
export async function scanCardTree(
  rootPath: string,
  treeName: string,
): Promise<StoredCard[]> {
  const root = resolve(rootPath);
  const allEntries = await entries(rootPath);
  const cardEntries = allEntries.filter(
    (entry) => entry.isDirectory() && CardNameRegEx.test(entry.name),
  );

  // Card folder -> card key, so an entry can be traced back to the card
  // whose attachment folder it sits in.
  const cardFolders = new Map<string, string>(
    cardEntries.map((entry) => [
      resolve(join(entry.parentPath, entry.name)),
      entry.name,
    ]),
  );
  const attachments = attachmentsByCard(allEntries, cardFolders);
  const loadedKeys = new Set(cardEntries.map((entry) => entry.name));

  const cardPromises = cardEntries.map(async (entry) => {
    const currentPath = join(entry.parentPath, entry.name);
    const parentFolder = resolve(entry.parentPath);
    const parent =
      parentFolder === root ? ROOT : basename(dirname(parentFolder));
    // A card folder reached through anything but a card's 'c' folder has no
    // parent to derive its path from, so the load refuses it by name.
    if (
      parent !== ROOT &&
      (basename(parentFolder) !== CHILDREN_FOLDER || !loadedKeys.has(parent))
    ) {
      throw new Error(
        `Card folder '${currentPath}' is not inside a card's '${CHILDREN_FOLDER}' folder`,
      );
    }

    const [cardContent, cardMetadata] = await Promise.all([
      fetchContent(currentPath),
      fetchMetadata(currentPath),
    ]);

    let metadata;
    try {
      metadata = JSON.parse(cardMetadata);
    } catch (error) {
      const metadataPath = join(currentPath, CARD_METADATA_FILE);
      logger.error(
        { error, metadataPath, tree: treeName },
        `Incorrect card metadata file`,
      );
      if (error instanceof Error) {
        throw new Error(
          `Invalid JSON in file '${metadataPath}': ${error.message}`,
          { cause: error },
        );
      }
      throw error;
    }

    return {
      key: entry.name,
      children: [],
      attachments: attachments.get(entry.name) ?? [],
      content: cardContent,
      metadata: normalizedMetadata(metadata),
      parent,
    };
  });

  return Promise.all(cardPromises);
}
