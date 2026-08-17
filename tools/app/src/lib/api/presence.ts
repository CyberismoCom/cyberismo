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

import { useEffect, useRef, useState } from 'react';
import { mutate } from 'swr';
import { getConfig } from '@/lib/utils';
import { projectApiPaths } from '@/lib/swr.js';
import { UserRole, useHasMinRole } from '@/lib/auth';
import { useUser } from './user';
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
  projectPrefix?: string,
): PresenceEntry[] {
  const canEdit = useHasMinRole(UserRole.Editor);
  const [editors, setEditors] = useState<PresenceEntry[]>([]);
  const config = getConfig();
  const isEnabled = !config.staticMode && !!config.presenceEnabled;
  const url =
    cardKey && isEnabled && canEdit
      ? projectApiPaths(projectPrefix).presence(cardKey, mode)
      : null;

  useEffect(() => {
    if (!url) {
      return;
    }

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
    const handlePageHide = () => {
      eventSource.close();
    };
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      eventSource.close();
      setEditors([]);
    };
  }, [url]);

  return editors;
}

/**
 * Refetches a card once no other user is editing it any more.
 *
 * Watches the presence list (as returned by `usePresence`) for the edge where
 * the last *other* editor leaves edit mode — either by switching to 'viewing'
 * or by dropping off the list entirely (closing the tab drops the presence
 * entry, it does not transition it) — and revalidates the card's SWR entries
 * so the view picks up the change without a manual reload.
 *
 * Deliberately biased towards refetching once too often: a presence
 * EventSource reconnect blips the list empty, which reads as "nobody else is
 * editing" and costs one redundant GET. Missing a refetch would leave stale
 * content on screen, which is the thing this hook exists to prevent.
 *
 * @param presence - Current presence list, as returned by `usePresence`
 * @param cardKey - The card whose SWR cache entries should be revalidated
 * @param projectPrefix - Optional project prefix override, see `usePresence`
 */
export function useRefetchCardOnPresenceChange(
  presence: PresenceEntry[],
  cardKey: string | null,
  projectPrefix?: string,
): void {
  const { user } = useUser();
  const othersEditing = presence.some(
    (entry) => entry.userId !== user?.id && entry.mode === 'editing',
  );
  const othersWereEditingRef = useRef(false);

  useEffect(() => {
    if (othersWereEditingRef.current && !othersEditing && cardKey) {
      const apiPaths = projectApiPaths(projectPrefix);
      mutate(apiPaths.card(cardKey));
      mutate(apiPaths.rawCard(cardKey));
    }
    othersWereEditingRef.current = othersEditing;
  }, [othersEditing, cardKey, projectPrefix]);
}
