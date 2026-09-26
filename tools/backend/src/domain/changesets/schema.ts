/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026
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

export const createChangeSetSchema = z.object({
  title: z.string().trim().min(1).max(200),
  // Make it the user's active changeSet; the default
  activate: z.boolean().optional(),
});

export const activeChangeSetSchema = z.object({
  id: z.string().min(1).nullable(),
});

export const reviewedSchema = z.object({
  reviewed: z.boolean(),
});

export const updateChangeSetSchema = z.object({
  resolutions: z
    .record(
      z.string().min(1),
      z.union([
        z.literal('ours'),
        z.literal('theirs'),
        z.object({ content: z.string() }),
      ]),
    )
    .optional(),
});
