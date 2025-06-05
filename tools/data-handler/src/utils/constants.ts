/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2024
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import type { PredefinedCardMetadata } from '../interfaces/project-interfaces.js';

export const INT32_MAX = 2147483647; // 2^31-1

/**
 * These are field names that are non-custom fields that present in metadata
 */
export const PREDEFINED_FIELDS = [
  'rank',
  'cardType',
  'title',
  'workflowState',
  'lastUpdated',
  'lastTransitioned',
  'templateCardKey',
] satisfies (keyof PredefinedCardMetadata)[];

/**
 * Checks if the given value is a predefined field.
 * @param value The field name to check.
 * @returns True if the value is a predefined field, false otherwise.
 */
export function isPredefinedField(
  value: string,
): value is keyof PredefinedCardMetadata {
  return (PREDEFINED_FIELDS as string[]).includes(value);
}
