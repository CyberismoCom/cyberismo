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
