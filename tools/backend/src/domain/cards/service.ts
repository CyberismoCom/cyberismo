// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type {
  AttachmentContent,
  Card,
  ExportPdfOptions,
  MetadataContent,
  QueryResult,
} from '@cyberismo/model';
import { AsciidoctorPdfError, type Workspace } from '@cyberismo/data-handler';
import { preprocessMermaidBlocksForHtml } from './mermaid.js';
import { allCards } from './lib.js';
import { getCardQueryResult } from '../../export.js';
import type { TreeOptions } from '../../types.js';

type RenderMode = 'inject' | 'staticSite';

export type CardRead<T> =
  { status: 200; data: T } | { status: 400; message: string };

// The key reaches the logic program unchecked; details() rejects unknown keys first.
async function cardOrNotFound(
  ws: Workspace,
  key: string,
): Promise<CardRead<Card>> {
  try {
    return { status: 200, data: await ws.cards.details(key) };
  } catch {
    return { status: 400, message: `Card ${key} not found from project` };
  }
}

async function renderAdoc(
  ws: Workspace,
  key: string,
  content: string,
  mode: RenderMode,
  fallback?: string,
): Promise<string> {
  let { content: asciidocContent } = await ws.render.macros(content, {
    context: mode === 'staticSite' ? 'exportedSite' : 'localApp',
    mode,
    cardKey: key,
    fallback,
  });

  // Convert [mermaid] AsciiDoc blocks to passthrough HTML before asciidoctor processes them
  asciidocContent = preprocessMermaidBlocksForHtml(asciidocContent);

  // Rewrite native AsciiDoc xrefs that target other cards into
  // /projects/<prefix>/cards/<key> links.
  return ws.render.xrefs(asciidocContent, mode);
}

export async function getCardData(
  ws: Workspace,
  key: string,
  staticMode: boolean,
): Promise<CardRead<QueryResult<'card'>>> {
  return ws.consistent(async () => {
    const found = await cardOrNotFound(ws, key);
    if (found.status !== 200) {
      return found;
    }
    const card = staticMode
      ? await getCardQueryResult(ws, key)
      : await ws.queries.runQuery('card', 'localApp', { cardKey: key });
    if (card.length !== 1) {
      throw new Error('Query failed. Check card-query syntax');
    }
    // Hidden fields stay off the static site; the card view never shows them.
    const data = staticMode
      ? { ...card[0], fields: card[0].fields.filter((f) => f.visibility) }
      : card[0];
    return { status: 200, data };
  });
}

export async function getCardContent(
  ws: Workspace,
  key: string,
  staticMode: boolean,
): Promise<CardRead<{ adocContent: string }>> {
  return ws.consistent(async () => {
    const found = await cardOrNotFound(ws, key);
    if (found.status !== 200) {
      return found;
    }
    const adocContent = await renderAdoc(
      ws,
      key,
      found.data.content || '',
      staticMode ? 'staticSite' : 'inject',
      '',
    );
    return { status: 200, data: { adocContent } };
  });
}

// The static site publishes no more of the stored card than its card view reads.
type StaticCardSource = Pick<Card, 'key' | 'path' | 'content' | 'attachments'>;

export async function getCardSource(
  ws: Workspace,
  key: string,
  staticMode: boolean,
): Promise<CardRead<Card | StaticCardSource>> {
  const found = await cardOrNotFound(ws, key);
  if (found.status !== 200 || !staticMode) {
    return found;
  }
  const card = found.data;
  return {
    status: 200,
    data: {
      key: card.key,
      path: card.path,
      content: card.content,
      attachments: card.attachments,
    },
  };
}

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
  return ws.consistent(async () => ({
    adocContent: await renderAdoc(ws, key, content, 'inject'),
  }));
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
