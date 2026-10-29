// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

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
  skipDefaultHub: z.boolean().optional(),
});

export const cloneProjectSchema = z.object({
  url: z
    .string()
    .min(1, 'Repository URL is required')
    .refine((s) => s.startsWith('https://') || s.startsWith('git@'), {
      message: 'URL must start with https:// or git@',
    }),
});
