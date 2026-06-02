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
import { Validate } from '@cyberismo/data-handler';

export const createProjectSchema = z.object({
  name: z
    .string()
    .min(1, 'Project name is required')
    .refine((s) => Validate.isValidProjectName(s), {
      message: 'Invalid project name',
    }),
  prefix: z
    .string()
    .min(3, 'Prefix must be at least 3 characters')
    .max(10, 'Prefix must be at most 10 characters')
    .refine((s) => Validate.validatePrefix(s), {
      message: 'Prefix must contain only lowercase letters',
    }),
  category: z.string().optional().default(''),
  description: z.string().optional().default(''),
});

export const cloneProjectSchema = z.object({
  url: z
    .string()
    .min(1, 'Repository URL is required')
    .refine((s) => s.startsWith('https://') || s.startsWith('git@'), {
      message: 'URL must start with https:// or git@',
    }),
});
