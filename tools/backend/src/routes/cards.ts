/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import express, { Router } from 'express';
import Processor from '@asciidoctor/core';
import {
  CardLocation,
  MetadataContent,
  ProjectFetchCardDetails,
  ProjectMetadata,
} from '@cyberismocom/data-handler/interfaces/project-interfaces';
import { evaluateMacros } from '@cyberismocom/data-handler';
import multer from 'multer';

const storage = multer.memoryStorage();
const upload = multer({ storage });

const router: Router = express.Router();
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
router.get('/', async (req, res) => {
  const commands = req.commands;

  const projectResponse = await commands.showCmd.showProject();

  const workflowsResponse = await commands.showCmd.showWorkflowsWithDetails();
  if (!workflowsResponse) {
    throw new Error(`No workflows found from path ${req.projectPath}`);
  }

  const cardTypesResponse = await commands.showCmd.showCardTypesWithDetails();
  if (!cardTypesResponse) {
    throw new Error(`No card types found from path ${req.projectPath}`);
  }

  const cardsResponse = await commands.showCmd.showProjectCards();

  if (!cardsResponse) {
    throw new Error(`No cards found from path ${req.projectPath}`);
  }

  const response = {
    name: (projectResponse! as any).name,
    cards: cardsResponse,
    workflows: workflowsResponse,
    cardTypes: cardTypesResponse,
  };
  return res.json(response);
});

async function getCardDetails(commands: any, key: string): Promise<any> {
  const fetchCardDetails: ProjectFetchCardDetails = {
    attachments: true,
    children: false,
    content: true,
    contentType: 'adoc',
    metadata: false,
    parent: false,
    location: CardLocation.projectOnly,
  };

  const cardDetailsResponse = await commands.showCmd.showCardDetails(
    fetchCardDetails,
    key,
  );

  if (!cardDetailsResponse) {
    return { status: 400, message: `Card ${key} not found from project` };
  }

  let asciidocContent = '';
  try {
    asciidocContent = await evaluateMacros(cardDetailsResponse.content || '', {
      mode: 'inject',
      projectPath: process.env.npm_config_project_path || '',
      cardKey: key,
    });
  } catch (error) {
    asciidocContent = `Macro error: ${error instanceof Error ? error.message : 'Unknown error'}\n\n${asciidocContent}`;
  }

  const htmlContent = Processor()
    .convert(asciidocContent, {
      safe: 'safe',
      attributes: {
        imagesdir: `/api/cards/${key}/a`,
        icons: 'font',
      },
    })
    .toString();

  // always parse for now
  await commands.calculateCmd.generate();

  const card = await commands.calculateCmd.runQuery('card', {
    cardKey: key,
  });

  if (card.length !== 1) {
    throw new Error('Query failed. Check card-query syntax');
  }

  return {
    status: 200,
    data: {
      ...card[0],
      rawContent: cardDetailsResponse.content || '',
      parsedContent: htmlContent,
      attachments: cardDetailsResponse.attachments,
    },
  };
}

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
 *     responses:
 *       200:
 *         description: Object containing card details. See lib/api/types.ts/CardResponse for the structure.
 *       400:
 *        description: No search key or card not found with given key
 *       500:
 *         description: project_path not set.
 */
