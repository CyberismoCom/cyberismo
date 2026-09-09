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

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { z } from 'zod';
import { getConfig } from '../utils.js';
import { projectApiPaths } from '../swr.js';
import {
  ProjectEventsContext,
  type PresenceEntry,
  type CardUpdatedEvent,
} from './projectEvents.js';

const entrySchema = z.object({
  userId: z.string(),
  userName: z.string(),
  mode: z.enum(['viewing', 'editing']),
});
const readySchema = z.object({
  connectionId: z.string(),
  presence: z.record(z.string(), z.array(entrySchema)),
});
const presenceSchema = z.object({
  cardKey: z.string(),
  users: z.array(entrySchema),
});

const cardUpdatedSchema = z.object({
  cardKey: z.string(),
  userId: z.string(),
  userName: z.string(),
});

/** Owns the transport for a project; card components only report presence. */
export function ProjectEventsProvider({
  projectPrefix,
  children,
}: {
  projectPrefix: string;
  children: ReactNode;
}) {
  const cardListeners = useRef(new Set<(event: CardUpdatedEvent) => void>());
  const subscribeToCardUpdates = useCallback(
    (listener: (event: CardUpdatedEvent) => void) => {
      cardListeners.current.add(listener);
      return () => {
        cardListeners.current.delete(listener);
      };
    },
    [],
  );
  const [presence, setPresence] = useState<Record<string, PresenceEntry[]>>({});
  const desired = useRef({
    cardKey: null as string | null,
    mode: 'viewing' as 'viewing' | 'editing',
    token: {},
  });
  const sendRef = useRef<() => void>(() => {});
  const { staticMode, presenceEnabled } = getConfig();

  const reportPresence = useCallback(
    (cardKey: string | null, mode: 'viewing' | 'editing') => {
      const token = {};
      desired.current = { cardKey, mode, token };
      queueMicrotask(() => sendRef.current());
      return () => {
        if (desired.current.token !== token) return;
        desired.current = { cardKey: null, mode: 'viewing', token: {} };
        queueMicrotask(() => sendRef.current());
      };
    },
    [],
  );

  useEffect(() => {
    if (staticMode) return;
    const paths = projectApiPaths(projectPrefix);
    let source: EventSource | undefined;
    let connectionId: string | undefined;
    let sequence = 0;
    let disposed = false;
    const send = () => {
      if (!presenceEnabled || !connectionId || disposed) return;
      const { cardKey, mode } = desired.current;
      // Monotonic sequence numbers make delayed HTTP requests harmless.
      void fetch(paths.presence(), {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          connectionId,
          sequence: ++sequence,
          cardKey,
          mode,
        }),
      }).catch(() => {
        /* The next lease renewal retries the latest state. */
      });
    };
    sendRef.current = send;
    const connect = () => {
      source?.close();
      connectionId = undefined;
      const current = new EventSource(paths.events());
      source = current;
      current.addEventListener('ready', (event) => {
        if (disposed || source !== current) return;
        const parsed = readySchema.safeParse(parseData(event));
        if (!parsed.success) return;
        connectionId = parsed.data.connectionId;
        sequence = 0;
        setPresence(parsed.data.presence);
        send();
      });
      current.addEventListener('presence.updated', (event) => {
        if (disposed || source !== current) return;
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
        if (disposed || source !== current) return;
        const parsed = cardUpdatedSchema.safeParse(parseData(event));
        if (!parsed.success) return;
        for (const listener of cardListeners.current) listener(parsed.data);
      });
      current.addEventListener('error', () => {
        if (disposed || source !== current) return;
        connectionId = undefined;
        setPresence({});
      });
    };
    const hide = () => {
      source?.close();
      source = undefined;
      connectionId = undefined;
    };
    const show = () => {
      if (!source && !disposed) connect();
    };
    connect();
    const heartbeat = setInterval(send, 30_000);
    window.addEventListener('pagehide', hide);
    window.addEventListener('pageshow', show);
    return () => {
      disposed = true;
      hide();
      sendRef.current = () => {};
      clearInterval(heartbeat);
      window.removeEventListener('pagehide', hide);
      window.removeEventListener('pageshow', show);
    };
  }, [projectPrefix, staticMode, presenceEnabled]);

  return (
    <ProjectEventsContext.Provider
      value={{
        presence: presenceEnabled ? presence : {},
        reportPresence,
        subscribeToCardUpdates,
      }}
    >
      {children}
    </ProjectEventsContext.Provider>
  );
}

function parseData(event: MessageEvent): unknown {
  try {
    return JSON.parse(event.data);
  } catch {
    return undefined;
  }
}
