// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { z } from 'zod';

export const linkCandidatesSchema = z.object({
  query: z.string().min(1),
});
