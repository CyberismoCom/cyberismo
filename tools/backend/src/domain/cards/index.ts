// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { Hono } from 'hono';
import * as cardService from './service.js';
import { isSSGContext, ssgParams } from 'hono/ssg';
import type { AppContext } from '../../types.js';
import { UserRole } from '../../types.js';
import { requireRole } from '../../middleware/auth.js';
import { zValidator } from '../../middleware/zvalidator.js';
import {
  attachmentParamSchema,
  cardKeyParamSchema,
  createLinkSchema,
  editContentSchema,
  editFieldSchema,
  moveCardSchema,
  transitionSchema,
  removeLinkSchema,
  updateLinkSchema,
  exportCardPdfSchema,
  cardBatchSchema,
  type ExportCardPdfRequestBody,
} from './schema.js';

const router = new Hono();

/**
 * @swagger
 * /api/cards:
 *   get:
 *     summary: Returns a list of all cards and their children in the defined project.
 *     description: List of cards does not include the content of the cards, only basic metadata. Use the /api/cards/{key} endpoint to get the content of a specific card.
 *     responses:
 *       200:
 *         description: Object containing the project cards. See definitions.ts/Card for the structure.
 *       400:
 *         description: Error in reading project details.
 *       500:
 *         description: project_path not set.
 */
router.get('/', requireRole(UserRole.Reader), async (c) => {
  const ws = c.get('ws');

  const response = await cardService.getProjectInfo(ws);
  return c.json(response);
});

/**
 * @swagger
 * /api/cards/export-pdf:
 *   post:
 *     summary: Export a card as a PDF
 *     description: Exports the specified card as a PDF
 *     parameters:
 *       - name: key
 *         in: path
 *         required: true
 *         description: Card key (string)
 *    requestBody:
 *      content:
 *       application/json:
 *        schema:
 *        type: object
 *       properties:
 *        title:
 *         type: string
 *       description: Title of the exported PDF
 *       name:
 *         type: string
 *       description: Name of the exported PDF
 *       exportChildCards:
 *         type: boolean
 *       description: Whether to export child cards
 *       includeHidden:
 *         type: boolean
 *       description: Whether to export hidden cards too, left out of the table of contents (optional)
 *       version:
 *         type: string
 *       description: Version of the exported PDF (optional)
 *     responses:
 *       200:
 *         description: Card exported successfully
 *       400:
 *         description: Missing or invalid parameters.
 *       500:
 *         description: project_path not set
 */
router.post(
  '/export-pdf',
  requireRole(UserRole.Reader),
  zValidator('json', exportCardPdfSchema),
  async (c) => {
    const ws = c.get('ws');
    const body = (await c.req.json()) as ExportCardPdfRequestBody;
    const result = await cardService.exportCard(ws, {
      cardKey: body.cardKey,
      title: body.title,
      name: body.name,
      recursive: body.exportChildCards,
      includeHidden: body.includeHidden,
      version: body.version,
    });
    return new Response(result, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Cache-Control': 'no-store',
      },
    });
  },
);

/**
 * @swagger
 * /api/cards/batch:
 *   post:
 *     summary: Returns the card query results of many cards in one solve.
 *     description: Keys the project does not hold are left out of the response. Not served on the static site.
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               keys:
 *                 type: array
 *                 items:
 *                   type: string
 *                 minItems: 1
 *                 maxItems: 100
 *     responses:
 *       200:
 *         description: Object of card key to QueryResult<'card'>.
 *       400:
 *         description: Missing keys or more than 100 keys.
 */
router.post(
  '/batch',
  requireRole(UserRole.Reader),
  zValidator('json', cardBatchSchema),
  async (c) => {
    const { keys } = c.req.valid('json');
    return c.json(await cardService.getCardBatch(c.get('ws'), keys));
  },
);

const cardKeyParams = ssgParams(async (c: AppContext) => {
  const ws = c.get('ws');
  const opts = c.get('tree');
  const cards = await cardService.findAllCards(ws, opts);
  return cards.map((card) => ({ key: card.key }));
});

/**
 * @swagger
 * /api/cards/{key}:
 *   get:
 *     summary: Returns the card query result of a specific card.
 *     description: The key parameter is the unique identifier ("cardKey") of the card. The response holds the calculated card data only; use /content for the rendered content and /source for the stored card.
 *     parameters:
 *       - name: key
 *         in: path
 *         required: true
 *         description: Card key (string)
 *     responses:
 *       200:
 *         description: The card query result. See QueryResult<'card'> in @cyberismo/model.
 *       400:
 *        description: No search key
 *       404:
 *        description: Card not found with given key
 *       500:
 *         description: project_path not set.
 */