router.get('/:key', async (req, res) => {
  const key = req.params.key;
  if (!key) {
    return res.status(400).send('No search key');
  }

  const result = await getCardDetails(req.commands, key);
  if (result.status === 200) {
    return res.json(result.data);
  } else {
    return res.status(result.status).send(result.message);
  }
});

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
router.patch('/:key', async (req, res) => {
  const commands = req.commands;
  const key = req.params.key;
  if (!key) {
    return res.status(400).send('No search key');
  }

  const body = req.body;
  let successes = 0;
  const errors = [];

  if (body.state) {
    try {
      await commands.transitionCmd.cardTransition(key, body.state);
      successes++;
    } catch (error) {
      if (error instanceof Error) errors.push(error.message);
    }
  }

  if (body.content != null) {
    try {
      await commands.editCmd.editCardContent(key, body.content);
      successes++;
    } catch (error) {
      if (error instanceof Error) errors.push(error.message);
    }
  }

  if (body.metadata) {
    for (const [metadataKey, metadataValue] of Object.entries(body.metadata)) {
      const value = metadataValue as MetadataContent;

      try {
        await commands.editCmd.editCardMetadata(key, metadataKey, value);
        successes++;
      } catch (error) {
        if (error instanceof Error) errors.push(error.message);
      }
    }
  }

  if (body.parent) {
    try {
      await commands.moveCmd.moveCard(key, body.parent);
      successes++;
    } catch (error) {
      if (error instanceof Error) errors.push(error.message);
    }
  }
  if (body.index != null) {
    try {
      await commands.moveCmd.rankByIndex(key, body.index);
      successes++;
    } catch (error) {
      if (error instanceof Error) errors.push(error.message);
    }
  }

  if (errors.length > 0) {
    return res.status(400).send(errors.join('\n'));
  }

  const result = await getCardDetails(commands, key);
  if (result.status === 200) {
    return res.json(result.data);
  } else {
    return res.status(result.status).send(result.message);
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
router.delete('/:key', async (req, res) => {
  const commands = req.commands;
  const key = req.params.key;
  if (!key) {
    return res.status(400).send('No search key');
  }

  try {
    await commands.removeCmd.remove('card', key);
    return res.status(204).send();
  } catch (error) {
    return res
      .status(400)
      .send(error instanceof Error ? error.message : 'Unknown error');
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
router.post('/:key', async (req, res) => {
  const projectPath = process.env.npm_config_project_path;
  if (!projectPath) {
    return res.status(500).send('project_path not set');
  }

  const key = req.params.key;
  if (!key) {
    return res.status(400).send('No search key');
  }

  if (!req.body.template) {
    return res.status(400).send('template is required');
  }

  try {
    const result = await req.commands.createCmd.createCard(
      req.body.template,
      key === 'root' ? undefined : key,
    );
    return res.json(result);
  } catch (error) {
    if (error instanceof Error) {
      return res.status(400).send(error.message);
    }
    return res.status(500).send('Unknown error occurred');
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
router.post('/:key/attachments', upload.any(), async (req, res) => {
  const commands = req.commands;
  const key = req.params.key;

  try {
    const files = req.files;
    if (!files || files.length === 0 || !Array.isArray(files)) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const succeeded = [];
    let error: Error | null = null;

    for (const file of files) {
      try {
        await commands.createCmd.createAttachment(
          key,
          file.originalname,
          file.buffer,
        );
        succeeded.push(file.originalname);
      } catch (err) {
        error =
          err instanceof Error ? err : new Error('Failed to upload attachment');
        break;
      }
    }

    if (error) {
      for (const filename of succeeded) {
        try {
          await commands.removeCmd.remove('attachment', key, filename);
        } catch (err) {
          console.error('Failed to remove attachment:', err);
        }
      }
      throw error;
    }

    res.json({
      message: 'Attachments uploaded successfully',
      files: succeeded,
    });
  } catch (error) {
    res.status(500).json({
      error:
        error instanceof Error ? error.message : 'Failed to upload attachments',
    });
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
router.delete('/:key/attachments/:filename', async (req, res) => {
  const commands = req.commands;
  const { key, filename } = req.params;

  try {
    await commands.removeCmd.remove('attachment', key, filename);
    res.json({ message: 'Attachment removed successfully' });
  } catch (error) {
    res.status(500).json({
      error:
        error instanceof Error ? error.message : 'Failed to remove attachment',
    });
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
router.post('/:key/attachments/:filename/open', async (req, res) => {
  const commands = req.commands;
  const { key, filename } = req.params;

  try {
    await commands.showCmd.openAttachment(key, filename);
    res.json({ message: 'Attachment opened successfully' });
  } catch (error) {
    res.status(500).json({
      error:
        error instanceof Error ? error.message : 'Failed to open attachment',
    });
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
router.post('/:key/parse', async (req, res) => {
  const commands = req.commands;
  const key = req.params.key;
  const { content } = req.body;

  if (!content) {
    return res.status(400).json({ error: 'Content is required' });
  }

  try {
    let asciidocContent = '';
    try {
      asciidocContent = await evaluateMacros(content, {
        mode: 'inject',
        projectPath: process.env.npm_config_project_path || '',
        cardKey: key,
      });
    } catch (error) {
      asciidocContent = `Macro error: ${error instanceof Error ? error.message : 'Unknown error'}\n\n${content}`;
    }

    const parsedContent = Processor()
      .convert(asciidocContent, {
        safe: 'safe',
        attributes: {
          imagesdir: `/api/cards/${key}/a`,
          icons: 'font',
        },
      })
      .toString();

    res.json({ parsedContent });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to parse content',
    });
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
router.post('/:key/links', async (req, res) => {
  const commands = req.commands;
  const key = req.params.key;
  const { toCard, linkType, description } = req.body;

  if (!toCard || !linkType) {
    return res.status(400).json({ error: 'toCard and linkType are required' });
  }

  try {
    await commands.createCmd.createLink(key, toCard, linkType, description);
    res.json({ message: 'Link created successfully' });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to create link',
    });
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
router.delete('/:key/links', async (req, res) => {
  const commands = req.commands;
  const key = req.params.key;
  const { toCard, linkType, description } = req.body;

  if (!toCard || !linkType) {
    return res.status(400).json({ error: 'toCard and linkType are required' });
  }

  try {
    await commands.removeCmd.remove('link', key, toCard, linkType, description);
    res.json({ message: 'Link removed successfully' });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to remove link',
    });
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
router.get('/:key/a/:attachment', async (req, res) => {
  const commands = req.commands;
  const { key, attachment } = req.params;
  const filename = decodeURI(attachment);

  if (!filename || !key) {
    return res.status(400).send('Missing cardKey or filename');
  }

  try {
    const attachmentResponse = await commands.showCmd.showAttachment(
      key,
      filename,
    );

    if (!attachmentResponse) {
      return res
        .status(404)
        .send(`No attachment found from card ${key} and filename ${filename}`);
    }

    const payload = attachmentResponse as any;

    res.setHeader('Content-Type', payload.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(payload.fileBuffer);
  } catch (error) {
    return res
      .status(404)
      .send(`No attachment found from card ${key} and filename ${filename}`);
  }
});

export default router;
