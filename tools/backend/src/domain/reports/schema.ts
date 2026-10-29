// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { z } from 'zod';
import { identifierSchema } from '../../common/validationSchemas.js';

export const createReportSchema = z.object({
  identifier: identifierSchema,
});
