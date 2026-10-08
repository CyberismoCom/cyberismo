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

// Card keys are '<project prefix>_<card id>'
const cardKey = z
  .string()
  .regex(/^[a-z]+_[A-Za-z0-9]+$/, 'must be a valid card key');

// Attachment file names are plain file names, without path components
const attachmentFileName = z
  .string()
  .min(1)
  .refine(
    (value) => value !== '.' && value !== '..' && !/[/\\\0]/.test(value),
    'must be a plain file name',
  );

export const cardKeyParamSchema = z.object({ key: cardKey });

// 'root' creates the card at the root level of the project
export const cardParentParamSchema = z.object({
  key: z.union([z.literal('root'), cardKey]),
});

export const attachmentParamSchema = z.object({
  key: cardKey,
  filename: attachmentFileName,
});

export const attachmentDownloadParamSchema = z.object({
  key: cardKey,
  attachment: z.string().min(1),
});

export const rawQuerySchema = z.object({
  raw: z.enum(['true', 'false']).optional(),
});

const metadataValue = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.union([z.string(), z.record(z.string(), z.unknown())])),
]);

export const updateCardSchema = z
  .object({
    content: z.string().optional(),
    metadata: z.record(z.string().min(1), metadataValue).optional(),
    state: z.string().min(1).optional(),
    parent: z.union([z.literal('root'), cardKey]).optional(),
    index: z.number().int().nonnegative().optional(),
  })
  .strict();

export const createCardSchema = z.object({
  template: z.string().min(1),
});

export const parseContentSchema = z.object({
  content: z.string(),
});
