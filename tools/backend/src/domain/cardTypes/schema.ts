// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { z } from 'zod';
import { identifierSchema } from '../../common/validationSchemas.js';

export const createCardTypeSchema = z.object({
  identifier: identifierSchema,
  workflowName: z.string(),
});

export const visibilityGroup = z.enum(['always', 'optional', 'hidden']);
export type VisibilityGroup = z.infer<typeof visibilityGroup>;

export const fieldVisibilityBodySchema = z.object({
  fieldName: z.string().min(1),
  group: visibilityGroup,
  index: z.number().int().min(0).optional(),
});

export type FieldVisibilityBody = z.infer<typeof fieldVisibilityBodySchema>;

export const cardTypeNameParamSchema = z.object({
  cardTypeName: z.string().min(1),
});
