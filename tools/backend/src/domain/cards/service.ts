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
import { type CommandManager, evaluateMacros } from '@cyberismo/data-handler';
import { allCards, getCardDetails } from './lib.js';
import type { TreeOptions } from '../../types.js';

export async function getProjectInfo(commands: CommandManager) {
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
}

export async function updateCard(
  commands: CommandManager,
  key: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any,
) {
  const errors = [];

  if (body.state) {
    try {
      await commands.transitionCmd.cardTransition(key, body.state);
    } catch (error) {
      if (error instanceof Error) errors.push(error.message);
    }
  }

  if (body.content != null) {
    try {
      await commands.editCmd.editCardContent(key, body.content);
    } catch (error) {
      if (error instanceof Error) errors.push(error.message);
    }
  }

  if (body.metadata) {
    for (const [metadataKey, metadataValue] of Object.entries(body.metadata)) {
      const value = metadataValue as MetadataContent;

      try {
        await commands.editCmd.editCardMetadata(key, metadataKey, value);
      } catch (error) {
        if (error instanceof Error) errors.push(error.message);
      }
    }
  }

  if (body.parent) {
    try {
      await commands.moveCmd.moveCard(key, body.parent);
    } catch (error) {
      if (error instanceof Error) errors.push(error.message);
    }
  }
  if (body.index != null) {
    try {
      await commands.moveCmd.rankByIndex(key, body.index);
    } catch (error) {
      if (error instanceof Error) errors.push(error.message);
    }
  }

  if (errors.length > 0) {
    throw new Error(errors.join('\n'));
  }

  return await getCardDetails(commands, key);
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
  const succeeded = [];
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

  return {
    message: 'Attachments uploaded successfully',
    files: succeeded,
  };
}

export async function removeAttachment(
  commands: CommandManager,
  key: string,
  filename: string,
) {
  await commands.removeCmd.remove('attachment', key, filename);
  return { message: 'Attachment removed successfully' };
}

export async function openAttachment(
  commands: CommandManager,
  key: string,
  filename: string,
) {
  await commands.showCmd.openAttachment(key, filename);
  return { message: 'Attachment opened successfully' };
}

export async function parseContent(
  commands: CommandManager,
  key: string,
  content: string,
) {
  let asciidocContent = '';
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
}

export async function createLink(
  commands: CommandManager,
  key: string,
  toCard: string,
  linkType: string,
  description?: string,
) {
  await commands.createCmd.createLink(key, toCard, linkType, description);
  return { message: 'Link created successfully' };
}

export async function removeLink(
  commands: CommandManager,
  key: string,
  toCard: string,
  linkType: string,
  description?: string,
) {
  await commands.removeCmd.remove('link', key, toCard, linkType, description);
  return { message: 'Link removed successfully' };
}

export function getAttachment(
  commands: CommandManager,
  key: string,
  filename: string,
) {
  return commands.showCmd.showAttachment(key, filename);
}

/**
 * Used for exporting cards, thus static mode is assumed
 * @param commands
 * @param options options that
 * @returns
 */
export async function getAllCards(
  commands: CommandManager,
  options?: TreeOptions,
) {
  return allCards(commands, options);
}

export async function getAllAttachments(
  commands: CommandManager,
  options?: TreeOptions,
) {
  const cards = new Set<string>(
    (await getAllCards(commands, options)).map((c) => c.key),
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
