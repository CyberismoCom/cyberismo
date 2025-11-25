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

import { type Context, Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { getCardDetails } from './lib.js';
import * as cardService from './service.js';
import { isSSGContext, ssgParams } from 'hono/ssg';
import type { AppContext } from '../../types.js';

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
router.get('/', async (c) => {
  const commands = c.get('commands');

  try {
    const response = await cardService.getProjectInfo(commands);
    return c.json(response);
  } catch (error) {
    return c.text(
      `${error instanceof Error ? error.message : 'Unknown error'} from path ${c.get('projectPath')}`,
      500,
    );
  }
});

/**
 * @swagger
 * /api/cards/{key}:
 *   get:
 *     summary: Returns the full content of a specific card including calculations.
 *     description: The key parameter is the unique identifier ("cardKey") of the card. The response includes the content as asciidoc(editable) and parsed html, which also has macros already injected
 *     parameters:
 *       - name: key
 *         in: path
 *         required: true
 *         description: Card key (string)
 *       - name: raw
 *         in: query
 *         required: false
 *         schema:
 *           type: boolean
 *         description: When true, returns the raw card data without triggering calculations
 *     responses:
 *       200:
 *         description: Object containing card details. See lib/api/types.ts/CardResponse for the structure.
 *       400:
 *        description: No search key or card not found with given key
 *       500:
 *         description: project_path not set.
 */
router.get(
  '/:key',
  ssgParams(async (c: AppContext) => {
    const commands = c.get('commands');
    const opts = c.get('tree');
    const cards = await cardService.findAllCards(commands, opts);
    return cards.map((card) => ({ key: card.key }));
  }),
  async (c) => {
    const key = c.req.param('key');
    if (!key) {
      return c.text('No search key', 400);
    }

    const raw = c.req.query('raw');

    const result = await getCardDetails(
      c.get('commands'),
      key,
      isSSGContext(c),
      raw?.toLowerCase() === 'true' ? true : false,
    );
    if (result.status === 200) {
      return c.json(result.data);
    } else {
      return c.json(
        {
          error: result.message || 'Unknown error',
        },
        result.status as ContentfulStatusCode,
      );
    }
  },
);

/**
 * @swagger
 * /api/cards/{key}:
 *   patch:
 *     summary: Make changes to a card
 *     description: The key parameter is the unique identifier ("cardKey") of the card.
 *     parameters:
 *       - name: key
 *         in: path
 *         required: true
 *         description: Card key (string)
 *       - name: content
 *         in: body
 *         required: false
 *         description: New asciidoc content for the card. Must be a string.
 *       - name: metadata
 *         in: body
 *         type: object
 *         required: false
 *         description: New metadata for the card. Must be an object with key-value pairs.
 *       - name: raw
 *         in: query
 *         required: false
 *         schema:
 *           type: boolean
 *         description: When true, returns the raw card data without triggering calculations
 *     responses:
 *       200:
 *         description: Object containing card details, same as GET. See definitions.ts/CardDetails for the structure.
 *       207:
 *         description: Partial success. some updates failed, some succeeded. Returns card object with successful updates.
 *       400:
 *         description: Error. Card not found, all updates failed etc. Error message in response body.
 *       500:
 *         description: project_path not set.
 */
router.patch('/:key', async (c) => {
  const commands = c.get('commands');
  const key = c.req.param('key');
  if (!key) {
    return c.text('No search key', 400);
  }

  const raw = c.req.query('raw');

  const body = await c.req.json();

  try {
    await cardService.updateCard(commands, key, body);
    const result = await getCardDetails(
      c.get('commands'),
      key,
      isSSGContext(c),
      raw?.toLowerCase() === 'true' ? true : false,
    );
    if (result.status === 200) {
      return c.json(result.data);
    } else {
      return c.json(
        {
          error: result.message || 'Unknown error',
        },
        result.status as ContentfulStatusCode,
      );
    }
  } catch (error) {
    return c.text(
      error instanceof Error ? error.message : 'Unknown error',
      400,
    );
  }
});

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
router.delete('/:key', async (c) => {
  const commands = c.get('commands');
  const key = c.req.param('key');
  if (!key) {
    return c.text('No search key', 400);
  }

  try {
    await cardService.deleteCard(commands, key);
    return new Response(null, { status: 204 });
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      400,
    );
  }
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
router.post('/:key', async (c) => {
  const key = c.req.param('key');
  if (!key) {
    return c.text('No search key', 400);
  }

  const body = await c.req.json();
  if (!body.template) {
    return c.text('template is required', 400);
  }

  try {
    const result = await cardService.createCard(
      c.get('commands'),
      body.template,
      key,
    );
    return c.json(result);
  } catch (error) {
    if (error instanceof Error) {
      return c.json({ error: error.message }, 400);
    }
    return c.json({ error: 'Unknown error occurred' }, 500);
  }
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
router.post('/:key/attachments', async (c) => {
  const commands = c.get('commands');
  const key = c.req.param('key');

  try {
    const formData = await c.req.formData();
    const files = formData.getAll('files');
    if (!files || files.length === 0) {
      return c.json({ error: 'No files uploaded' }, 400);
    }

    const result = await cardService.uploadAttachments(
      commands,
      key,
      files as File[],
    );
    return c.json(result);
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to upload attachments',
      },
      500,
    );
  }
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
router.delete('/:key/attachments/:filename', async (c) => {
  const commands = c.get('commands');
  const { key, filename } = c.req.param();

  try {
    const result = await cardService.removeAttachment(commands, key, filename);
    return c.json(result);
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to remove attachment',
      },
      500,
    );
  }
});

/**
 * @swagger
 * /api/cards/{key}/attachments/{filename}/open:
 *   post:
 *     summary: Open an attachment using the system's default application
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
 *         description: Attachment opened successfully
 *       400:
 *         description: Invalid request
 *       500:
 *         description: Server error
 */
router.post('/:key/attachments/:filename/open', async (c) => {
  const commands = c.get('commands');
  const { key, filename } = c.req.param();

  try {
    const result = await cardService.openAttachment(commands, key, filename);
    return c.json(result);
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to open attachment',
      },
      500,
    );
  }
});

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
router.post('/:key/parse', async (c) => {
  const commands = c.get('commands');
  const key = c.req.param('key');
  const { content } = await c.req.json();

  if (content == null) {
    return c.json({ error: 'Content is required' }, 400);
  }

  try {
    const result = await cardService.parseContent(commands, key, content);
    return c.json(result);
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to parse content',
      },
      500,
    );
  }
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
router.post('/:key/links', async (c) => {
  const commands = c.get('commands');
  const key = c.req.param('key');
  const { toCard, linkType, description } = await c.req.json();

  if (!toCard || !linkType) {
    return c.json({ error: 'toCard and linkType are required' }, 400);
  }

  try {
    const result = await cardService.createLink(
      commands,
      key,
      toCard,
      linkType,
      description,
    );
    return c.json(result);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : 'Failed to create link',
      },
      500,
    );
  }
});

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
router.delete('/:key/links', async (c) => {
  const commands = c.get('commands');
  const key = c.req.param('key');
  const { toCard, linkType, description } = await c.req.json();

  if (!toCard || !linkType) {
    return c.json({ error: 'toCard and linkType are required' }, 400);
  }

  try {
    const result = await cardService.removeLink(
      commands,
      key,
      toCard,
      linkType,
      description,
    );
    return c.json(result);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : 'Failed to remove link',
      },
      500,
    );
  }
});

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
  ssgParams(async (c: Context) => {
    const commands = c.get('commands');
    return await cardService.findRelevantAttachments(commands, c.get('tree'));
  }),
  (c) => {
    const commands = c.get('commands');
    const { key, attachment } = c.req.param();
    const filename = decodeURI(attachment);

    if (!filename || !key) {
      return c.text('Missing cardKey or filename', 400);
    }

    try {
      const attachmentResponse = cardService.getAttachment(
        commands,
        key,
        filename,
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payload = attachmentResponse as any;

      return new Response(payload.fileBuffer, {
        headers: {
          'Content-Type': payload.mimeType,
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'no-store',
        },
      });
    } catch (error) {
      return c.json(
        {
          error:
            error instanceof Error
              ? error.message
              : `No attachment found from card ${key} and filename ${filename}`,
        },
        404,
      );
    }
  },
);

export default router;
