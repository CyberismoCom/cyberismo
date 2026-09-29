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

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { z } from 'zod';
import { getConfig } from '../utils';
import { callApi, globalApiPaths, projectApiPaths } from '../swr';
import { store } from '../store';
import {
  ProjectEventsContext,
  type CardUpdatedEvent,
  type PresenceEntry,
} from './ProjectEventsContext';

const STALE_PRESENCE_MS = 10_000;
const RECONNECT_BACKOFF_MS = 3_000;
// Matches the server's presence lease, so a stale tab and an expired
// presence lapse together.
const WATCHDOG_MS = 90_000;

const entrySchema = z.object({
  userId: z.string(),
  userName: z.string(),
  mode: z.enum(['viewing', 'editing']),
});
const readySchema = z.object({
  connectionId: z.string(),
});
const presenceSchema = z.object({
  cardKey: z.string(),
  users: z.array(entrySchema),
});
const cardUpdatedSchema = z.object({
  cardKey: z.string(),
  userId: z.string().optional(),
  userName: z.string().optional(),
});

function parseData(event: MessageEvent): unknown {
  try {
    return JSON.parse(event.data);
  } catch {
    return undefined;
  }
}

export function ProjectEventsProvider({
  projectPrefix,
  children,
}: {
  projectPrefix?: string;
  children: ReactNode;
}) {
  const [presence, setPresence] = useState<Record<string, PresenceEntry[]>>({});
  const [disconnected, setDisconnected] = useState(false);
  const cardListeners = useRef(new Set<(event: CardUpdatedEvent) => void>());
  const desired = useRef({
    cardKey: null as string | null,
    mode: 'viewing' as PresenceEntry['mode'],
    token: {},
  });
  const sendRef = useRef<() => void>(() => {});
  const { staticMode } = getConfig();

  const subscribeToCardUpdates = useCallback(
    (listener: (event: CardUpdatedEvent) => void) => {
      cardListeners.current.add(listener);
      return () => {
        cardListeners.current.delete(listener);
      };
    },
    [],
  );

  const reportPresence = useCallback(
    (cardKey: string | null, mode: PresenceEntry['mode']) => {
      const token = {};
      desired.current = { cardKey, mode, token };
      queueMicrotask(() => sendRef.current());
      return () => {
        if (desired.current.token !== token) return;
        desired.current = { cardKey: null, mode: 'viewing', token: {} };
        queueMicrotask(() => {
          sendRef.current();
          // Skip if a mode-only change already redeclared this same card.
          if (cardKey && desired.current.cardKey !== cardKey) {
            setPresence((previous) => {
              const next = { ...previous };
              delete next[cardKey];
              return next;
            });
          }
        });
      };
    },
    [],
  );

  useEffect(() => {
    if (staticMode) return;
    if (!projectPrefix) return;
    const apiPaths = projectApiPaths(projectPrefix);
    let source: EventSource | undefined;
    let connectionId: string | undefined;
    let sequence = 0;
    let disposed = false;
    let expired = false;
    let staleTimer: ReturnType<typeof setTimeout> | undefined;
    let watchdog: ReturnType<typeof setTimeout> | undefined;

    const send = () => {
      if (!connectionId || disposed) return;
      const { cardKey, mode } = desired.current;
      // Monotonic sequence numbers make delayed HTTP requests harmless.
      void callApi(apiPaths.presence(), 'PUT', {
        connectionId,
        sequence: ++sequence,
        cardKey,
        mode,
      }).catch(() => {});
    };
    sendRef.current = send;

    const open = () => {
      const current = new EventSource(apiPaths.events());
      source = current;
      clearTimeout(staleTimer);
      staleTimer = undefined;
      const stale = () => disposed || source !== current;
      const armWatchdog = () => {
        setDisconnected(false);
        clearTimeout(watchdog);
        watchdog = setTimeout(() => {
          if (stale()) return;
          // EventSource itself never reports a silent drop, so this is the
          // only point that ever learns to retry; give it a fresh attempt.
          setDisconnected(true);
          close();
          reopen();
        }, WATCHDOG_MS);
      };
      current.addEventListener('ready', (event) => {
        if (stale()) return;
        const parsed = readySchema.safeParse(parseData(event));
        if (!parsed.success) return;
        clearTimeout(staleTimer);
        staleTimer = undefined;
        connectionId = parsed.data.connectionId;
        setPresence({});
        armWatchdog();
        send();
      });
      current.addEventListener('hb', () => {
        if (stale()) return;
        armWatchdog();
        // Renewal rides the heartbeat: no stream, no renewal, so presence
        // cannot outlive the connection it describes.
        if (desired.current.cardKey) send();
      });
      current.addEventListener('presence.updated', (event) => {
        if (stale()) return;
        const parsed = presenceSchema.safeParse(parseData(event));
        if (!parsed.success) return;
        const { cardKey, users } = parsed.data;
        setPresence((previous) => {
          const next = { ...previous };
          if (users.length) next[cardKey] = users;
          else delete next[cardKey];
          return next;
        });
      });
      current.addEventListener('card.updated', (event) => {
        if (stale()) return;
        const parsed = cardUpdatedSchema.safeParse(parseData(event));
        if (!parsed.success) return;
        for (const listener of cardListeners.current) listener(parsed.data);
      });
      current.addEventListener('error', () => {
        if (stale()) return;
        connectionId = undefined;
        if (current.readyState === EventSource.CLOSED) {
          // The browser reaches CLOSED only on a fatal status (e.g. 401) and
          // will not retry on its own; probe auth so a real expiry surfaces
          // the existing session-expired banner, and otherwise reconnect.
          close();
          void callApi(globalApiPaths.user(), 'GET')
            .catch(() => {})
            .then(() => {
              // A 401 raises the session-expired banner from inside callApi,
              // which today never settles this promise. Check anyway, so an
              // expired session still cannot reconnect if that ever changes.
              if (store.getState().session.sessionExpired) {
                expired = true;
                return;
              }
              if (!disposed) setTimeout(reopen, RECONNECT_BACKOFF_MS);
            });
          return;
        }
        // A blip is advisory, not a fact: keep last-known presence until this
        // elapses with no ready.
        staleTimer ??= setTimeout(() => {
          staleTimer = undefined;
          if (stale()) return;
          setPresence({});
        }, STALE_PRESENCE_MS);
      });
    };

    const close = () => {
      source?.close();
      source = undefined;
      connectionId = undefined;
    };
    const reopen = () => {
      if (!source && !disposed && !expired) open();
    };

    open();
    window.addEventListener('pagehide', close);
    window.addEventListener('pageshow', reopen);
    return () => {
      disposed = true;
      close();
      sendRef.current = () => {};
      clearTimeout(staleTimer);
      clearTimeout(watchdog);
      window.removeEventListener('pagehide', close);
      window.removeEventListener('pageshow', reopen);
    };
  }, [projectPrefix, staticMode]);

  return (
    <ProjectEventsContext.Provider
      value={{ presence, disconnected, reportPresence, subscribeToCardUpdates }}
    >
      {children}
    </ProjectEventsContext.Provider>
  );
}
