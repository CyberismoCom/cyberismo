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

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CommandManager } from '@cyberismo/data-handler';
import { z } from 'zod';

/**
 * Register all MCP tools for write operations
 */
export function registerTools(
  server: McpServer,
  commands: CommandManager,
): void {
  // Create card from template
  server.tool(
    'create_card',
    'Create a new card from a template',
    {
      template: z
        .string()
        .describe('Template name to use (e.g., "base/templates/page")'),
      parentKey: z
        .string()
        .optional()
        .describe('Parent card key (omit for root level)'),
    },
    async ({ template, parentKey }) => {
      try {
        const cards = await commands.createCmd.createCard(template, parentKey);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  created: cards.map((c) => ({
                    key: c.key,
                    title: c.metadata?.title,
                  })),
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error creating card: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // Edit card content
  server.tool(
    'edit_card_content',
    'Update the AsciiDoc content of a card',
    {
      cardKey: z.string().describe('Card key to edit'),
      content: z.string().describe('New AsciiDoc content'),
    },
    async ({ cardKey, content }) => {
      try {
        await commands.editCmd.editCardContent(cardKey, content);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ success: true, cardKey }, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error editing content: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // Edit card metadata
  server.tool(
    'edit_card_metadata',
    'Update a metadata field of a card',
    {
      cardKey: z.string().describe('Card key to edit'),
      field: z
        .string()
        .describe('Metadata field name (e.g., "title", "severity")'),
      value: z
        .union([
          z.string(),
          z.number(),
          z.boolean(),
          z.array(z.string()),
          z.null(),
        ])
        .describe('New field value'),
    },
    async ({ cardKey, field, value }) => {
      try {
        await commands.editCmd.editCardMetadata(cardKey, field, value);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                { success: true, cardKey, field, value },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error editing metadata: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // Transition card workflow state
  server.tool(
    'transition_card',
    'Transition a card to a new workflow state',
    {
      cardKey: z.string().describe('Card key to transition'),
      transition: z.string().describe('Target state name'),
    },
    async ({ cardKey, transition }) => {
      try {
        await commands.transitionCmd.cardTransition(cardKey, {
          name: transition,
        });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                { success: true, cardKey, newState: transition },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error transitioning card: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // Move card to new parent
  server.tool(
    'move_card',
    'Move a card to a new parent',
    {
      cardKey: z.string().describe('Card key to move'),
      destinationKey: z
        .string()
        .describe('Destination parent card key, or "root" for root level'),
    },
    async ({ cardKey, destinationKey }) => {
      try {
        await commands.moveCmd.moveCard(cardKey, destinationKey);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                { success: true, cardKey, newParent: destinationKey },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error moving card: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // Create link between cards
  server.tool(
    'create_link',
    'Create a link between two cards',
    {
      sourceKey: z.string().describe('Source card key'),
      destinationKey: z.string().describe('Destination card key'),
      linkType: z
        .string()
        .describe('Link type name (e.g., "ismsa/linkTypes/mitigates")'),
      description: z.string().optional().describe('Optional link description'),
    },
    async ({ sourceKey, destinationKey, linkType, description }) => {
      try {
        await commands.createCmd.createLink(
          sourceKey,
          destinationKey,
          linkType,
          description,
        );
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                { success: true, sourceKey, destinationKey, linkType },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error creating link: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // Remove link between cards
  server.tool(
    'remove_link',
    'Remove a link between two cards',
    {
      sourceKey: z.string().describe('Source card key'),
      destinationKey: z.string().describe('Destination card key'),
      linkType: z.string().describe('Link type name'),
    },
    async ({ sourceKey, destinationKey, linkType }) => {
      try {
        await commands.removeCmd.remove(
          'link',
          sourceKey,
          destinationKey,
          linkType,
        );
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                { success: true, sourceKey, destinationKey, linkType },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error removing link: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // Create attachment
  // Maximum base64 content size: 10MB (which decodes to ~7.5MB actual file)
  const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;

  server.tool(
    'create_attachment',
    'Add an attachment to a card (max 10MB base64-encoded)',
    {
      cardKey: z.string().describe('Card key'),
      filename: z.string().describe('Attachment filename'),
      content: z
        .string()
        .max(
          MAX_ATTACHMENT_SIZE,
          'Attachment too large. Maximum size is 10MB (base64-encoded)',
        )
        .describe('Base64-encoded file content (max 10MB)'),
    },
    async ({ cardKey, filename, content }) => {
      try {
        const buffer = Buffer.from(content, 'base64');
        await commands.createCmd.createAttachment(cardKey, filename, buffer);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                { success: true, cardKey, filename },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error creating attachment: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // Remove card
  server.tool(
    'remove_card',
    'Delete a card and its children',
    {
      cardKey: z.string().describe('Card key to remove'),
    },
    async ({ cardKey }) => {
      try {
        await commands.removeCmd.remove('card', cardKey);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                { success: true, removed: cardKey },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error removing card: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // Create label
  server.tool(
    'create_label',
    'Add a label to a card',
    {
      cardKey: z.string().describe('Card key'),
      label: z.string().describe('Label name'),
    },
    async ({ cardKey, label }) => {
      try {
        await commands.createCmd.createLabel(cardKey, label);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ success: true, cardKey, label }, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error creating label: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // Remove label
  server.tool(
    'remove_label',
    'Remove a label from a card',
    {
      cardKey: z.string().describe('Card key'),
      label: z.string().describe('Label name'),
    },
    async ({ cardKey, label }) => {
      try {
        await commands.removeCmd.remove('label', cardKey, label);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ success: true, cardKey, label }, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error removing label: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // Get card details (as a tool for convenience)
  server.tool(
    'get_card',
    `Get detailed information about a card including rendered content, available transitions, and field metadata.

Returns:
- key, title, cardType, cardTypeDisplayName
- workflowState: Current workflow state name
- availableTransitions: Array of {name, toState, toStateCategory} - valid transitions from current state
- rawContent: Original AsciiDoc content
- parsedContent: HTML-rendered content with macros evaluated
- fields: Array of field metadata including:
  - key, displayName, description, dataType, value
  - isCalculated, isEditable, visibility
  - enumValues: For enum/list fields, array of {value, displayValue, description}
- labels, links, children, parent, attachments
- deniedOperations: What operations are blocked (transitions, move, delete, editFields, editContent)
- notifications: Warnings or alerts about the card
- policyCheckFailures: Failed policy checks`,
    {
      cardKey: z.string().describe('Card key to retrieve'),
      raw: z
        .boolean()
        .optional()
        .describe(
          'If true, skip macro evaluation and return basic card data without extended metadata',
        ),
    },
    async ({ cardKey, raw }) => {
      try {
        const card = commands.showCmd.showCardDetails(cardKey);
        if (!card) {
          throw new Error(`Card ${cardKey} not found`);
        }

        if (raw) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(card, null, 2),
              },
            ],
          };
        }

        // Import render function dynamically to avoid circular dependency
        const { renderCard } = await import('../lib/render.js');
        const rendered = await renderCard(commands, cardKey);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(rendered, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error getting card: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // List all cards
  server.tool(
    'list_cards',
    'List all cards in the project with their hierarchy',
    {},
    async () => {
      try {
        const { getCardTree } = await import('../lib/render.js');
        const tree = await getCardTree(commands);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(tree, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error listing cards: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // List templates
  server.tool(
    'list_templates',
    'List all available templates for creating cards',
    {},
    async () => {
      try {
        const templates = await commands.showCmd.showTemplatesWithDetails();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(templates, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error listing templates: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
