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

import type { ResourceContent } from '@cyberismo/data-handler/interfaces/resource-interfaces';
import type {
  Card,
  ResourceFolderType,
  RemovableResourceTypes,
} from '@cyberismo/data-handler/interfaces/project-interfaces';
import {
  type CommandManager,
  isResourceFolderType,
  moduleNameFromCardKey,
  resourceName,
  resourceNameToString,
} from '@cyberismo/data-handler';
import type { ResourceParams } from '../../common/validationSchemas.js';

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

export async function buildResourceTree(commands: CommandManager) {
  const project = await commands.showCmd.showProject();
  const tree: unknown[] = [];
  const allModuleResources: {
    [prefix: string]: { [type: string]: unknown[] };
  } = {};

  // Process each resource type
  for (const resourceType of resourceTypes) {
    let rootResources: unknown[];
    let moduleResources: { [prefix: string]: unknown[] };

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
        children: Object.entries(resourcesByType).map(([type, resources]) => ({
          id: `modules-${prefix}-${type}`,
          type: 'resourceGroup',
          name: type,
          children: resources,
        })),
      }),
    );

    tree.push({
      id: 'modules',
      type: 'modulesGroup',
      name: 'modules',
      children: modules,
    });
  }

  return tree;
}

// Helper function to parse resource prefix
function parseResourcePrefix(resource: string): {
  prefix: string;
  identifier: string;
} {
  const parts = resource.split('/');
  if (parts.length !== 3) {
    throw new Error(`Invalid resource name: ${resource}`);
  }
  return {
    prefix: parts[0],
    identifier: parts[2],
  };
}

// Helper function to create resource node with all data from showResource
// TODO: The types should be shared between backend and frontend
async function createResourceNode(
  commands: CommandManager,
  resourceType: ResourceFolderType,
  name: string,
  projectPrefix: string,
  children?: unknown[],
): Promise<{
  id: string;
  type: ResourceFolderType;
  name: string;
  data: ResourceContent | undefined;
  children?: unknown[];
  readOnly?: boolean;
}> {
  const resourceData = await commands.showCmd.showResource(name);
  const node: {
    id: string;
    type: ResourceFolderType;
    name: string;
    data: ResourceContent | undefined;
    children?: unknown[];
    readOnly?: boolean;
  } = {
    id: `${resourceType}-${name}`,
    type: resourceType,
    name: name,
    data: resourceData,
    readOnly: resourceName(name).prefix !== projectPrefix,
  };

  // Add file children for folder resources
  if (isResourceFolderType(resourceType) && resourceType !== 'templates') {
    try {
      const fileNames = await commands.showCmd.showFileNames(
        resourceName(name),
      );
      const fileNodes = fileNames.map((fileName: string) => ({
        id: `${resourceType}-${name}-${fileName}`,
        type: 'file',
        name: `${name}/${fileName}`,
        displayName: fileName,
        readOnly: resourceName(name).prefix !== projectPrefix,
      }));

      node.children = children ? [...children, ...fileNodes] : fileNodes;
    } catch (error) {
      console.warn(`Failed to get file names for resource '${name}'`, error);
    }
  } else if (children) {
    node.children = children;
  }

  return node;
}

// Helper function to recursively create card nodes with children
function createCardNode(
  card: Card,
  module: string,
  projectPrefix: string,
): unknown {
  // Destructure to separate children from other card data
  const { children, ...cardData } = card;

  const cardNode: {
    id: string;
    type: string;
    name: string;
    data: Omit<Card, 'children'>;
    children: unknown[];
    readOnly: boolean;
  } = {
    id: `${card.key}`,
    type: 'card',
    name: `${module}/cards/${card.key}`,
    data: cardData,
    children: [],
    readOnly: moduleNameFromCardKey(card.key) !== projectPrefix,
  };

  // Recursively process children if they exist
  if (children && children.length > 0) {
    cardNode.children = children.map((child) =>
      createCardNode(child, module, projectPrefix),
    );
  }

  return cardNode;
}

