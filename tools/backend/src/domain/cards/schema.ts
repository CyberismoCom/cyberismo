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
