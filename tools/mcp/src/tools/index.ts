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
import { toolResult, toolError } from '../lib/mcp-helpers.js';
import { renderCard, getCardTree } from '../lib/render.js';

// Maximum base64 content size: 10MB (which decodes to ~7.5MB actual file)
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;

/**
 * Register all MCP tools for Cyberismo operations
 */
export function registerTools(
  server: McpServer,
  commands: CommandManager,
): void {
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
        return toolResult({
          created: cards.map((c) => ({
            key: c.key,
            title: c.metadata?.title,
          })),
        });
      } catch (error) {
        return toolError('creating card', error);
      }
    },
  );

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
        return toolResult({ cardKey });
      } catch (error) {
        return toolError('editing content', error);
      }
    },
  );

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
        return toolResult({ cardKey, field, value });
      } catch (error) {
        return toolError('editing metadata', error);
      }
    },
  );

  server.tool(
    'transition_card',
    'Transition a card to a new workflow state',
    {
      cardKey: z.string().describe('Card key to transition'),
      transition: z
        .string()
        .describe('Transition name (e.g., "Approve", "Reject")'),
    },
    async ({ cardKey, transition }) => {
      try {
        await commands.transitionCmd.cardTransition(cardKey, {
          name: transition,
        });
        return toolResult({ cardKey, transition });
      } catch (error) {
        return toolError('transitioning card', error);
      }
    },
  );

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
        return toolResult({ cardKey, newParent: destinationKey });
      } catch (error) {
        return toolError('moving card', error);
      }
    },
  );

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
        return toolResult({ sourceKey, destinationKey, linkType });
      } catch (error) {
        return toolError('creating link', error);
      }
    },
  );

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
        return toolResult({ sourceKey, destinationKey, linkType });
      } catch (error) {
        return toolError('removing link', error);
      }
    },
  );

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
        return toolResult({ cardKey, filename });
      } catch (error) {
        return toolError('creating attachment', error);
      }
    },
  );

  server.tool(
    'remove_card',
    'Delete a card and its children',
    {
      cardKey: z.string().describe('Card key to remove'),
    },
    async ({ cardKey }) => {
      try {
        await commands.removeCmd.remove('card', cardKey);
        return toolResult({ removed: cardKey });
      } catch (error) {
        return toolError('removing card', error);
      }
    },
  );

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
        return toolResult({ cardKey, label });
      } catch (error) {
        return toolError('creating label', error);
      }
    },
  );

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
        return toolResult({ cardKey, label });
      } catch (error) {
        return toolError('removing label', error);
      }
    },
  );

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
        if (raw) {
          const card = commands.showCmd.showCardDetails(cardKey);
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(card, null, 2),
              },
            ],
          };
        }

        const rendered = await renderCard(commands, cardKey);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(rendered, null, 2),
            },
          ],
        };
      } catch (error) {
        return toolError('getting card', error);
      }
    },
  );

  server.tool(
    'list_cards',
    'List all cards in the project with their hierarchy',
    {},
    async () => {
      try {
        const tree = await getCardTree(commands);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(tree, null, 2),
            },
          ],
        };
      } catch (error) {
        return toolError('listing cards', error);
      }
    },
  );

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
              type: 'text' as const,
              text: JSON.stringify(templates, null, 2),
            },
          ],
        };
      } catch (error) {
        return toolError('listing templates', error);
      }
    },
  );
}
