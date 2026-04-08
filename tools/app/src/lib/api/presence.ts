/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { useEffect, useState } from 'react';
import { getConfig } from '@/lib/utils';
import { apiPaths } from '@/lib/swr.js';
import { z } from 'zod';

const presenceEntrySchema = z.object({
  userId: z.string(),
  userName: z.string(),
  mode: z.enum(['viewing', 'editing']),
});

const presenceEventSchema = z.object({
  editors: z.array(presenceEntrySchema),
});

export type PresenceEntry = z.infer<typeof presenceEntrySchema>;

/**
 * Hook that connects to the card presence SSE endpoint.
 * Returns a list of users currently viewing or editing the card.
 *
 * @param cardKey - The card to track presence for
 * @param mode - Whether the current user is 'viewing' or 'editing'
 */
export function usePresence(
  cardKey: string | null,
  mode: 'viewing' | 'editing' = 'viewing',
): PresenceEntry[] {
  const [editors, setEditors] = useState<PresenceEntry[]>([]);

  useEffect(() => {
    if (!cardKey || getConfig().staticMode) {
      return;
    }

    const url = apiPaths.presence(cardKey, mode);
    const eventSource = new EventSource(url);

    eventSource.addEventListener('presence', (event) => {
      try {
        const data = presenceEventSchema.parse(JSON.parse(event.data));
        setEditors(data.editors);
      } catch (e) {
        console.warn('Malformed presence event', e);
      }
    });

    eventSource.addEventListener('error', () => {
      // EventSource will auto-reconnect; clear state on error
      setEditors([]);
    });

    return () => {
      eventSource.close();
      setEditors([]);
    };
  }, [cardKey, mode]);

  if (!cardKey || getConfig().staticMode) return [];

  return editors;
}
