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
import { resourceName, type CommandManager } from '@cyberismo/data-handler';
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
          return toolResult({ card });
        }

        const rendered = await renderCard(commands, cardKey);
        return toolResult({ card: rendered });
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
        return toolResult({ cards: tree });
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
        return toolResult({ templates });
      } catch (error) {
        return toolError('listing templates', error);
      }
    },
  );

  // --- Phase 1: Quick Wins ---

  server.tool(
    'remove_attachment',
    'Remove an attachment from a card',
    {
      cardKey: z.string().describe('Card key'),
      filename: z.string().describe('Attachment filename to remove'),
    },
    async ({ cardKey, filename }) => {
      try {
        await commands.removeCmd.remove('attachment', cardKey, filename);
        return toolResult({ cardKey, filename });
      } catch (error) {
        return toolError('removing attachment', error);
      }
    },
  );

  server.tool(
    'list_labels',
    'List all unique labels used across the project',
    {},
    async () => {
      try {
        const labels = commands.showCmd.showLabels();
        return toolResult({ labels });
      } catch (error) {
        return toolError('listing labels', error);
      }
    },
  );

  server.tool(
    'rank_card_first',
    'Move a card to first position among its siblings',
    {
      cardKey: z.string().describe('Card key to move to first position'),
    },
    async ({ cardKey }) => {
      try {
        await commands.moveCmd.rankFirst(cardKey);
        return toolResult({ cardKey, position: 'first' });
      } catch (error) {
        return toolError('ranking card first', error);
      }
    },
  );

  server.tool(
    'rank_card_after',
    'Position a card after another sibling card',
    {
      cardKey: z.string().describe('Card key to reposition'),
      afterCardKey: z.string().describe('Card key to position after'),
    },
    async ({ cardKey, afterCardKey }) => {
      try {
        await commands.moveCmd.rankCard(cardKey, afterCardKey);
        return toolResult({ cardKey, afterCardKey });
      } catch (error) {
        return toolError('ranking card', error);
      }
    },
  );

  server.tool(
    'rank_card_by_index',
    'Position a card at a specific index among its siblings',
    {
      cardKey: z.string().describe('Card key to reposition'),
      index: z.number().int().min(0).describe('Zero-based position index'),
    },
    async ({ cardKey, index }) => {
      try {
        await commands.moveCmd.rankByIndex(cardKey, index);
        return toolResult({ cardKey, index });
      } catch (error) {
        return toolError('ranking card by index', error);
      }
    },
  );

  // --- Phase 2: Resource Creation ---

  server.tool(
    'create_card_type',
    'Create a new card type',
    {
      name: z.string().describe('Card type identifier'),
      workflowName: z.string().describe('Workflow to use for this card type'),
    },
    async ({ name, workflowName }) => {
      try {
        await commands.createCmd.createCardType(name, workflowName);
        return toolResult({ name, workflowName });
      } catch (error) {
        return toolError('creating card type', error);
      }
    },
  );

  server.tool(
    'create_field_type',
    'Create a new field type',
    {
      name: z.string().describe('Field type identifier'),
      dataType: z
        .enum([
          'boolean',
          'date',
          'dateTime',
          'enum',
          'integer',
          'list',
          'longText',
          'number',
          'person',
          'shortText',
        ])
        .describe('Data type for the field'),
    },
    async ({ name, dataType }) => {
      try {
        await commands.createCmd.createFieldType(name, dataType);
        return toolResult({ name, dataType });
      } catch (error) {
        return toolError('creating field type', error);
      }
    },
  );

  server.tool(
    'create_workflow',
    'Create a new workflow',
    {
      name: z.string().describe('Workflow identifier'),
      content: z
        .string()
        .optional()
        .describe('JSON workflow definition (omit for default)'),
    },
    async ({ name, content }) => {
      try {
        await commands.createCmd.createWorkflow(name, content ?? '');
        return toolResult({ name });
      } catch (error) {
        return toolError('creating workflow', error);
      }
    },
  );

  server.tool(
    'create_link_type',
    'Create a new link type',
    {
      name: z.string().describe('Link type identifier'),
    },
    async ({ name }) => {
      try {
        await commands.createCmd.createLinkType(name);
        return toolResult({ name });
      } catch (error) {
        return toolError('creating link type', error);
      }
    },
  );

  server.tool(
    'create_template',
    'Create a new template',
    {
      name: z.string().describe('Template identifier'),
      content: z
        .string()
        .optional()
        .describe('JSON template definition (omit for default)'),
    },
    async ({ name, content }) => {
      try {
        await commands.createCmd.createTemplate(name, content ?? '');
        return toolResult({ name });
      } catch (error) {
        return toolError('creating template', error);
      }
    },
  );

  server.tool(
    'add_template_cards',
    'Add card(s) to a template',
    {
      templateName: z.string().describe('Template to add cards to'),
      cardTypeName: z.string().describe('Card type for the new cards'),
      parentCard: z
        .string()
        .optional()
        .describe('Parent card key within template (omit for root)'),
      count: z
        .number()
        .int()
        .min(1)
        .default(1)
        .optional()
        .describe('Number of cards to add (default: 1)'),
    },
    async ({ templateName, cardTypeName, parentCard, count }) => {
      try {
        const cards = await commands.createCmd.addCards(
          cardTypeName,
          templateName,
          parentCard,
          count ?? 1,
        );
        return toolResult({ templateName, created: cards });
      } catch (error) {
        return toolError('adding template cards', error);
      }
    },
  );

  // --- Phase 3: Resource Management ---

  const removableResourceTypes = z.enum([
    'calculation',
    'cardType',
    'fieldType',
    'graphModel',
    'graphView',
    'linkType',
    'report',
    'template',
    'workflow',
  ]);

  server.tool(
    'delete_resource',
    'Delete a project resource by type and name',
    {
      resourceType: removableResourceTypes.describe(
        'Type of resource to delete',
      ),
      name: z.string().describe('Resource name'),
    },
    async ({ resourceType, name }) => {
      try {
        await commands.removeCmd.remove(resourceType, name);
        return toolResult({ resourceType, name });
      } catch (error) {
        return toolError('deleting resource', error);
      }
    },
  );

  server.tool(
    'validate_resource',
    'Validate a resource definition and return any errors',
    {
      name: z
        .string()
        .describe('Full resource name (e.g., "prefix/cardTypes/myType")'),
    },
    async ({ name }) => {
      try {
        const parsed = resourceName(name);
        const result = await commands.validateCmd.validateResource(
          parsed,
          commands.project,
        );
        return toolResult({
          name,
          valid: result === '',
          errors: result || undefined,
        });
      } catch (error) {
        return toolError('validating resource', error);
      }
    },
  );

  server.tool(
    'update_resource',
    'Update a resource property using an operation (add, change, rank, or remove)',
    {
      name: z
        .string()
        .describe('Full resource name (e.g., "prefix/cardTypes/myType")'),
      key: z.string().describe('Property key to update'),
      subKey: z.string().optional().describe('Sub-key for content properties'),
      operation: z
        .object({
          name: z.enum(['add', 'change', 'rank', 'remove']),
          target: z.unknown().describe('Target value for the operation'),
          to: z
            .unknown()
            .optional()
            .describe('New value (for change operations)'),
          newIndex: z
            .number()
            .optional()
            .describe('New index (for rank operations)'),
        })
        .describe('Operation to apply'),
    },
    async ({ name, key, subKey, operation }) => {
      try {
        if (key.includes('/')) {
          return toolError(
            'updating resource',
            `Invalid key "${key}": key must not contain '/'. Use the 'subKey' parameter for content sub-properties.`,
          );
        }
        if (key === 'content' && !subKey) {
          return toolError(
            'updating resource',
            `When key is 'content', a 'subKey' parameter is required to specify which content property to update.`,
          );
        }
        if (key !== 'content' && subKey) {
          return toolError(
            'updating resource',
            `The 'subKey' parameter is only valid when key is 'content'. Got key="${key}" with subKey="${subKey}".`,
          );
        }
        const updateKey = subKey
          ? { key: 'content' as const, subKey }
          : { key };
        await commands.updateCmd.applyResourceOperation(
          name,
          updateKey,
          operation as Parameters<
            typeof commands.updateCmd.applyResourceOperation
          >[2],
        );
        return toolResult({ name, key });
      } catch (error) {
        return toolError('updating resource', error);
      }
    },
  );

  // --- Phase 4: Calculations & Queries ---

  server.tool(
    'create_calculation',
    'Create a new calculation definition',
    {
      name: z.string().describe('Calculation identifier'),
    },
    async ({ name }) => {
      try {
        await commands.createCmd.createCalculation(name);
        return toolResult({ name });
      } catch (error) {
        return toolError('creating calculation', error);
      }
    },
  );

  server.tool(
    'run_query',
    'Run a predefined query against the project',
    {
      queryName: z
        .enum(['card', 'onCreation', 'onTransition', 'tree'])
        .describe('Query type to run'),
    },
    async ({ queryName }) => {
      try {
        const results = await commands.calculateCmd.runQuery(queryName);
        return toolResult({ results });
      } catch (error) {
        return toolError('running query', error);
      }
    },
  );

  server.tool(
    'run_logic_program',
    'Execute a custom logic program (Clingo/ASP). AI can design and iterate on logic programs for calculations, validations, and derived fields.',
    {
      query: z.string().describe('Clingo/ASP logic program source code'),
    },
    async ({ query }) => {
      try {
        const result = await commands.calculateCmd.runLogicProgram(query);
        return toolResult({ result });
      } catch (error) {
        return toolError('running logic program', error);
      }
    },
  );

  server.tool(
    'create_report',
    'Create a new report definition',
    {
      name: z.string().describe('Report identifier'),
    },
    async ({ name }) => {
      try {
        await commands.createCmd.createReport(name);
        return toolResult({ name });
      } catch (error) {
        return toolError('creating report', error);
      }
    },
  );

  server.tool(
    'run_report',
    'Execute a report and return results',
    {
      reportName: z.string().describe('Report name to execute'),
      cardKey: z.string().describe('Card key as report context'),
      parameters: z
        .record(z.string(), z.unknown())
        .default({})
        .optional()
        .describe('Additional report parameters'),
    },
    async ({ reportName, cardKey, parameters }) => {
      try {
        const result = await commands.showCmd.showReportResults(
          reportName,
          cardKey,
          parameters ?? {},
          'localApp',
        );
        return toolResult({ reportName, cardKey, report: result });
      } catch (error) {
        return toolError('running report', error);
      }
    },
  );

  server.tool(
    'run_graph',
    'Generate a graph visualization',
    {
      model: z.string().describe('Graph model name'),
      view: z.string().describe('Graph view name'),
    },
    async ({ model, view }) => {
      try {
        const base64 = await commands.calculateCmd.runGraph(
          model,
          view,
          'localApp',
        );
        return {
          content: [
            {
              type: 'image' as const,
              data: base64,
              mimeType: 'image/png',
            },
          ],
        };
      } catch (error) {
        return toolError('running graph', error);
      }
    },
  );
}
