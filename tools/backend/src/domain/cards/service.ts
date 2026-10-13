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

import type { ExportPdfOptions, MetadataContent } from '@cyberismo/model';
import type { attachmentPayload } from '@cyberismo/data-handler';
import { type Workspace, evaluateMacros } from '@cyberismo/data-handler';
import { preprocessMermaidBlocksForHtml } from '@cyberismo/data-handler/utils/mermaid-renderer';
import { rewriteAsciidocCardXrefs } from '@cyberismo/data-handler/utils/asciidoc-xref';
import { allCards } from './lib.js';
import type { TreeOptions } from '../../types.js';

export async function getProjectInfo(ws: Workspace) {
  return ws.consistent(async () => {
    const projectResponse = await ws.showCmd.showProject();

    const workflowsResponse = await ws.showCmd.showWorkflowsWithDetails();
    if (!workflowsResponse) {
      throw new Error('No workflows found');
    }

    const cardTypesResponse = await ws.showCmd.showCardTypesWithDetails();
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
): Promise<boolean> {
  let written = false;
  await ws.atomic(async () => {
    if (body.state) {
      await ws.cards.transition(key, body.state);
      written = true;
    }
    if (body.content != null) {
      await ws.cards.edit(key, body.content);
      written = true;
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
        written = true;
      }
    }
    if (body.parent) {
      await ws.cards.move(key, body.parent);
      written = true;
    }
    if (body.index != null) {
      await ws.cards.rankAt(key, body.index);
      written = true;
    }
  }, `Update card ${key}`);
  return written;
}

export async function deleteCard(ws: Workspace, key: string) {
  await ws.cards.remove(key);
}

export async function createCard(
  ws: Workspace,
  template: string,
  parentKey?: string,
) {
  const result = await ws.createCmd.createCard(
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
    let asciidocContent: string;
    try {
      asciidocContent = await evaluateMacros(content, {
        context: 'localApp',
        mode: 'inject',
        checkout: ws.checkout,
        cardKey: key,
      });
    } catch (error) {
      asciidocContent = `Macro error: ${error instanceof Error ? error.message : 'Unknown error'}\n\n${content}`;
    }

    // Convert [mermaid] AsciiDoc blocks to passthrough HTML before asciidoctor processes them
    asciidocContent = preprocessMermaidBlocksForHtml(asciidocContent);

    // Rewrite native AsciiDoc xrefs that target other cards into
    // /projects/<prefix>/cards/<key> links.
    asciidocContent = rewriteAsciidocCardXrefs(
      asciidocContent,
      ws.checkout,
      'inject',
    );

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
): Promise<attachmentPayload> {
  validateAttachmentFileName(filename);
  return ws.showCmd.showAttachment(key, filename);
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
  const attachments = await ws.showCmd.showAttachments();
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
): Promise<Buffer> {
  const result = await ws.exportCmd.exportPdfBuffer(options);
  return result;
}
