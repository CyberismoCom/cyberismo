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
import { getCardTree } from '../lib/render.js';

/**
 * Register all MCP resources
 *
 * MCP SDK resource() signature: resource(name, uri, [metadata], callback)
 * - name: Human-readable name for the resource
 * - uri: The resource URI
 * - metadata: Optional metadata object with description, mimeType, etc.
 * - callback: Async function that returns the resource contents
 */
export function registerResources(
  server: McpServer,
  commands: CommandManager,
): void {
  // Project information
  server.resource(
    'project',
    'file:///project',
    { description: 'Project information and settings', mimeType: 'application/json' },
    async () => {
      const project = await commands.showCmd.showProject();
      return {
        contents: [
          {
            uri: 'file:///project',
            mimeType: 'application/json',
            text: JSON.stringify(project, null, 2),
          },
        ],
      };
    },
  );

  // Card tree
  server.resource(
    'cards',
    'file:///cards',
    { description: 'Card tree with hierarchy', mimeType: 'application/json' },
    async () => {
      const tree = await getCardTree(commands);
      return {
        contents: [
          {
            uri: 'file:///cards',
            mimeType: 'application/json',
            text: JSON.stringify(tree, null, 2),
          },
        ],
      };
    },
  );

  // Card types
  server.resource(
    'card-types',
    'file:///card-types',
    { description: 'All card type definitions', mimeType: 'application/json' },
    async () => {
      const cardTypes = await commands.showCmd.showCardTypesWithDetails();
      return {
        contents: [
          {
            uri: 'file:///card-types',
            mimeType: 'application/json',
            text: JSON.stringify(cardTypes, null, 2),
          },
        ],
      };
    },
  );

  // Workflows
  server.resource(
    'workflows',
    'file:///workflows',
    { description: 'All workflow definitions', mimeType: 'application/json' },
    async () => {
      const workflows = commands.showCmd.showWorkflowsWithDetails();
      return {
        contents: [
          {
            uri: 'file:///workflows',
            mimeType: 'application/json',
            text: JSON.stringify(workflows, null, 2),
          },
        ],
      };
    },
  );

  // Templates
  server.resource(
    'templates',
    'file:///templates',
    { description: 'All template definitions', mimeType: 'application/json' },
    async () => {
      const templates = await commands.showCmd.showTemplatesWithDetails();
      return {
        contents: [
          {
            uri: 'file:///templates',
            mimeType: 'application/json',
            text: JSON.stringify(templates, null, 2),
          },
        ],
      };
    },
  );

  // Link types
  server.resource(
    'link-types',
    'file:///link-types',
    { description: 'All link type definitions', mimeType: 'application/json' },
    async () => {
      const linkTypes = await commands.showCmd.showResources('linkTypes');
      const details = await Promise.all(
        linkTypes.map((name) => commands.showCmd.showResource(name, 'linkTypes')),
      );
      return {
        contents: [
          {
            uri: 'file:///link-types',
            mimeType: 'application/json',
            text: JSON.stringify(details, null, 2),
          },
        ],
      };
    },
  );

  // Field types
  server.resource(
    'field-types',
    'file:///field-types',
    { description: 'All field type definitions', mimeType: 'application/json' },
    async () => {
      const fieldTypes = await commands.showCmd.showResources('fieldTypes');
      const details = await Promise.all(
        fieldTypes.map((name) =>
          commands.showCmd.showResource(name, 'fieldTypes'),
        ),
      );
      return {
        contents: [
          {
            uri: 'file:///field-types',
            mimeType: 'application/json',
            text: JSON.stringify(details, null, 2),
          },
        ],
      };
    },
  );

  // Calculations
  server.resource(
    'calculations',
    'file:///calculations',
    { description: 'All calculation definitions', mimeType: 'application/json' },
    async () => {
      const calculations = await commands.showCmd.showResources('calculations');
      const details = await Promise.all(
        calculations.map((name) =>
          commands.showCmd.showResource(name, 'calculations'),
        ),
      );
      return {
        contents: [
          {
            uri: 'file:///calculations',
            mimeType: 'application/json',
            text: JSON.stringify(details, null, 2),
          },
        ],
      };
    },
  );

  // Reports
  server.resource(
    'reports',
    'file:///reports',
    { description: 'All report definitions', mimeType: 'application/json' },
    async () => {
      const reports = await commands.showCmd.showResources('reports');
      const details = await Promise.all(
        reports.map((name) => commands.showCmd.showResource(name, 'reports')),
      );
      return {
        contents: [
          {
            uri: 'file:///reports',
            mimeType: 'application/json',
            text: JSON.stringify(details, null, 2),
          },
        ],
      };
    },
  );

  // Graph models
  server.resource(
    'graph-models',
    'file:///graph-models',
    { description: 'All graph model definitions', mimeType: 'application/json' },
    async () => {
      const graphModels = await commands.showCmd.showResources('graphModels');
      const details = await Promise.all(
        graphModels.map((name) =>
          commands.showCmd.showResource(name, 'graphModels'),
        ),
      );
      return {
        contents: [
          {
            uri: 'file:///graph-models',
            mimeType: 'application/json',
            text: JSON.stringify(details, null, 2),
          },
        ],
      };
    },
  );

  // Graph views
  server.resource(
    'graph-views',
    'file:///graph-views',
    { description: 'All graph view definitions', mimeType: 'application/json' },
    async () => {
      const graphViews = await commands.showCmd.showResources('graphViews');
      const details = await Promise.all(
        graphViews.map((name) =>
          commands.showCmd.showResource(name, 'graphViews'),
        ),
      );
      return {
        contents: [
          {
            uri: 'file:///graph-views',
            mimeType: 'application/json',
            text: JSON.stringify(details, null, 2),
          },
        ],
      };
    },
  );
}

/**
 * Register dynamic resource templates for individual items
 */
export function registerResourceTemplates(
  _server: McpServer,
  _commands: CommandManager,
): void {
  // Note: Resource templates use a different API with ResourceTemplate class
  // For now, we'll skip templates and rely on the tools for individual card access
  // The get_card tool provides the same functionality

  // Users can use the get_card tool to fetch individual cards:
  // - get_card({ cardKey: "abc123" }) for rendered content
  // - get_card({ cardKey: "abc123", raw: true }) for raw content
}
