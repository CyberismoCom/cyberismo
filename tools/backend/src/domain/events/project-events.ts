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

import { randomUUID } from 'node:crypto';
import type { SSEMessage } from 'hono/streaming';

const LEASE_MS = 90_000;
const EXPIRY_INTERVAL_MS = 30_000;

export interface PresenceEntry {
  userId: string;
  userName: string;
  mode: 'viewing' | 'editing';
}

export interface Capabilities {
  canSeeIdentity: boolean;
  canDeclareEditing: boolean;
}

interface Connection {
  user: { id: string; name: string };
  capabilities: Capabilities;
  send: (message: SSEMessage) => void;
  close: () => void;
  cardKey: string | null;
  mode: PresenceEntry['mode'];
  sequence: number;
  expiresAt: number;
}

/** The open subscriptions of one project and the presence leases they hold. */
export class ProjectEvents {
  private connections = new Map<string, Connection>();
  private expiryTimer: ReturnType<typeof setInterval>;

  constructor() {
    this.expiryTimer = setInterval(() => this.expire(), EXPIRY_INTERVAL_MS);
    this.expiryTimer.unref();
  }

  connect(
    user: Connection['user'],
    capabilities: Capabilities,
    send: Connection['send'],
    close: Connection['close'],
  ): string {
    const connectionId = randomUUID();
    this.connections.set(connectionId, {
      user,
      capabilities,
      send,
      close,
      cardKey: null,
      mode: 'viewing',
      sequence: -1,
      expiresAt: 0,
    });
    // EventSource cannot read response headers, so the stream is the only
    // way back with a connection handle.
    this.deliver(connectionId, {
      event: 'ready',
      data: JSON.stringify({ connectionId }),
    });
    return connectionId;
  }

  update(
    connectionId: string,
    userId: string,
    sequence: number,
    cardKey: string | null,
    mode: PresenceEntry['mode'],
  ): boolean {
    const connection = this.connections.get(connectionId);
    if (!connection || connection.user.id !== userId) return false;
    if (sequence <= connection.sequence) return true;
    // Coerced rather than rejected: a fake editing warning deters others from editing.
    if (!connection.capabilities.canDeclareEditing) mode = 'viewing';
    const previous = connection.cardKey;
    const moved = previous !== cardKey || connection.mode !== mode;
    Object.assign(connection, {
      sequence,
      cardKey,
      mode,
      expiresAt: Date.now() + LEASE_MS,
    });
    if (moved) {
      if (previous) this.presenceUpdated(previous);
      if (cardKey && cardKey !== previous) this.presenceUpdated(cardKey);
    }
    return true;
  }

  disconnect(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;
    this.connections.delete(connectionId);
    this.closeQuietly(connection);
    if (connection.cardKey) this.presenceUpdated(connection.cardKey);
  }

  cardsUpdated(cardKeys: string[], user: Connection['user']): void {
    for (const cardKey of new Set(cardKeys)) {
      const withIdentity = this.encode('card.updated', {
        cardKey,
        userId: user.id,
        userName: user.name,
      });
      const withoutIdentity = this.encode('card.updated', { cardKey });
      for (const [connectionId, connection] of this.onCard(cardKey)) {
        this.deliver(
          connectionId,
          connection.capabilities.canSeeIdentity
            ? withIdentity
            : withoutIdentity,
        );
      }
    }
  }

  dispose(): void {
    clearInterval(this.expiryTimer);
    const connections = [...this.connections.values()];
    this.connections.clear();
    for (const connection of connections) this.closeQuietly(connection);
  }

  private users(cardKey: string): PresenceEntry[] {
    const users = new Map<string, PresenceEntry>();
    for (const { user, cardKey: key, mode } of this.connections.values()) {
      if (key !== cardKey) continue;
      if (!users.has(user.id) || mode === 'editing') {
        users.set(user.id, { userId: user.id, userName: user.name, mode });
      }
    }
    return [...users.values()];
  }

  private presenceUpdated(cardKey: string): void {
    const message = this.encode('presence.updated', {
      cardKey,
      users: this.users(cardKey),
    });
    for (const [connectionId] of this.onCard(cardKey)) {
      this.deliver(connectionId, message);
    }
  }

  // Subscription governs delivery.
  private onCard(cardKey: string): [string, Connection][] {
    return [...this.connections].filter(([, c]) => c.cardKey === cardKey);
  }

  private encode(event: string, data: unknown): SSEMessage {
    return { event, data: JSON.stringify(data) };
  }

  private deliver(connectionId: string, message: SSEMessage): void {
    try {
      this.connections.get(connectionId)?.send(message);
    } catch {
      this.disconnect(connectionId);
    }
  }

  private expire(): void {
    for (const connection of this.connections.values()) {
      if (connection.cardKey && connection.expiresAt <= Date.now()) {
        const cardKey = connection.cardKey;
        connection.cardKey = null;
        this.presenceUpdated(cardKey);
      }
    }
  }

  private closeQuietly(connection: Connection): void {
    try {
      connection.close();
    } catch {
      /* already closed */
    }
  }
}