router.get(
  '/:key',
  requireRole(UserRole.Reader),
  cardKeyParams,
  zValidator('param', cardKeyParamSchema),
  async (c) => {
    const { key } = c.req.valid('param');
    return c.json(
      await cardService.getCardData(c.get('ws'), key, isSSGContext(c)),
    );
  },
);

/**
 * @swagger
 * /api/cards/{key}/content:
 *   get:
 *     summary: Returns the content of a specific card as AsciiDoc with its macros evaluated.
 *     parameters:
 *       - name: key
 *         in: path
 *         required: true
 *         description: Card key (string)
 *     responses:
 *       200:
 *         description: Object with adocContent.
 *       400:
 *        description: No search key
 *       404:
 *        description: Card not found with given key
 */
router.get(
  '/:key/content',
  requireRole(UserRole.Reader),
  cardKeyParams,
  zValidator('param', cardKeyParamSchema),
  async (c) => {
    const { key } = c.req.valid('param');
    return c.json(
      await cardService.getCardContent(
        c.get('ws'),
        key,
        isSSGContext(c),
        c.get('tree'),
      ),
    );
  },
);

/**
 * @swagger
 * /api/cards/{key}/source:
 *   get:
 *     summary: Returns a specific card as stored, with its unevaluated content, metadata and attachments.
 *     parameters:
 *       - name: key
 *         in: path
 *         required: true
 *         description: Card key (string)
 *     responses:
 *       200:
 *         description: The stored card. See Card in @cyberismo/model.
 *       400:
 *        description: No search key
 *       404:
 *        description: Card not found with given key
 */
router.get(
  '/:key/source',
  requireRole(UserRole.Reader),
  cardKeyParams,
  zValidator('param', cardKeyParamSchema),
  async (c) => {
    const { key } = c.req.valid('param');
    return c.json(
      await cardService.getCardSource(c.get('ws'), key, isSSGContext(c)),
    );
  },
);

/**
 * @swagger
 * /api/cards/{key}/content:
 *   put:
 *     summary: Replaces the AsciiDoc content of a card
 *     parameters:
 *       - name: key
 *         in: path
 *         required: true
 *         description: Card key (string)
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               content:
 *                 type: string
 *     responses:
 *       200:
 *         description: The updated card query result, same as GET /api/cards/{key}.
 *       400:
 *         description: Invalid request body, or the content cannot be edited.
 *       404:
 *         description: Card not found with given key
 */
router.put(
  '/:key/content',
  requireRole(UserRole.Editor),
  zValidator('param', cardKeyParamSchema),
  zValidator('json', editContentSchema),
  async (c) => {
    const ws = c.get('ws');
    const { key } = c.req.valid('param');
    const { content } = c.req.valid('json');

    await cardService.editCardContent(ws, key, content);
    return c.json(await cardService.getCardData(ws, key, isSSGContext(c)));
  },
);

/**
 * @swagger
 * /api/cards/{key}/fields:
 *   patch:
 *     summary: Changes a metadata field of a card
 *     description: Setting a custom field to null or an empty string clears it.
 *     parameters:
 *       - name: key
 *         in: path
 *         required: true
 *         description: Card key (string)
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [field, value]
 *             additionalProperties: false
 *             properties:
 *               field:
 *                 type: string
 *                 description: Name of the field
 *               value:
 *                 description: New value; a string, number, boolean, array of strings or null
 *                 nullable: true
 *                 oneOf:
 *                   - type: string
 *                   - type: number
 *                   - type: boolean
 *                   - type: array
 *                     items:
 *                       type: string
 *     responses:
 *       200:
 *         description: The updated card query result, same as GET /api/cards/{key}.
 *       400:
 *         description: Invalid request body, or the value is not valid for the field.
 *       404:
 *         description: Card not found with given key
 */
router.patch(
  '/:key/fields',
  requireRole(UserRole.Editor),
  zValidator('param', cardKeyParamSchema),
  zValidator('json', editFieldSchema),
  async (c) => {
    const ws = c.get('ws');
    const { key } = c.req.valid('param');

    const { field, value } = c.req.valid('json');

    await cardService.editCardField(ws, key, field, value);
    return c.json(await cardService.getCardData(ws, key, isSSGContext(c)));
  },
);

/**
 * @swagger
 * /api/cards/{key}/transition:
 *   post:
 *     summary: Transitions a card to a new workflow state
 *     parameters:
 *       - name: key
 *         in: path
 *         required: true
 *         description: Card key (string)
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               transition:
 *                 type: string
 *                 description: Name of the workflow transition to do
 *     responses:
 *       200:
 *         description: The updated card query result, same as GET /api/cards/{key}.
 *       400:
 *         description: Invalid request body, or the transition is not possible.
 *       404:
 *         description: Card not found with given key
 */
