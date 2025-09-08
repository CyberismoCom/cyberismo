/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024
    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.
    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.
    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

// node
import { join, parse, sep } from 'node:path';

import type { Project } from '../containers/project.js';
import { stripExtension } from './file-utils.js';

// Resource name parts are:
// - prefix; name of the project this resource is part of
// - type; type of resource; in plural
// - identifier; unique name (within a project/module) for the resource
export interface ResourceName {
  prefix: string;
  type: string; // todo: should be a ResourceFolderType
  identifier: string;
}

// Indexes of resource name parts
const PREFIX_INDEX = 0;
const TYPE_INDEX = 1;
const IDENTIFIER_INDEX = 2;
// Valid resource name has three parts
const RESOURCE_NAME_PARTS = 3;
const RESOURCE_FOLDER_TYPES = [
  'graphModels',
  'graphViews',
  'reports',
  'templates',
];

export function isResourceFolderType(type: string): boolean {
  return RESOURCE_FOLDER_TYPES.includes(type);
}
// Checks if name is valid (3 parts, separated by '/').
export function isResourceName(name: string): boolean {
  const partsCount = name.split('/').length;
  return partsCount === RESOURCE_NAME_PARTS;
}

/**
 * Returns resource name parts (project prefix, type in plural, name of the resource).
 * @param resourceName Name of the resource (e.g. <prefix>/<type>/<name>)
 * @param strict If true, does not allow names without 'prefix' and 'type'.
 * @throws if 'resourceName' is not valid resource name.
 * @returns resource name parts: project or module prefix, resource type (plural) and actual name of the resource.
 * @todo: In the future, switch the default value of 'strict' to true. Only in certain cases should we accept names with just 'identifier'.
 */
export function resourceName(
  resourceName: string,
  strict: boolean = false,
): ResourceName {
  const parts = resourceName.split('/');
  // just resource identifier - type and prefix are unknown
  if (parts.length === 1 && parts.at(0) !== '') {
    if (strict) {
      throw new Error(`Name '${resourceName}' is not valid resource name`);
    }
    return {
      prefix: '',
      type: '',
      identifier: resourceName,
    };
  }
  // resource name
  if (parts.length === RESOURCE_NAME_PARTS) {
    return {
      prefix: parts[PREFIX_INDEX],
      type: parts[TYPE_INDEX],
      identifier: parse(parts[IDENTIFIER_INDEX]).name,
    };
  }
  // other formats are not accepted
  if (resourceName === '') {
    throw new Error('Must define resource name to query its details');
  }
  throw new Error(`Name '${resourceName}' is not valid resource name`);
}

/**
 * Converts resource name to path.
 * @param project Project
 * @param resourceName Name of the resource (e.g. <prefix>/<type>/<name>)
 * @returns path to resource metadata file
 */
export function resourceNameToPath(
  project: Project,
  resourceName: ResourceName,
  extension: string = '.json',
): string {
  if (project.projectPrefix === resourceName.prefix) {
    return join(
      project.paths.resourcesFolder,
      resourceName.type,
      resourceName.identifier + extension,
    );
  } else if (resourceName.prefix !== '') {
    return join(
      project.paths.modulesFolder,
      resourceName.prefix,
      resourceName.type,
      resourceName.identifier + extension,
    );
  }
  throw new Error('resourceName does not contain prefix');
}

/**
 * Return path to a file in a folder resource
 * @param project Project
 * @param resourceName Resource name
 * @param fileName File name
 * @returns Path to file in folder resource
 */
export function resourceFilePath(
  project: Project,
  resourceName: ResourceName,
  fileName: string,
): string {
  const resourcePath = resourceNameToPath(project, resourceName, '');
  return join(resourcePath, fileName);
}

/**
 * Resource metadata file path to resource name (e.g. <prefix>/<type>/<name>)
 * @param project Project where resource is in
 * @param path Path to resource metadata file
 * @returns Resource name (<prefix>/<type>/<name>)
 */
export function pathToResourceName(
  project: Project,
  path: string,
): ResourceName {
  const parts = path.split(sep);
  const modulesIndex = parts.lastIndexOf('modules');
  const localIndex = parts.lastIndexOf('local');
  // Check that either 'local' or 'modules' is included in path (but not both).
  // And after that there is required amount of parts.
  if (
    (modulesIndex === -1 && localIndex === -1) ||
    (modulesIndex !== -1 && localIndex !== -1) ||
    (modulesIndex !== -1 &&
      localIndex === 1 &&
      parts.length === modulesIndex + 3) ||
    (modulesIndex === -1 &&
      localIndex !== -1 &&
      parts.length === localIndex + 2)
  ) {
    throw new Error(`invalid path: ${path}`);
  }
  // Finally check that all relevant parts are defined.
  const prefix =
    modulesIndex !== -1 ? parts.at(modulesIndex + 1) : project.projectPrefix;
  const typeIndex = modulesIndex !== -1 ? modulesIndex + 2 : localIndex + 1;
  const identifierIndex =
    modulesIndex !== -1 ? modulesIndex + 3 : localIndex + 2;
  const type = parts.at(typeIndex);
  const identifier = stripExtension(parts.at(identifierIndex)!);
  if (!identifier || !type || !prefix) {
    throw new Error(`invalid path: ${path}`);
  }
  if (identifierIndex + 1 !== parts.length) {
    throw new Error(`not a resource path: ${path}`);
  }

  return {
    prefix: prefix,
    type: type,
    identifier: identifier,
  };
}

/**
 * Returns ResourceName as a single string.
 * @param resourceName Resource name to convert.
 * @returns resource name as a single string.
 * @note that valid resource names are: empty string, identifier alone and prefix/type/identifier combination.
 */
export function resourceNameToString(resourceName: ResourceName): string {
  if (!resourceName.prefix && !resourceName.type && !resourceName.identifier) {
    return '';
  }
  if (resourceName.identifier === '') {
    throw new Error(`Not a valid resource name. Identifier is missing.`);
  }
  if (
    resourceName.prefix &&
    resourceName.identifier &&
    resourceName.type === ''
  ) {
    throw new Error(`Not a valid resource name. Type is missing.`);
  }
  if (
    resourceName.prefix === '' &&
    resourceName.identifier &&
    resourceName.type
  ) {
    throw new Error(`Not a valid resource name. Prefix is missing.`);
  }
  return resourceName.prefix && resourceName.type && resourceName.prefix
    ? `${resourceName.prefix}/${resourceName.type}/${resourceName.identifier}`
    : `${resourceName.identifier}`;
}
