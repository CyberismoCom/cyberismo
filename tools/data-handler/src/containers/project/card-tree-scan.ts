/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

// node
import type { Dirent } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { readdir, readFile } from 'node:fs/promises';

import type {
  CardMetadata,
  MetadataContent,
} from '../../interfaces/project-interfaces.js';
import { CardNameRegEx } from '../../interfaces/project-interfaces.js';
import { getChildLogger } from '../../utils/log-utils.js';
import { ROOT } from '../../utils/constants.js';

// A card's own files, inside its folder.
export const CARD_CONTENT_FILE = 'index.adoc';
export const CARD_METADATA_FILE = 'index.json';
// A card's attachment folder, inside its folder.
export const ATTACHMENT_FOLDER = 'a';
// A card's children live in this folder, inside its folder.
export const CHILDREN_FOLDER = 'c';

// An attachment as the tree stores it: the file's name, and the folder it
// sits in relative to its card's attachment folder (empty for the common
// case). Its full path is derived from its card's.
export interface StoredAttachment {
  fileName: string;
  dir: string;
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
  root: string,
): Map<string, StoredAttachment[]> {
  const attachments = new Map<string, StoredAttachment[]>();
  const seen = new Set<string>();

  for (const entry of allEntries) {
    const owner = attachmentOwner(entry, cardFolders, root);
    if (!owner) {
      continue;
    }
    const dir = relative(owner.attachmentFolder, entry.parentPath);
    const attachmentKey = `${owner.cardKey}:${dir}:${entry.name}`;
    if (seen.has(attachmentKey)) {
      logger.warn(
        `Duplicate attachment found during cache population: ${entry.name} for card ${owner.cardKey}`,
      );
      continue;
    }
    seen.add(attachmentKey);
    const attachment: StoredAttachment = { fileName: entry.name, dir };
    const listing = attachments.get(owner.cardKey);
    if (listing) {
      listing.push(attachment);
    } else {
      attachments.set(owner.cardKey, [attachment]);
    }
  }

  return attachments;
}

// Which card an entry is an attachment of: walks the entry's folder up to
// the tree root looking for an attachment folder that belongs to a card.
// Returns undefined when the entry is not inside one.
function attachmentOwner(
  entry: Dirent,
  cardFolders: Map<string, string>,
  root: string,
): { cardKey: string; attachmentFolder: string } | undefined {
  let folder = resolve(entry.parentPath);
  while (folder !== root) {
    const parent = dirname(folder);
    if (parent === folder) {
      return undefined;
    }
    if (basename(folder) === ATTACHMENT_FOLDER) {
      const cardKey = cardFolders.get(parent);
      if (cardKey) {
        return { cardKey, attachmentFolder: folder };
      }
    }
    folder = parent;
  }
  return undefined;
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
  const attachments = attachmentsByCard(allEntries, cardFolders, root);
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
