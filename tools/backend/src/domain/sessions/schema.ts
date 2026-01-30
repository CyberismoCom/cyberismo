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

import { z } from 'zod';

/**
 * Schema for starting a new edit session.
 */
export const startSessionSchema = z.object({
  cardKey: z.string().min(1, 'Card key is required'),
});

/**
 * Schema for session ID parameter.
 */
export const sessionIdParamSchema = z.object({
  id: z.string().min(1, 'Session ID is required'),
});

/**
 * Schema for card key query parameter.
 */
export const cardKeyQuerySchema = z.object({
  cardKey: z.string().min(1).optional(),
});

export type StartSessionInput = z.infer<typeof startSessionSchema>;
export type SessionIdParam = z.infer<typeof sessionIdParamSchema>;
export type CardKeyQuery = z.infer<typeof cardKeyQuerySchema>;
