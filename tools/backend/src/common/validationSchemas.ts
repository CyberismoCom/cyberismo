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
import { z } from 'zod';
import { resourceName, Validate } from '@cyberismo/data-handler';

export const resourceTypes = [
  'calculations',
  'cardTypes',
  'fieldTypes',
  'graphModels',
  'graphViews',
  'linkTypes',
  'reports',
  'skills',
  'templates',
  'workflows',
] as const;

export const identifierSchema = z
  .string()
  .refine((value) => Validate.isValidIdentifierName(value), {
    message: 'Invalid identifier',
  });

export const prefixSchema = z
  .string()
  .refine((value) => Validate.validatePrefix(value), {
    message: 'Invalid project prefix',
  });

// Checks that a full resource name 'prefix/type/identifier' is valid.
function isValidResourceName(value: string, type?: string): boolean {
  try {
    const name = resourceName(value, true);
    return (
      `${name.prefix}/${name.type}/${name.identifier}` === value &&
      (type === undefined || name.type === type) &&
      Validate.validatePrefix(name.prefix) &&
      Validate.isValidIdentifierName(name.identifier)
    );
  } catch {
    return false;
  }
}

/**
 * Schema for a full resource name, such as 'prefix/cardTypes/identifier'.
 * @param type Optional resource type that the name must have.
 */
export const resourceNameSchema = (type?: (typeof resourceTypes)[number]) =>
  z.string().refine((value) => isValidResourceName(value, type), {
    message: type ? `Invalid ${type} resource name` : 'Invalid resource name',
  });

export const resourceParamsSchema = z.object({
  prefix: prefixSchema,
  type: z.enum(resourceTypes),
  identifier: identifierSchema,
});

export type ResourceParams = z.infer<typeof resourceParamsSchema>;

export const resourceParamsWithCard = resourceParamsSchema.extend({
  type: z.enum([...resourceTypes, 'cards']),
});

export type ResourceParamsWithCard = z.infer<typeof resourceParamsWithCard>;
