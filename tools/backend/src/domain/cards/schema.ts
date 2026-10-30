// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { z } from 'zod';

const linkDirection = z.enum(['outbound', 'inbound']);

export const createLinkSchema = z.object({
  toCard: z.string(),
  linkType: z.string(),
  direction: linkDirection.default('outbound'),
  description: z.string().optional(),
});

export const removeLinkSchema = z.object({
  toCard: z.string(),
  linkType: z.string(),
  direction: linkDirection.default('outbound'),
  description: z.string().optional(),
});

export const updateLinkSchema = z.object({
  toCard: z.string(),
  linkType: z.string(),
  direction: linkDirection,
  description: z.string().optional(),
  previousToCard: z.string(),
  previousLinkType: z.string(),
  previousDirection: linkDirection,
  previousDescription: z.string().optional(),
});

// Interpolated into the exported document's AsciiDoc header, where a line break
// starts a new attribute entry.
const headerValue = z
  .string()
  .min(1)
  .regex(/^[^\r\n]*$/, 'must not contain line breaks');

export const exportCardPdfSchema = z.object({
  title: headerValue,
  name: headerValue,
  cardKey: z.string(),
  exportChildCards: z.boolean(),
  version: headerValue.optional(),
});

export type ExportCardPdfRequestBody = z.infer<typeof exportCardPdfSchema>;

export const cardBatchSchema = z.object({
  keys: z.array(z.string()).min(1).max(100),
});
