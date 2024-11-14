/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024
    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.
    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.
    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { parse } from 'node:path';
import { sepRegex } from './file-utils.js';

// Resource name parts are:
// - prefix; name of the project this resource is part of
// - type; type of resource; in plural
// - identifier; unique name (within a project/module) for the resource
interface ResourceName {
  prefix: string;
  type: string;
  identifier: string;
}

// Indexes of resource name parts
const PREFIX_INDEX = 0;
const TYPE_INDEX = 1;
const IDENTIFIER_INDEX = 2;
// Valid resource name has three parts
const RESOURCE_NAME_PARTS = 3;

const LOCAL_RESOURCE = 'local';

// Checks if name is valid (3 parts, separated by '/').
export function isResourceName(name: string): boolean {
  const partsCount = name.split('/').length;
  return partsCount === RESOURCE_NAME_PARTS;
}

/**
 * Returns resource name as identifier. In error cases, returns empty resource.
 * @param resourceName Name of the resource.
 * @returns resource name as identifier.
 */
export function identifierFromResourceName(resourceName: string): string {
  const parts = resourceName.split(sepRegex);
  if (parts.length == 0 || parts.length > RESOURCE_NAME_PARTS) {
    return '';
  }
  if (parts.length === RESOURCE_NAME_PARTS) {
    if (parts[PREFIX_INDEX] === LOCAL_RESOURCE) {
      return parts[IDENTIFIER_INDEX];
    }
  }
  return resourceName;
}

/**
 * Returns resource name parts (project prefix, type in plural, name of the resource).
 * @param resourceName Name of the resource (e.g. <prefix>/<type>/<name>)
 * @throws if 'resourceName' is not valid resource name.
 * @returns resource name parts: project or module prefix, resource type (plural) and actual name of the resource.
 */
export function resourceNameParts(resourceName: string): ResourceName {
  const parts = resourceName.split('/');
  // just resource identifier - type and prefix are unknown
  if (parts.length === 1 && parts.at(0) !== '') {
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
  throw new Error(`Name '${resourceName}' is not valid resource name`);
}
