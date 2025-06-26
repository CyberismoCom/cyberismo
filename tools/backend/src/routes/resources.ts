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

import { Hono } from 'hono';
import { ssgParams } from '../export.js';
import type { ResourceContent } from '@cyberismo/data-handler/interfaces/resource-interfaces';
import {
  type Card,
  type ResourceFolderType,
} from '@cyberismo/data-handler/interfaces/project-interfaces';
import { CommandManager } from '@cyberismo/data-handler';

const router = new Hono();

const resourceTypes: ResourceFolderType[] = [
  'calculations',
  'cardTypes',
  'fieldTypes',
  'graphModels',
  'graphViews',
  'linkTypes',
  'reports',
  'templates',
  'workflows',
];

// Helper function to parse resource prefix
const parseResourcePrefix = (
  resource: string,
): { prefix: string; identifier: string } => {
  const parts = resource.split('/');
  return {
    prefix: parts.length >= 2 ? parts[0] : '',
    identifier: parts.length >= 2 ? parts.slice(1).join('/') : resource,
  };
};

// Helper function to create resource node with all data from showResource
const createResourceNode = async (
  commands: any,
  resourceType: ResourceFolderType,
  resourceName: string,
  children?: any[],
): Promise<{
  id: string;
  type: ResourceFolderType;
  name: string;
  data: ResourceContent | undefined;
  children?: any[];
}> => {
  const resourceData = await commands.showCmd.showResource(resourceName);
  const node: {
    id: string;
    type: ResourceFolderType;
    name: string;
    data: ResourceContent | undefined;
    children?: any[];
  } = {
    id: `${resourceType}-${resourceName}`,
    type: resourceType,
    name: resourceName,
    data: resourceData,
  };

  if (children) {
    node.children = children;
  }

  return node;
};

// Helper function to recursively create card nodes with children
const createCardNode = (card: Card): any => {
  // Destructure to separate children from other card data
  const { children, ...cardData } = card;

  const cardNode: any = {
    id: `card-${card.key}`,
    type: 'card',
    name: card.key,
    data: cardData,
  };

  // Recursively process children if they exist
  if (children && children.length > 0) {
    cardNode.children = children.map(createCardNode);
  }

  return cardNode;
};

// Helper function to process templates using templateTree query
const processTemplates = async (
  commands: CommandManager,
  projectPrefix?: string,
) => {
  try {
    const templateTree = await commands.showCmd.showAllTemplateCards();

    const rootTemplates: { [templateName: string]: any[] } = {};
    const moduleTemplates: {
      [prefix: string]: { [templateName: string]: any[] };
    } = {};

    for (const { name, cards } of templateTree) {
      for (const card of cards) {
        const cardNode = createCardNode(card);

        const { prefix } = parseResourcePrefix(name);

        if (prefix === projectPrefix || !prefix) {
          if (!rootTemplates[name]) {
            rootTemplates[name] = [];
          }
          rootTemplates[name].push(cardNode);
        } else {
          if (!moduleTemplates[prefix]) {
            moduleTemplates[prefix] = {};
          }
          if (!moduleTemplates[prefix][name]) {
            moduleTemplates[prefix][name] = [];
          }
          moduleTemplates[prefix][name].push(cardNode);
        }
      }
    }

    const rootResources = await Promise.all(
      Object.entries(rootTemplates).map(([templateName, cards]) =>
        createResourceNode(commands, 'templates', templateName, cards),
      ),
    );

    const moduleResources: { [prefix: string]: any[] } = {};
    for (const [prefix, templates] of Object.entries(moduleTemplates)) {
      moduleResources[prefix] = await Promise.all(
        Object.entries(templates).map(([templateName, cards]) =>
          createResourceNode(commands, 'templates', templateName, cards),
        ),
      );
    }

    return { rootResources, moduleResources };
  } catch (error) {
    // Fallback to regular resource processing if templateTree query fails
    const templateResources = await commands.showCmd.showResources('templates');
    const resources = await Promise.all(
      templateResources.map((name: string) =>
        createResourceNode(commands, 'templates', name),
      ),
    );

    const rootResources: any[] = [];
    const moduleResources: { [prefix: string]: any[] } = {};

    resources.forEach((resource) => {
      const { prefix } = parseResourcePrefix(resource.name);
      if (prefix === projectPrefix || !prefix) {
        rootResources.push(resource);
      } else {
        if (!moduleResources[prefix]) {
          moduleResources[prefix] = [];
        }
        moduleResources[prefix].push(resource);
      }
    });

    return { rootResources, moduleResources };
  }
};

