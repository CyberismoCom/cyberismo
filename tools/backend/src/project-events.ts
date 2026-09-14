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

import { randomUUID } from 'node:crypto';
import type { SSEMessage } from 'hono/streaming';
import type { UserInfo } from './types.js';

export interface PresenceEntry {
  userId: string;
  userName: string;
  mode: 'viewing' | 'editing';
}

interface Connection {
  user: UserInfo;
  send: (message: SSEMessage) => void;
  close: () => void;
  cardKey: string | null;
  mode: 'viewing' | 'editing';
  sequence: number;
  expiresAt: number;
}

/** One project instance owns its subscribers and ephemeral presence. */
export class ProjectEvents {
  private connections = new Map<string, Connection>();
  private expiryTimer: ReturnType<typeof setInterval>;

  constructor() {
    this.expiryTimer = setInterval(() => this.expire(), 30_000);
    this.expiryTimer.unref();
  }

  /** Explicit UI notifications for cards directly affected by a route's write. */
  cardsUpdated(cardKeys: string[], user: UserInfo): void {
    for (const cardKey of new Set(cardKeys)) {
      this.broadcast('card.updated', {
        cardKey,
        userId: user.id,
        userName: user.name,
      });
    }
  }

  connect(
    user: UserInfo,
    send: Connection['send'],
    close: Connection['close'],
  ): string {
    const connectionId = randomUUID();
    this.connections.set(connectionId, {
      user,
      send,
      close,
      cardKey: null,
      mode: 'viewing',
      sequence: -1,
      expiresAt: 0,
    });
    this.deliver(connectionId, {
      event: 'ready',
      data: JSON.stringify({ connectionId, presence: this.snapshot() }),
    });
    return connectionId;
  }

  update(
    connectionId: string,
    userId: string,
    sequence: number,
    cardKey: string | null,
    mode: Connection['mode'],
  ): boolean {
    const connection = this.connections.get(connectionId);
    if (!connection || connection.user.id !== userId) return false;
    if (sequence <= connection.sequence) return true;
    const previous = connection.cardKey;
    const changed = previous !== cardKey || connection.mode !== mode;
    Object.assign(connection, {
      sequence,
      cardKey,
      mode,
      expiresAt: Date.now() + 90_000,
    });
    if (changed) {
      if (previous) this.presenceUpdated(previous);
      if (cardKey && cardKey !== previous) this.presenceUpdated(cardKey);
    }
    return true;
  }

  disconnect(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;
    this.connections.delete(connectionId);
    try {
      connection.close();
    } catch {
      /* Already disconnected. */
    }
    if (connection.cardKey) this.presenceUpdated(connection.cardKey);
  }

  private users(cardKey: string): PresenceEntry[] {
    const users = new Map<string, PresenceEntry>();
    for (const connection of this.connections.values()) {
      if (connection.cardKey !== cardKey) continue;
      const { user, mode } = connection;
      if (!users.has(user.id) || mode === 'editing') {
        users.set(user.id, { userId: user.id, userName: user.name, mode });
      }
    }
    return [...users.values()];
  }

  private snapshot(): Record<string, PresenceEntry[]> {
    const keys = new Set(
      [...this.connections.values()].flatMap((c) =>
        c.cardKey ? [c.cardKey] : [],
      ),
    );
    return Object.fromEntries([...keys].map((key) => [key, this.users(key)]));
  }

  private presenceUpdated(cardKey: string): void {
    this.broadcast('presence.updated', { cardKey, users: this.users(cardKey) });
  }

  private deliver(id: string, message: SSEMessage): void {
    try {
      this.connections.get(id)?.send(message);
    } catch {
      this.disconnect(id);
    }
  }

  private broadcast(event: string, data: unknown): void {
    const message = { event, data: JSON.stringify(data) };
    for (const id of [...this.connections.keys()]) this.deliver(id, message);
  }

  private expire(): void {
    for (const connection of this.connections.values()) {
      if (connection.cardKey && connection.expiresAt <= Date.now()) {
        const key = connection.cardKey;
        connection.cardKey = null;
        this.presenceUpdated(key);
      }
    }
  }

  dispose(): void {
    clearInterval(this.expiryTimer);
    const connections = [...this.connections.values()];
    this.connections.clear();
    for (const connection of connections) {
      try {
        connection.close();
      } catch {
        /* Already disconnected. */
      }
    }
  }
}
