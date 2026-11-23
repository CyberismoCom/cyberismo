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

/**
 * Path params of a resource route. Resource routes name the prefix of the
 * resource `:resourcePrefix`, because the project-scoped routes are mounted
 * at `/api/projects/:prefix`, and Hono gives the project prefix for a
 * repeated `:prefix`. A resource of a module would then be looked up under
 * the prefix of the project.
 */
export const resourceRouteParamsSchema = z.object({
  resourcePrefix: z.string(),
  type: z.enum(resourceTypes),
  identifier: identifierSchema,
});

/**
 * Renames the `resourcePrefix` route param to the `prefix` of a resource
 * name.
 */
export function toResourcePrefix<T extends { resourcePrefix: string }>({
  resourcePrefix,
  ...rest
}: T): Omit<T, 'resourcePrefix'> & { prefix: string } {
  return { prefix: resourcePrefix, ...rest };
}

export const resourceParamsSchema =
  resourceRouteParamsSchema.transform(toResourcePrefix);

export type ResourceParams = z.infer<typeof resourceParamsSchema>;

export const resourceParamsWithCard = resourceRouteParamsSchema
  .extend({
    type: z.enum([...resourceTypes, 'cards']),
  })
  .transform(toResourcePrefix);

export type ResourceParamsWithCard = z.infer<typeof resourceParamsWithCard>;