// Helper function to process templates using templateTree query
async function processTemplates(
  commands: CommandManager,
  projectPrefix: string,
) {
  const templates = await commands.showCmd.showResources('templates');
  const templateTree = await commands.showCmd.showAllTemplateCards();

  const rootTemplates: { [templateName: string]: unknown[] } = {};
  const moduleTemplates: {
    [prefix: string]: { [templateName: string]: unknown[] };
  } = {};

  for (const { name, cards } of templateTree) {
    for (const card of cards) {
      const { prefix } = parseResourcePrefix(name);
      const cardNode = createCardNode(card, prefix, projectPrefix);

      if (prefix === projectPrefix || !prefix) {
        if (!rootTemplates[name]) {
          templates.splice(templates.indexOf(name), 1);
          rootTemplates[name] = [];
        }
        rootTemplates[name].push(cardNode);
      } else {
        if (!moduleTemplates[prefix]) {
          moduleTemplates[prefix] = {};
        }
        if (!moduleTemplates[prefix][name]) {
          templates.splice(templates.indexOf(name), 1);
          moduleTemplates[prefix][name] = [];
        }
        moduleTemplates[prefix][name].push(cardNode);
      }
    }
  }

  const rootResources = await Promise.all(
    Object.entries(rootTemplates).map(([templateName, cards]) =>
      createResourceNode(
        commands,
        'templates',
        templateName,
        projectPrefix,
        cards,
      ),
    ),
  );

  const moduleResources: { [prefix: string]: unknown[] } = {};
  for (const [prefix, templates] of Object.entries(moduleTemplates)) {
    moduleResources[prefix] = await Promise.all(
      Object.entries(templates).map(([templateName, cards]) =>
        createResourceNode(
          commands,
          'templates',
          templateName,
          projectPrefix,
          cards,
        ),
      ),
    );
  }

  // Add also templates that do not have any cards
  for (const template of templates) {
    const { prefix } = parseResourcePrefix(template);
    if (prefix === projectPrefix) {
      if (!rootResources.find((resource) => resource.name === template)) {
        rootResources.push(
          await createResourceNode(
            commands,
            'templates',
            template,
            projectPrefix,
          ),
        );
      }
    } else {
      if (!moduleResources[prefix]) {
        moduleResources[prefix] = [];
      }
      if (
        !moduleResources[prefix].find(
          (resource) => (resource as { name: string }).name === template,
        )
      ) {
        moduleResources[prefix].push(
          await createResourceNode(
            commands,
            'templates',
            template,
            projectPrefix,
          ),
        );
      }
    }
  }

  return { rootResources, moduleResources };
}

// Helper function to group regular resources by prefix
async function groupResourcesByPrefix(
  commands: CommandManager,
  resourceType: ResourceFolderType,
  projectPrefix: string,
) {
  const resourceNames = await commands.showCmd.showResources(resourceType);
  const resources = await Promise.all(
    resourceNames.map((name: string) =>
      createResourceNode(commands, resourceType, name, projectPrefix),
    ),
  );

  const rootResources: unknown[] = [];
  const moduleResources: { [prefix: string]: unknown[] } = {};

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

/**
 * Delete a resource.
 * @param commands Command manager.
 * @param resource Resource to delete.
 */
export async function deleteResource(
  commands: CommandManager,
  resource: ResourceParams,
) {
  return commands.removeCmd.remove(
    resource.type.substring(
      0,
      resource.type.length - 1,
    ) as RemovableResourceTypes,
    resourceNameToString(resource),
  );
}

/**
 * Get the content of a file in a resource.
 * @param commands Command manager.
 * @param module Name of the module.
 * @param type Name of the type.
 * @param resource Name of the resource.
 * @param fileName Name of the file.
 * @returns The content of the file.
 */
export async function getFileContent(
  commands: CommandManager,
  module: string,
  type: string,
  resource: string,
  fileName: string,
) {
  return commands.showCmd.showFile(
    resourceName(`${module}/${type}/${resource}`),
    fileName,
  );
}

/**
 * Update a file of a folder resource. Cannot be used to create a new file.
 * @param commands Command manager.
 * @param module Name of the module.
 * @param type Name of the type.
 * @param resource Name of the resource.
 * @param fileName Name of the file.
 * @param changedContent The new content for the file.
 * @returns The updated file content.
 */
export async function updateFile(
  commands: CommandManager,
  module: string,
  type: string,
  resource: string,
  fileName: string,
  changedContent: string,
) {
  return commands.editCmd.editResourceContent(
    resourceName(`${module}/${type}/${resource}`),
    fileName,
    changedContent,
  );
}
