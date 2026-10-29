// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { z } from 'zod';
import { Validate } from '@cyberismo/data-handler';

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
