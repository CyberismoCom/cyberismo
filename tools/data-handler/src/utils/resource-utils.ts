/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024
    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.
    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.
    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { parse } from 'node:path';

interface ResourceName {
  prefix: string;
  type: string;
  name: string;
}

/**
 * Returns resource name parts (project prefix, type in plural, name of the resource).
 * @param resourceName Full name of the resource (e.g. <prefix>/<type>/<name>)
 * @returns resource name parts: project or module prefix, resource type (plural) and actual name of the resource.
 */
export function resourceNameParts(resourceName: string): ResourceName {
  const parts = resourceName.split('/');
  // short name format - type and prefix are unknown
  if (parts.length === 1 && parts.at(0) !== '') {
    return {
      prefix: '',
      type: '',
      name: resourceName,
    };
  }
  // long name format
  if (parts.length === 3) {
    return {
      prefix: parts[0],
      type: parts[1],
      name: parse(parts[2]).name,
    };
  }
  // other formats are not accepted
  throw new Error(`Name '${resourceName}' is not valid resource name`);
}
