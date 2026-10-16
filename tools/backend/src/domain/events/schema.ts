// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { z } from 'zod';

export const presenceSchema = z.object({
  connectionId: z.uuid(),
  sequence: z.number().int().nonnegative(),
  cardKey: z.string().min(1).nullable(),
  mode: z.enum(['viewing', 'editing']),
});
