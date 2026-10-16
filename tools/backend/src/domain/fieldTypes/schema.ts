// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { z } from 'zod';
import { identifierSchema } from '../../common/validationSchemas.js';

export const createFieldTypeSchema = z.object({
  dataType: z.enum([
    'boolean',
    'date',
    'dateTime',
    'enum',
    'integer',
    'list',
    'longText',
    'number',
    'person',
    'shortText',
  ]),
  identifier: identifierSchema,
});
