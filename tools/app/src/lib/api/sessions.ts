/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2025

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import useSWR, { mutate } from 'swr';
import { callApi, apiPaths } from '../swr';
import { useUpdating } from '../hooks';
import type {
  EditSession,
  EditSessionSaveResult,
  EditSessionPublishResult,
} from '@cyberismo/data-handler';

export type SessionAction =
  | 'start'
  | 'save'
  | 'publish'
  | 'discard'
  | 'list'
  | 'check';

/**
 * Response type for checking if a card has an active session.
 */
export interface CardSessionStatus {
  hasSession: boolean;
  session: EditSession | null;
}

/**
 * Hook to get all active edit sessions.
 */
export function useSessions() {
  const { data, error, isLoading, mutate: mutateSessions } = useSWR<EditSession[]>(
    apiPaths.sessions(),
  );

  return {
    sessions: data ?? [],
    error,
    isLoading,
    mutate: mutateSessions,
  };
}

/**
 * Hook to get an edit session by ID.
 */
export function useSession(sessionId: string | null) {
  const { data, error, isLoading, mutate: mutateSession } = useSWR<EditSession>(
    sessionId ? apiPaths.session(sessionId) : null,
  );

  return {
    session: data ?? null,
    error,
    isLoading,
    mutate: mutateSession,
  };
}

/**
 * Hook to check if a card has an active edit session.
 */
export function useCardSession(cardKey: string | null) {
  const { data, error, isLoading, mutate: mutateCardSession } = useSWR<CardSessionStatus>(
    cardKey ? apiPaths.sessionForCard(cardKey) : null,
  );

  return {
    hasSession: data?.hasSession ?? false,
    session: data?.session ?? null,
    error,
    isLoading,
    mutate: mutateCardSession,
  };
}

/**
 * Hook for session mutations (start, save, publish, discard).
 */
export function useSessionMutations(cardKey: string | null) {
  const swrKey = cardKey ? apiPaths.sessionForCard(cardKey) : null;
  const { isUpdating, call } = useUpdating(swrKey);

  return {
    isUpdating: (action?: SessionAction) => isUpdating(action),

    /**
     * Start a new edit session for the card.
     */
    startSession: async (): Promise<EditSession | null> => {
      if (!cardKey) return null;
      return call(async () => {
        const session = await callApi<EditSession>(apiPaths.sessions(), 'POST', {
          cardKey,
        });
        // Invalidate the sessions list and card session check
        mutate(apiPaths.sessions());
        mutate(apiPaths.sessionForCard(cardKey));
        return session;
      }, 'start');
    },

    /**
     * Save (commit) changes in the current session.
     */
    saveSession: async (sessionId: string): Promise<EditSessionSaveResult | null> => {
      if (!sessionId) return null;
      return call(async () => {
        const result = await callApi<EditSessionSaveResult>(
          apiPaths.sessionSave(sessionId),
          'POST',
        );
        // Invalidate the session data
        mutate(apiPaths.session(sessionId));
        if (cardKey) {
          mutate(apiPaths.sessionForCard(cardKey));
        }
        return result;
      }, 'save');
    },

    /**
     * Publish (merge) the session to the main branch.
     */
    publishSession: async (sessionId: string): Promise<EditSessionPublishResult | null> => {
      if (!sessionId) return null;
      return call(async () => {
        const result = await callApi<EditSessionPublishResult>(
          apiPaths.sessionPublish(sessionId),
          'POST',
        );
        // Invalidate all session data and the card/tree data
        mutate(apiPaths.sessions());
        mutate(apiPaths.session(sessionId));
        if (cardKey) {
          mutate(apiPaths.sessionForCard(cardKey));
          mutate(apiPaths.card(cardKey));
          mutate(apiPaths.rawCard(cardKey));
        }
        mutate(apiPaths.tree());
        return result;
      }, 'publish');
    },

    /**
     * Discard the session, removing all uncommitted changes.
     */
    discardSession: async (sessionId: string): Promise<void> => {
      if (!sessionId) return;
      await call(async () => {
        await callApi<void>(apiPaths.session(sessionId), 'DELETE');
        // Invalidate all session data
        mutate(apiPaths.sessions());
        mutate(apiPaths.session(sessionId), undefined, false);
        if (cardKey) {
          mutate(apiPaths.sessionForCard(cardKey));
        }
      }, 'discard');
    },
  };
}

/**
 * Clean up orphaned sessions.
 */
export async function cleanupSessions(): Promise<void> {
  await callApi<{ message: string }>(apiPaths.sessionsCleanup(), 'POST');
  mutate(apiPaths.sessions());
}
