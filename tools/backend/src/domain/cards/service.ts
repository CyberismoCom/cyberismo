// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type {
  AttachmentContent,
  Card,
  ExportPdfOptions,
  MetadataContent,
  QueryResult,
} from '@cyberismo/model';
import {
  AsciidoctorPdfError,
  type LinkEnd,
  type Workspace,
} from '@cyberismo/data-handler';
import { preprocessMermaidBlocksForHtml } from './mermaid.js';
import { allCards } from './lib.js';
import {
  addExportWarning,
  exportedKeys,
  getCardQueryResult,
} from '../../export.js';
import type { TreeOptions } from '../../types.js';

type RenderMode = 'inject' | 'staticSite';

async function renderAdoc(
  ws: Workspace,
  key: string,
  content: string,
  mode: RenderMode,
  fallback?: string,
  tree?: TreeOptions,
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
  // /projects/<prefix>/cards/<key> links. On the static site, an xref to a
  // card the site does not hold becomes text, and the warning is kept for the
  // export's result.
  if (mode === 'staticSite') {
    const prefix = ws.settings.prefix;
    return ws.render.xrefs(asciidocContent, mode, {
      exported: await exportedKeys(ws, tree),
      onWarning: (message) => addExportWarning(prefix, message),
    });
  }
  return ws.render.xrefs(asciidocContent, mode);
}

export async function getCardData(
  ws: Workspace,
  key: string,
  staticMode: boolean,
): Promise<QueryResult<'card'>> {
  return ws.consistent(async () => {
    // The key reaches the logic program unchecked; details() rejects unknown keys first.
    await ws.cards.details(key);
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
    return data;
  });
}

/** One solve for many cards; keys the project does not hold are left out. */
export async function getCardBatch(
  ws: Workspace,
  keys: string[],
): Promise<Record<string, QueryResult<'card'>>> {
  return ws.consistent(async () => {
    // The keys reach the logic program unchecked; only known ones go through.
    const cardKeys = [...new Set(keys)].filter((key) => ws.cards.has(key));
    // The card query reads an empty list as no list and answers every card.
    if (cardKeys.length === 0) {
      return {};
    }
    const cards = await ws.queries.runQuery('card', 'localApp', { cardKeys });
    return Object.fromEntries(cards.map((card) => [card.key, card]));
  });
}

export async function getCardContent(
  ws: Workspace,
  key: string,
  staticMode: boolean,
  tree?: TreeOptions,
): Promise<{ adocContent: string }> {
  return ws.consistent(async () => {
    const card = await ws.cards.details(key);
    const adocContent = await renderAdoc(
      ws,
      key,
      card.content || '',
      staticMode ? 'staticSite' : 'inject',
      '',
      tree,
    );
    return { adocContent };
  });
}

// The static site publishes no more of the stored card than its card view reads.
type StaticCardSource = Pick<Card, 'key' | 'path' | 'content' | 'attachments'>;

export async function getCardSource(
  ws: Workspace,
  key: string,
  staticMode: boolean,
): Promise<Card | StaticCardSource> {
  const card = await ws.cards.details(key);
  if (!staticMode) {
    return card;
  }
  return {
    key: card.key,
    path: card.path,
    content: card.content,
    attachments: card.attachments,
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

export async function editCardContent(
  ws: Workspace,
  key: string,
  content: string,
): Promise<void> {
  await ws.cards.edit(key, content);
}

export async function editCardField(
  ws: Workspace,
  key: string,
  field: string,
  value: Exclude<MetadataContent, bigint>,
): Promise<void> {
  await ws.cards.editField(key, field, value);
}

export async function transitionCard(
  ws: Workspace,
  key: string,
  transition: string,
): Promise<void> {
  await ws.cards.transition(key, transition);
}

export async function moveCard(
  ws: Workspace,
  key: string,
  parent: string,
  index?: number,
): Promise<void> {
  await ws.cards.move(key, parent, index);
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

export async function removeAttachment(
  ws: Workspace,
  key: string,
  filename: string,
) {
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
  link: LinkEnd,
  changed: LinkEnd,
) {
  await ws.cards.editLink(key, link, changed);
  return { message: 'Link updated successfully' };
}

export async function getAttachment(
  ws: Workspace,
  key: string,
  filename: string,
): Promise<AttachmentContent> {
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
 * Gets all attachments of the wanted cards, for copying into the static site
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
  return (await ws.cards.attachments())
    .filter(({ card }) => cards.has(card))
    .map(({ card, fileName }) => ({ key: card, fileName }));
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
