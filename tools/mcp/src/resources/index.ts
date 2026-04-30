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
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ResourceTypeConfig } from '../lib/mcp-helpers.js';
import {
  resolveCommands,
  type ProjectProvider,
} from '../lib/resolve-project.js';

import { getCardTree } from '../lib/render.js';

// Resource types that all follow the same showResources + showResource pattern
const resourceTypeConfigs: ResourceTypeConfig[] = [
  {
    name: 'calculations',
    uri: 'cyberismo:///calculations',
    description: 'All calculation definitions',
    resourceType: 'calculations' as const,
  },
  {
    name: 'field-types',
    uri: 'cyberismo:///field-types',
    description: 'All field type definitions',
    resourceType: 'fieldTypes' as const,
  },
  {
    name: 'graph-models',
    uri: 'cyberismo:///graph-models',
    description: 'All graph model definitions',
    resourceType: 'graphModels' as const,
  },
  {
    name: 'graph-views',
    uri: 'cyberismo:///graph-views',
    description: 'All graph view definitions',
    resourceType: 'graphViews' as const,
  },
  {
    name: 'link-types',
    uri: 'cyberismo:///link-types',
    description: 'All link type definitions',
    resourceType: 'linkTypes' as const,
  },
  {
    name: 'reports',
    uri: 'cyberismo:///reports',
    description: 'All report definitions',
    resourceType: 'reports' as const,
  },
] as const;

const registerResourceType = (
  server: McpServer,
  provider: ProjectProvider,
  config: ResourceTypeConfig,
) => {
  server.registerResource(
    config.name,
    new ResourceTemplate(
      `cyberismo:///projects/{projectPrefix}/${config.name}`,
      { list: undefined },
    ),
    { description: config.description, mimeType: 'application/json' },
    async (uri, { projectPrefix }) => {
      const commands = resolveCommands(provider, projectPrefix as string);
      const names = await commands.showCmd.showResources(config.resourceType);
      const details = await Promise.all(
        names.map((name) =>
          commands.showCmd.showResource(name, config.resourceType),
        ),
      );
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(details, null, 2),
          },
        ],
      };
    },
  );
};

/**
 * Register all MCP resources
 */
export function registerResources(
  server: McpServer,
  provider: ProjectProvider,
): void {
  // Projects listing (static URI)
  server.registerResource(
    'projects',
    'cyberismo:///projects',
    {
      description: 'List all available projects',
      mimeType: 'application/json',
    },
    async () => {
      const projects = provider.list();
      return {
        contents: [
          {
            uri: 'cyberismo:///projects',
            mimeType: 'application/json',
            text: JSON.stringify(projects, null, 2),
          },
        ],
      };
    },
  );

  // Project information
  server.registerResource(
    'project',
    new ResourceTemplate('cyberismo:///projects/{projectPrefix}/project', {
      list: undefined,
    }),
    {
      description: 'Project information and settings',
      mimeType: 'application/json',
    },
    async (uri, { projectPrefix }) => {
      const commands = resolveCommands(provider, projectPrefix as string);
      const project = await commands.showCmd.showProject();
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(project, null, 2),
          },
        ],
      };
    },
  );

  // Card tree
  server.registerResource(
    'cards',
    new ResourceTemplate('cyberismo:///projects/{projectPrefix}/cards', {
      list: undefined,
    }),
    {
      description: 'Card tree with hierarchy',
      mimeType: 'application/json',
    },
    async (uri, { projectPrefix }) => {
      const commands = resolveCommands(provider, projectPrefix as string);
      const tree = await getCardTree(commands);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(tree, null, 2),
          },
        ],
      };
    },
  );

  // Card types
  server.registerResource(
    'card-types',
    new ResourceTemplate('cyberismo:///projects/{projectPrefix}/card-types', {
      list: undefined,
    }),
    {
      description: 'All card type definitions',
      mimeType: 'application/json',
    },
    async (uri, { projectPrefix }) => {
      const commands = resolveCommands(provider, projectPrefix as string);
      const cardTypes = await commands.showCmd.showCardTypesWithDetails();
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(cardTypes, null, 2),
          },
        ],
      };
    },
  );

  // Workflows
  server.registerResource(
    'workflows',
    new ResourceTemplate('cyberismo:///projects/{projectPrefix}/workflows', {
      list: undefined,
    }),
    {
      description: 'All workflow definitions',
      mimeType: 'application/json',
    },
    async (uri, { projectPrefix }) => {
      const commands = resolveCommands(provider, projectPrefix as string);
      const workflows = await commands.showCmd.showWorkflowsWithDetails();
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(workflows, null, 2),
          },
        ],
      };
    },
  );

  // Templates
  server.registerResource(
    'templates',
    new ResourceTemplate('cyberismo:///projects/{projectPrefix}/templates', {
      list: undefined,
    }),
    {
      description: 'All template definitions',
      mimeType: 'application/json',
    },
    async (uri, { projectPrefix }) => {
      const commands = resolveCommands(provider, projectPrefix as string);
      const templates = await commands.showCmd.showTemplatesWithDetails();
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(templates, null, 2),
          },
        ],
      };
    },
  );

  resourceTypeConfigs.forEach((config) => {
    registerResourceType(server, provider, config);
  });
}
