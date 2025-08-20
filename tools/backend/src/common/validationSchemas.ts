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
import { Validate } from '@cyberismo/data-handler';

const resourceTypes = [
  'calculations',
  'cardTypes',
  'fieldTypes',
  'graphModels',
  'graphViews',
  'linkTypes',
  'reports',
  'templates',
  'workflows',
] as const;

export const identifierSchema = z
  .string()
  .refine((value) => Validate.isValidIdentifierName(value), {
    message: 'Invalid identifier',
  });

export const resourceParamsSchema = z.object({
  prefix: z.string(),
  type: z.enum(resourceTypes),
  identifier: identifierSchema,
});

export type ResourceParams = z.infer<typeof resourceParamsSchema>;

export const resourceParamsWithCard = resourceParamsSchema.extend({
  type: z.enum([...resourceTypes, 'cards']),
});

export type ResourceParamsWithCard = z.infer<typeof resourceParamsWithCard>;
