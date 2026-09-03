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

import semver from 'semver';
import { z } from 'zod';

const gitSource = z
  .string()
  .min(1)
  .refine((s) => s.startsWith('https://') || s.startsWith('git@'), {
    message: 'Source must be a git URL (https:// or git@)',
  });

// The length floor is load-bearing: `validRange('')` is `'*'`, not null.
const semverRange = z
  .string()
  .min(1)
  .refine((s) => semver.validRange(s) !== null, {
    message: 'Version must be a valid semver version or range',
  });

// Updates target one concrete version; ranges only live in the declaration.
// Normalised here so a tag-style `v1.0.0` and a plain `1.0.0` name the same
// target everywhere below.
const semverVersion = z
  .string()
  .refine((s) => semver.valid(s) !== null, {
    message: 'Version must be a valid semver version',
    abort: true,
  })
  .transform((s) => semver.valid(s)!);

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

export const importModuleSchema = z.object({
  source: gitSource,
  version: semverRange.optional(),
});

export const updateModuleSchema = z.object({
  version: semverVersion.optional(),
});

// Exactly one of the two ways to name a source: a git URL for a module that
// is not installed yet, or the name of a declared module whose location the
// configuration already knows.
export const moduleVersionsQuerySchema = z
  .object({
    source: gitSource.optional(),
    module: z.string().min(1).optional(),
  })
  .refine(
    (query) => (query.source === undefined) !== (query.module === undefined),
    {
      message: "Provide exactly one of 'source' or 'module'",
    },
  );

export const updatePlanQuerySchema = z.object({
  version: semverVersion.optional(),
});