// Helper function to group regular resources by prefix
const groupResourcesByPrefix = async (
  commands: any,
  resourceType: ResourceFolderType,
  projectPrefix?: string,
) => {
  const resourceNames = await commands.showCmd.showResources(resourceType);
  const resources = await Promise.all(
    resourceNames.map((name: string) =>
      createResourceNode(commands, resourceType, name),
    ),
  );

  const rootResources: any[] = [];
  const moduleResources: { [prefix: string]: any[] } = {};

  resources.forEach((resource) => {
    const { prefix } = parseResourcePrefix(resource.name);
    if (prefix === projectPrefix || !prefix) {
      rootResources.push(resource);
    } else {
      if (!moduleResources[prefix]) {
        moduleResources[prefix] = [];
      }
      moduleResources[prefix].push(resource);
    }
  });

  return { rootResources, moduleResources };
};

/**
 * @swagger
 * /api/resources/tree:
 *   get:
 *     summary: Returns a complete tree structure of all project resources
 *     description: Returns a hierarchical tree of all resources including their full data from showResource calls
 *     responses:
 *       200:
 *        description: Tree structure containing all resources with their complete data
 *       500:
 *         description: project_path not set or other internal error
 */
router.get('/tree', async (c) => {
  const commands = c.get('commands');

  try {
    const project = await commands.showCmd.showProject();
    const tree: any[] = [];
    const allModuleResources: { [prefix: string]: { [type: string]: any[] } } =
      {};

    // Process each resource type
    for (const resourceType of resourceTypes) {
      let rootResources: any[];
      let moduleResources: { [prefix: string]: any[] };

      if (resourceType === 'templates') {
        ({ rootResources, moduleResources } = await processTemplates(
          commands,
          project.prefix,
        ));
      } else {
        ({ rootResources, moduleResources } = await groupResourcesByPrefix(
          commands,
          resourceType,
          project.prefix,
        ));
      }

      // Add root level resources
      if (rootResources.length > 0) {
        tree.push({
          id: resourceType,
          type: 'resourceGroup',
          name: resourceType,
          children: rootResources,
        });
      }

      // Collect module resources
      Object.entries(moduleResources).forEach(([prefix, resources]) => {
        if (!allModuleResources[prefix]) {
          allModuleResources[prefix] = {};
        }
        allModuleResources[prefix][resourceType] = resources;
      });
    }

    // Build modules section
    if (Object.keys(allModuleResources).length > 0) {
      const modules = Object.entries(allModuleResources).map(
        ([prefix, resourcesByType]) => ({
          id: `modules-${prefix}`,
          type: 'module',
          name: prefix,
          children: Object.entries(resourcesByType).map(
            ([type, resources]) => ({
              id: `modules-${prefix}-${type}`,
              type: 'resourceGroup',
              name: type,
              children: resources,
            }),
          ),
        }),
      );

      tree.push({
        id: 'modules',
        type: 'modulesGroup',
        name: 'modules',
        children: modules,
      });
    }

    return c.json(tree);
  } catch (error) {
    return c.json(
      {
        error: `Failed to build resource tree: ${error instanceof Error ? error.message : 'Unknown error'}`,
      },
      500,
    );
  }
});

export default router;
