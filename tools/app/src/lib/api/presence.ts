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

const PRESENCE_REFETCH_DEBOUNCE_MS = 500;

/**
 * Refetches a card's content when a *different* user finishes editing it.
 *
 * Watches the presence list (as returned by `usePresence`) for a transition
 * where another user's mode moves from 'editing' to 'viewing', then
 * revalidates the card's SWR cache entries so views that render straight
 * from SWR data (e.g. the project card view) pick up the change without a
 * manual reload. The local user's own transitions are ignored.
 *
 * A local mode change reconnects this client's presence EventSource, which
 * can produce a rapid burst of presence updates (including a transient
 * empty list while reconnecting); the refetch is debounced so a burst like
 * that collapses into at most one revalidation.
 *
 * Callers must opt in via `enabled`. Only enable this for views that read
 * card content straight from SWR data. Editors that seed a local draft from
 * the card once and don't re-sync it (e.g. TemplateCardEditor, see
 * INTDEV-1368) must NOT enable this yet: revalidating the underlying SWR
 * entry behind their back would make their already-stale draft look dirty
 * against fresh data it never adopted, corrupting the unsaved-changes check.
 *
 * @param presence - Current presence list, as returned by `usePresence`
 * @param currentUserId - The local user's id, so their own transitions are ignored
 * @param cardKey - The card whose SWR cache entries should be revalidated
 * @param enabled - Opt-in switch; `false` (the default posture) is a no-op
 * @param projectPrefix - Optional project prefix override, see `usePresence`
 */
export function useRefetchCardOnPresenceChange(
  presence: PresenceEntry[],
  currentUserId: string | undefined,
  cardKey: string | null,
  enabled: boolean,
  projectPrefix?: string,
): void {
  const previousModesRef = useRef<Map<string, PresenceEntry['mode']>>(
    new Map(),
  );
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const previousModes = previousModesRef.current;
    const currentModes = new Map(presence.map((e) => [e.userId, e.mode]));

    const someoneElseStoppedEditing = presence.some(
      (entry) =>
        entry.userId !== currentUserId &&
        entry.mode === 'viewing' &&
        previousModes.get(entry.userId) === 'editing',
    );

    previousModesRef.current = currentModes;

    if (!enabled || !cardKey || !someoneElseStoppedEditing) {
      return;
    }

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      const apiPaths = projectApiPaths(projectPrefix);
      mutate(apiPaths.card(cardKey));
      mutate(apiPaths.rawCard(cardKey));
    }, PRESENCE_REFETCH_DEBOUNCE_MS);
  }, [presence, currentUserId, cardKey, enabled, projectPrefix]);

  useEffect(
    () => () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    },
    [],
  );
}
