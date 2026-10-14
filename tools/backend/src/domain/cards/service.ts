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

import type {
  AttachmentContent,
  ExportPdfOptions,
  MetadataContent,
} from '@cyberismo/model';
import { AsciidoctorPdfError, type Workspace } from '@cyberismo/data-handler';
import { preprocessMermaidBlocksForHtml } from '@cyberismo/data-handler/utils/mermaid-renderer';
import { allCards } from './lib.js';
import type { TreeOptions } from '../../types.js';

export async function getProjectInfo(ws: Workspace) {
  return ws.consistent(async () => {
    const projectResponse = await ws.settings.info();

    const workflowsResponse = await ws.resources.contents('workflows');
    if (!workflowsResponse) {
      throw new Error('No workflows found');
    }

    const cardTypesResponse = await ws.resources.contents('cardTypes');
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
  ws: Workspace,
  key: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any,
): Promise<void> {
  await ws.atomic(async () => {
    if (body.state) {
      await ws.cards.transition(key, body.state);
    }
    if (body.content != null) {
      await ws.cards.edit(key, body.content);
    }
    if (body.metadata) {
      for (const [metadataKey, metadataValue] of Object.entries(
        body.metadata,
      )) {
        await ws.cards.editField(
          key,
          metadataKey,
          metadataValue as Exclude<MetadataContent, bigint>,
        );
      }
    }
    if (body.parent) {
      await ws.cards.move(key, body.parent);
    }
    if (body.index != null) {
      await ws.cards.rankAt(key, body.index);
    }
  }, `Update card ${key}`);
}

export async function deleteCard(ws: Workspace, key: string) {
  await ws.cards.remove(key);
}

export async function createCard(
  ws: Workspace,
  template: string,
  parentKey?: string,
) {
  const result = await ws.cards.create(
    template,
    parentKey === 'root' ? undefined : parentKey,
  );

  if (result.length === 0) {
    throw new Error('No cards created');
  }
  return result;
}

export async function uploadAttachments(
  ws: Workspace,
  key: string,
  files: File[],
) {
  const succeeded: string[] = [];
  await ws.atomic(async () => {
    for (const file of files) {
      if (file instanceof File) {
        const buffer = await file.arrayBuffer();
        await ws.cards.addAttachment(key, file.name, Buffer.from(buffer));
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
  ws: Workspace,
  key: string,
  filename: string,
) {
  validateAttachmentFileName(filename);
  await ws.cards.removeAttachment(key, filename);
  return { message: 'Attachment removed successfully' };
}

export async function parseContent(
  ws: Workspace,
  key: string,
  content: string,
) {
  return ws.consistent(async () => {
    let { content: asciidocContent } = await ws.render.macros(content, {
      context: 'localApp',
      mode: 'inject',
      cardKey: key,
    });

    // Convert [mermaid] AsciiDoc blocks to passthrough HTML before asciidoctor processes them
    asciidocContent = preprocessMermaidBlocksForHtml(asciidocContent);

    // Rewrite native AsciiDoc xrefs that target other cards into
    // /projects/<prefix>/cards/<key> links.
    asciidocContent = await ws.render.xrefs(asciidocContent, 'inject');

    return { adocContent: asciidocContent };
  });
}

export async function createLink(
  ws: Workspace,
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

  await ws.cards.addLink(source, destination, linkType, description, direction);

  return { message: 'Link created successfully' };
}

export async function removeLink(
  ws: Workspace,
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
  await ws.cards.removeLink(source, destination, linkType, description);
  return { message: 'Link removed successfully' };
}

export async function updateLink(
  ws: Workspace,
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
  return ws.atomic(async () => {
    await createLink(ws, key, toCard, linkType, direction, linkDescription);

    await removeLink(
      ws,
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
  ws: Workspace,
  key: string,
  filename: string,
): Promise<AttachmentContent> {
  validateAttachmentFileName(filename);
  return ws.cards.attachment(key, filename);
}

/**
 * Used for exporting cards, thus static mode is assumed
 * @param commandsthe command manager used for the query
 * @param options optional tree query options
 * @returns all cards in a flattened array
 */
export async function findAllCards(
  ws: Workspace,
  options?: TreeOptions,
): ReturnType<typeof allCards> {
  return allCards(ws, options);
}
/**
 * Gets all attachments that are required for rendering the wanted cards
 * @param ws the command manager used for the query
 * @param options optional tree query options
 * @returns all attachments for cards returned by the tree query
 */
export async function findRelevantAttachments(
  ws: Workspace,
  options?: TreeOptions,
) {
  const cards = new Set<string>(
    (await allCards(ws, options)).map((c) => c.key),
  );
  const attachments = await ws.cards.attachments();
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

export async function exportCard(
  ws: Workspace,
  options: ExportPdfOptions,
): Promise<Uint8Array> {
  try {
    return (await ws.export.pdf(options)).pdf;
  } catch (error) {
    // Diagnostics can carry server paths: logged here, never sent.
    if (error instanceof AsciidoctorPdfError) {
      console.error(error.message, error.diagnostics.join('\n'));
    }
    throw error;
  }
}
