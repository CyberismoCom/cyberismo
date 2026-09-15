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
import { callApi, projectApiPaths } from '../swr';
import {
  ProjectEventsContext,
  type PresenceEntry,
} from './ProjectEventsContext';

const RENEWAL_INTERVAL_MS = 30_000;

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
  const desired = useRef({
    cardKey: null as string | null,
    mode: 'viewing' as PresenceEntry['mode'],
    token: {},
  });
  const sendRef = useRef<() => void>(() => {});
  const { staticMode, presenceEnabled } = getConfig();

  const reportPresence = useCallback(
    (cardKey: string | null, mode: PresenceEntry['mode']) => {
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
    if (!projectPrefix) return;
    const apiPaths = projectApiPaths(projectPrefix);
    let source: EventSource | undefined;
    let connectionId: string | undefined;
    let sequence = 0;
    let disposed = false;

    const send = () => {
      if (!presenceEnabled || !connectionId || disposed) return;
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
      const stale = () => disposed || source !== current;
      current.addEventListener('ready', (event) => {
        if (stale()) return;
        const parsed = readySchema.safeParse(parseData(event));
        if (!parsed.success) return;
        connectionId = parsed.data.connectionId;
        setPresence(parsed.data.presence);
        send();
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
      current.addEventListener('error', () => {
        if (stale()) return;
        connectionId = undefined;
        setPresence({});
      });
    };

    const close = () => {
      source?.close();
      source = undefined;
      connectionId = undefined;
    };
    const reopen = () => {
      if (!source && !disposed) open();
    };

    open();
    const renewal = setInterval(send, RENEWAL_INTERVAL_MS);
    window.addEventListener('pagehide', close);
    window.addEventListener('pageshow', reopen);
    return () => {
      disposed = true;
      close();
      sendRef.current = () => {};
      clearInterval(renewal);
      window.removeEventListener('pagehide', close);
      window.removeEventListener('pageshow', reopen);
    };
  }, [projectPrefix, staticMode, presenceEnabled]);

  return (
    <ProjectEventsContext.Provider value={{ presence, reportPresence }}>
      {children}
    </ProjectEventsContext.Provider>
  );
}
