// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ResourceTypeConfig } from '../lib/mcp-helpers.js';
import type { ProjectDirectory } from '@cyberismo/data-handler';
import { callerOf, resolveWorkspace } from '../lib/resolve-project.js';

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
  directory: ProjectDirectory,
  config: ResourceTypeConfig,
) => {
  server.registerResource(
    config.name,
    new ResourceTemplate(
      `cyberismo:///projects/{projectPrefix}/${config.name}`,
      { list: undefined },
    ),
    { description: config.description, mimeType: 'application/json' },
    async (uri, { projectPrefix }, extra) => {
      const ws = await resolveWorkspace(
        directory,
        projectPrefix as string,
        extra,
        server,
      );
      const names = await ws.resources.list(config.resourceType);
      const details = await Promise.all(
        names.map((name) => ws.resources.show(name, config.resourceType)),
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
  directory: ProjectDirectory,
): void {
  // Projects listing (static URI)
  server.registerResource(
    'projects',
    'cyberismo:///projects',
    {
      description: 'List all available projects',
      mimeType: 'application/json',
    },
    async (_uri, extra) => {
      callerOf(extra);
      const projects = await directory.list();
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
    async (uri, { projectPrefix }, extra) => {
      const ws = await resolveWorkspace(
        directory,
        projectPrefix as string,
        extra,
        server,
      );
      const project = await ws.settings.info();
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
    async (uri, { projectPrefix }, extra) => {
      const ws = await resolveWorkspace(
        directory,
        projectPrefix as string,
        extra,
        server,
      );
      const tree = await getCardTree(ws);
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
    async (uri, { projectPrefix }, extra) => {
      const ws = await resolveWorkspace(
        directory,
        projectPrefix as string,
        extra,
        server,
      );
      const cardTypes = await ws.resources.contents('cardTypes');
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
    async (uri, { projectPrefix }, extra) => {
      const ws = await resolveWorkspace(
        directory,
        projectPrefix as string,
        extra,
        server,
      );
      const workflows = await ws.resources.contents('workflows');
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
    async (uri, { projectPrefix }, extra) => {
      const ws = await resolveWorkspace(
        directory,
        projectPrefix as string,
        extra,
        server,
      );
      const templates = await ws.resources.contents('templates');
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
    registerResourceType(server, directory, config);
  });
}
