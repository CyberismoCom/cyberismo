/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2025
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import Processor from '@asciidoctor/core';
import { type MetadataContent } from '@cyberismo/data-handler/interfaces/project-interfaces';
import type { attachmentPayload } from '@cyberismo/data-handler/interfaces/request-status-interfaces';
import { type CommandManager, evaluateMacros } from '@cyberismo/data-handler';
import { allCards } from './lib.js';
import type { TreeOptions } from '../../types.js';

export async function getProjectInfo(commands: CommandManager) {
  return commands.consistent(async () => {
    const projectResponse = await commands.showCmd.showProject();

    const workflowsResponse = await commands.showCmd.showWorkflowsWithDetails();
    if (!workflowsResponse) {
      throw new Error('No workflows found');
    }

    const cardTypesResponse = await commands.showCmd.showCardTypesWithDetails();
    if (!cardTypesResponse) {
      throw new Error('No card types found');
    }

    return {
      name: projectResponse.name,
      prefix: projectResponse.prefix,
      workflows: workflowsResponse,
      cardTypes: cardTypesResponse,
    };
  });
}

export async function updateCard(
  commands: CommandManager,
  key: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any,
) {
  await commands.atomic(async () => {
    if (body.state) {
      await commands.transitionCmd.cardTransition(key, body.state);
    }
    if (body.content != null) {
      await commands.editCmd.editCardContent(key, body.content);
    }
    if (body.metadata) {
      for (const [metadataKey, metadataValue] of Object.entries(
        body.metadata,
      )) {
        await commands.editCmd.editCardMetadata(
          key,
          metadataKey,
          metadataValue as MetadataContent,
        );
      }
    }
    if (body.parent) {
      await commands.moveCmd.moveCard(key, body.parent);
    }
    if (body.index != null) {
      await commands.moveCmd.rankByIndex(key, body.index);
    }
  }, `Update card ${key}`);
}

export async function deleteCard(commands: CommandManager, key: string) {
  await commands.removeCmd.remove('card', key);
}

export async function createCard(
  commands: CommandManager,
  template: string,
  parentKey?: string,
) {
  const result = await commands.createCmd.createCard(
    template,
    parentKey === 'root' ? undefined : parentKey,
  );

  if (result.length === 0) {
    throw new Error('No cards created');
  }
  return result;
}

export async function uploadAttachments(
  commands: CommandManager,
  key: string,
  files: File[],
) {
  const succeeded: string[] = [];
  await commands.atomic(async () => {
    for (const file of files) {
      if (file instanceof File) {
        const buffer = await file.arrayBuffer();
        await commands.createCmd.createAttachment(
          key,
          file.name,
          Buffer.from(buffer),
        );
        succeeded.push(file.name);
      }
    }
  }, `Add attachments to ${key}`);

  return {
    message: 'Attachments uploaded successfully',
    files: succeeded,
  };
}

function validateAttachmentFileName(filename: string): void {
  const decoded = decodeURIComponent(filename);
  if (/(^|[/\\])\.\.([/\\]|$)/.test(decoded)) {
    throw new Error('Invalid attachment filename');
  }
}

export async function removeAttachment(
  commands: CommandManager,
  key: string,
  filename: string,
) {
  validateAttachmentFileName(filename);
  await commands.removeCmd.remove('attachment', key, filename);
  return { message: 'Attachment removed successfully' };
}

export async function openAttachment(
  commands: CommandManager,
  key: string,
  filename: string,
) {
  validateAttachmentFileName(filename);
  await commands.showCmd.openAttachment(key, filename);
  return { message: 'Attachment opened successfully' };
}

export async function parseContent(
  commands: CommandManager,
  key: string,
  content: string,
) {
  return commands.consistent(async () => {
    let asciidocContent: string;
    try {
      asciidocContent = await evaluateMacros(content, {
        context: 'localApp',
        mode: 'inject',
        project: commands.project,
        cardKey: key,
      });
    } catch (error) {
      asciidocContent = `Macro error: ${error instanceof Error ? error.message : 'Unknown error'}\n\n${content}`;
    }

    const processor = Processor();
    const parsedContent = processor
      .convert(asciidocContent, {
        safe: 'safe',
        attributes: {
          imagesdir: `/api/cards/${key}/a`,
          icons: 'font',
        },
      })
      .toString();

    return { parsedContent };
  });
}

export async function createLink(
  commands: CommandManager,
  key: string,
  target: string,
  linkType: string,
  direction: 'outbound' | 'inbound' = 'outbound',
  description?: string,
) {
  // For outbound: key is source, target is destination
  // For inbound: target is source, key is destination
  const source = direction === 'outbound' ? key : target;
  const destination = direction === 'outbound' ? target : key;

  await commands.createCmd.createLink(
    source,
    destination,
    linkType,
    description,
    direction,
  );

  return { message: 'Link created successfully' };
}

export async function removeLink(
  commands: CommandManager,
  key: string,
  target: string,
  linkType: string,
  direction: 'outbound' | 'inbound' = 'outbound',
  description?: string,
) {
  // For outbound: key is source, target is destination
  // For inbound: target is source, key is destination
  const source = direction === 'outbound' ? key : target;
  const destination = direction === 'outbound' ? target : key;
  await commands.removeCmd.remove(
    'link',
    source,
    destination,
    linkType,
    description,
  );
  return { message: 'Link removed successfully' };
}

export async function updateLink(
  commands: CommandManager,
  key: string,
  toCard: string,
  linkType: string,
  direction: 'outbound' | 'inbound',
  previousToCard: string,
  previousLinkType: string,
  previousDirection: 'outbound' | 'inbound',
  linkDescription?: string,
  previousLinkDescription?: string,
) {
  // For simplicity create the new link first so that duplicate-link validation runs before
  // the old link is removed. This also handles direction changes.
  return commands.atomic(async () => {
    await createLink(
      commands,
      key,
      toCard,
      linkType,
      direction,
      linkDescription,
    );

    await removeLink(
      commands,
      key,
      previousToCard,
      previousLinkType,
      previousDirection,
      previousLinkDescription,
    );

    return { message: 'Link updated successfully' };
  }, `Update link on ${key} to ${toCard}`);
}

export async function getAttachment(
  commands: CommandManager,
  key: string,
  filename: string,
): Promise<attachmentPayload> {
  validateAttachmentFileName(filename);
  return commands.showCmd.showAttachment(key, filename);
}

/**
 * Used for exporting cards, thus static mode is assumed
 * @param commandsthe command manager used for the query
 * @param options optional tree query options
 * @returns all cards in a flattened array
 */
export async function findAllCards(
  commands: CommandManager,
  options?: TreeOptions,
): ReturnType<typeof allCards> {
  return allCards(commands, options);
}
/**
 * Gets all attachments that are required for rendering the wanted cards
 * @param commands the command manager used for the query
 * @param options optional tree query options
 * @returns all attachments for cards returned by the tree query
 */
export async function findRelevantAttachments(
  commands: CommandManager,
  options?: TreeOptions,
) {
  const cards = new Set<string>(
    (await allCards(commands, options)).map((c) => c.key),
  );
  const attachments = await commands.showCmd.showAttachments();
  return attachments
    .filter(
      (attachment) =>
        cards.has(attachment.card) && attachment.mimeType?.startsWith('image/'),
    )
    .map((attachment) => ({
      key: attachment.card,
      attachment: attachment.fileName,
    }));
}