router.post(
  '/:key/transition',
  requireRole(UserRole.Editor),
  zValidator('param', cardKeyParamSchema),
  zValidator('json', transitionSchema),
  async (c) => {
    const ws = c.get('ws');
    const { key } = c.req.valid('param');
    const { transition } = c.req.valid('json');

    await cardService.transitionCard(ws, key, transition);
    return c.json(await cardService.getCardData(ws, key, isSSGContext(c)));
  },
);

/**
 * @swagger
 * /api/cards/{key}/move:
 *   post:
 *     summary: Moves a card under a parent, optionally to a position
 *     description: Moving a card to its own parent only changes its position.
 *     parameters:
 *       - name: key
 *         in: path
 *         required: true
 *         description: Card key (string)
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               parent:
 *                 type: string
 *                 description: New parent card; 'root' for the root of the card's own container, or 'root:project' / 'root:<template>'
 *               index:
 *                 type: integer
 *                 description: Position among the new siblings; 0 is first. Last if left out.
 *     responses:
 *       200:
 *         description: The updated card query result, same as GET /api/cards/{key}.
 *       400:
 *         description: Invalid request body, or the card cannot be moved there.
 *       404:
 *         description: Card not found with given key
 */
router.post(
  '/:key/move',
  requireRole(UserRole.Editor),
  zValidator('param', cardKeyParamSchema),
  zValidator('json', moveCardSchema),
  async (c) => {
    const ws = c.get('ws');
    const { key } = c.req.valid('param');
    const { parent, index } = c.req.valid('json');

    await cardService.moveCard(ws, key, parent, index);
    return c.json(await cardService.getCardData(ws, key, isSSGContext(c)));
  },
);

/**
 * @swagger
 * /api/cards/{key}:
 *   delete:
 *      summary: Delete a card
 *      description: The key parameter is the unique identifier ("cardKey") of the card.
 *      parameters:
 *       - name: key
 *         in: path
 *         required: true
 *         description: Card key (string)
 *
 *     responses:
 *       204:
 *         description: Card deleted successfully.
 *       400:
 *         description: Error. Card not found. Error message in response body.
 *       500:
 *         description: project_path not set.
 */
router.delete('/:key', requireRole(UserRole.Editor), async (c) => {
  const ws = c.get('ws');
  const key = c.req.param('key');
  if (!key) {
    return c.text('No search key', 400);
  }

  await cardService.deleteCard(ws, key);
  return new Response(null, { status: 204 });
});

/**
 * @swagger
 * /api/cards/{key}:
 *   post:
 *     summary: Create a new card
 *     description: Creates a new card using the specified template. If key is 'root', creates at root level.
 *     parameters:
 *       - name: key
 *         in: path
 *         required: true
 *         description: Card key (string)
 *       - name: template
 *         in: body
 *         required: true
 *         description: Template to use for creating the card
 *     responses:
 *       200:
 *         description: Card created successfully
 *       400:
 *         description: Error creating card or missing template
 *       500:
 *         description: project_path not set
 */
router.post('/:key', requireRole(UserRole.Editor), async (c) => {
  const key = c.req.param('key');
  if (!key) {
    return c.text('No search key', 400);
  }

  const body = await c.req.json();
  if (!body.template) {
    return c.text('template is required', 400);
  }

  const result = await cardService.createCard(c.get('ws'), body.template, key);
  return c.json(result);
});

/**
 * @swagger
 * /api/cards/{key}/attachments:
 *   post:
 *     summary: Upload attachments to a card
 *     parameters:
 *       - name: key
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       200:
 *         description: Attachments uploaded successfully
 *       400:
 *         description: Invalid request
 *       500:
 *         description: Server error
 */
router.post('/:key/attachments', requireRole(UserRole.Editor), async (c) => {
  const ws = c.get('ws');
  const key = c.req.param('key');

  const formData = await c.req.formData();
  const files = formData.getAll('files');
  if (!files || files.length === 0) {
    return c.json({ error: 'No files uploaded' }, 400);
  }

  const result = await cardService.uploadAttachments(ws, key, files as File[]);
  return c.json(result);
});

/**
 * @swagger
 * /api/cards/{key}/attachments/{filename}:
 *   delete:
 *     summary: Remove an attachment from a card
 *     parameters:
 *       - name: key
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: filename
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Attachment removed successfully
 *       400:
 *         description: Invalid request
 *       500:
 *         description: Server error
 */
router.delete(
  '/:key/attachments/:filename',
  requireRole(UserRole.Editor),
  async (c) => {
    const ws = c.get('ws');
    const { key, filename } = c.req.param();

    const result = await cardService.removeAttachment(ws, key, filename);
    return c.json(result);
  },
);

