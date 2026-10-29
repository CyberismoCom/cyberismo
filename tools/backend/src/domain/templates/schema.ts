// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { z } from 'zod';
import { identifierSchema } from '../../common/validationSchemas.js';

export const createTemplateSchema = z.object({
  identifier: identifierSchema,
});

export const addTemplateCardSchema = z.object({
  template: z.string(),
  cardType: z.string().min(1, 'cardType is required'),
  parentKey: z.string().optional(),
  count: z.number().int().positive().optional(),
});
