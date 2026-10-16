// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { z } from 'zod';

export const createCalculationSchema = z.object({
  identifier: z.string().min(1),
});