/**
 * @swagger
 * /api/cards/{key}/parse:
 *   post:
 *     summary: Parse card content
 *     parameters:
 *       - name: key
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               content:
 *                 type: string
 *     responses:
 *       200:
 *         description: Content parsed successfully
 *       400:
 *         description: Invalid request
 *       500:
 *         description: Server error
 */
router.post('/:key/parse', requireRole(UserRole.Reader), async (c) => {
  const ws = c.get('ws');
  const key = c.req.param('key');
  const { content } = await c.req.json();

  if (content == null) {
    return c.json({ error: 'Content is required' }, 400);
  }

  const result = await cardService.parseContent(ws, key, content);
  return c.json(result);
});

/**
 * @swagger
 * /api/cards/{key}/links:
 *   post:
 *     summary: Create a link between cards
 *     parameters:
 *       - name: key
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               toCard:
 *                 type: string
 *               linkType:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Link created successfully
 *       400:
 *         description: Invalid request
 *       500:
 *         description: Server error
 */
router.post(
  '/:key/links',
  requireRole(UserRole.Editor),
  zValidator('json', createLinkSchema),
  async (c) => {
    const ws = c.get('ws');
    const key = c.req.param('key');
    const { toCard, linkType, description, direction } = c.req.valid('json');

    const result = await cardService.createLink(
      ws,
      key,
      toCard,
      linkType,
      direction,
      description,
    );
    return c.json(result);
  },
);

/**
 * @swagger
 * /api/cards/{key}/links:
 *   delete:
 *     summary: Remove a link between cards
 *     parameters:
 *       - name: key
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               toCard:
 *                 type: string
 *               linkType:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Link removed successfully
 *       400:
 *         description: Invalid request
 *       500:
 *         description: Server error
 */
router.delete(
  '/:key/links',
  requireRole(UserRole.Editor),
  zValidator('json', removeLinkSchema),
  async (c) => {
    const ws = c.get('ws');
    const key = c.req.param('key');
    const { toCard, linkType, description, direction } = c.req.valid('json');

    const result = await cardService.removeLink(
      ws,
      key,
      toCard,
      linkType,
      direction,
      description,
    );
    return c.json(result);
  },
);

/**
 * @swagger
 * /api/cards/{key}/links:
 *   put:
 *     summary: Update a link between cards
 *     parameters:
 *       - name: key
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               toCard:
 *                 type: string
 *               linkType:
 *                 type: string
 *               description:
 *                 type: string
 *               direction:
 *                 type: string
 *               previousToCard:
 *                 type: string
 *               previousLinkType:
 *                 type: string
 *               previousDirection:
 *                 type: string
 *               previousDescription:
 *                 type: string
 *     responses:
 *       200:
 *         description: Link updated successfully
 *       400:
 *         description: Invalid request
 *       500:
 *         description: Server error
 */
router.put(
  '/:key/links',
  requireRole(UserRole.Editor),
  zValidator('json', updateLinkSchema),
  async (c) => {
    const ws = c.get('ws');
    const key = c.req.param('key');

    const {
      toCard,
      linkType,
      description,
      direction,
      previousToCard,
      previousLinkType,
      previousDirection,
      previousDescription,
    } = c.req.valid('json');

    const result = await cardService.updateLink(
      ws,
      key,
      {
        target: previousToCard,
        linkType: previousLinkType,
        direction: previousDirection,
        linkDescription: previousDescription,
      },
      { target: toCard, linkType, direction, linkDescription: description },
    );
    return c.json(result);
  },
);

/**
 * @swagger
 * /api/cards/{key}/a/{attachment}:
 *   get:
 *     summary: Returns an attachment file for a specific card.
 *     parameters:
 *       - name: key
 *         in: path
 *         required: true
 *         description: Card key (string)
 *       - name: attachment
 *         in: path
 *         required: true
 *         description: file name of the attachment
 *     responses:
 *       200:
 *         description: Attachment object as a file buffer, content-type set to the mime type of the file
 *       400:
 *         description: No search key or card not found with given key
 *       404:
 *         description: Attachment file not found
 *       500:
 *         description: project_path not set.
 */
router.get(
  '/:key/a/:attachment',
  requireRole(UserRole.Reader),
  zValidator('param', attachmentParamSchema),
  async (c) => {
    const ws = c.get('ws');
    const { key, attachment } = c.req.valid('param');
    const filename = decodeURI(attachment);

    const attachmentResponse = await cardService.getAttachment(
      ws,
      key,
      filename,
    );
    return new Response(attachmentResponse.fileBuffer, {
      headers: {
        'Content-Type': attachmentResponse.mimeType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  },
);
export default router;
