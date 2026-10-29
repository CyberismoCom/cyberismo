// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { z } from 'zod';

export const moduleParamSchema = z.object({
  module: z.string().min(1),
});

export const updateProjectSchema = z.object({
  name: z.string().optional(),
  cardKeyPrefix: z.string().optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  gitRemoteUrl: z
    .string()
    .refine((s) => s.startsWith('https://') || s.startsWith('git@'), {
      message: 'Git remote URL must start with https:// or git@',
    })
    .optional(),
});

export const addHubSchema = z.object({
  location: z.url({
    protocol: /^https?$/,
    error: 'Hub location must be a valid HTTP or HTTPS URL',
  }),
});

// Removal accepts any stored location: configurations written before locations
// were validated may hold entries this schema would otherwise refuse, and those
// have to stay removable.
export const removeHubSchema = z.object({
  location: z.string().min(1),
});

// 'dryRun' is required so that a request whose body did not arrive fails with
// 400 instead of defaulting into the destructive real clean. The command's
// 'cardType' narrowing is deliberately not exposed yet.
export const cleanSchema = z.object({
  dryRun: z.boolean(),
});

// Credentials in a source would be stored in cardsConfig.json and echoed in
// query strings, logs and errors.
const gitSourceSchema = z
  .string()
  .min(1)
  .refine((s) => s.startsWith('https://') || s.startsWith('git@'), {
    message: 'Source must be a git URL (https:// or git@)',
  })
  .refine(
    (s) => {
      if (!s.startsWith('https://')) return true;
      try {
        const { username, password } = new URL(s);
        return username === '' && password === '';
      } catch {
        return false;
      }
    },
    { message: 'Source must be a valid URL without credentials' },
  );

// A blank range is a valid semver range meaning '*', which would unpin.
const rangeSchema = z.string().trim().min(1);

export const importModuleSchema = z.object({
  source: gitSourceSchema,
  range: rangeSchema.optional(),
});

export const updateModuleSchema = z.object({
  range: rangeSchema.optional(),
});

export const moduleVersionsQuerySchema = z
  .object({
    module: z.string().min(1).optional(),
    source: gitSourceSchema.optional(),
  })
  .refine((q) => (q.module === undefined) !== (q.source === undefined), {
    message: 'Provide exactly one of module or source',
  });
