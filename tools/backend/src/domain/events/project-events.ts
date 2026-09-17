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
const RETIRED_LEASE_MS = 15_000;

export interface PresenceEntry {
  userId: string;
  userName: string;
  mode: 'viewing' | 'editing';
}

export interface Capabilities {
  canSeeIdentity: boolean;
  canDeclareEditing: boolean;
  canSeePresence: boolean;
}

/** The socket one connection's client is written to. A retired connection
 * must not be written to at all; `deliver` and `closeQuietly` enforce that,
 * since the route has already ended the stream by then. */
export interface Delivery {
  send(message: SSEMessage): void;
  close(): void;
  terminate(message: SSEMessage): void;
}

interface Connection {
  user: { id: string; name: string };
  capabilities: Capabilities;
  delivery: Delivery;
  cardKey: string | null;
  mode: PresenceEntry['mode'];
  sequence: number;
  expiresAt: number;
  retired: boolean;
  /** Last presence list serialized to this connection, for per-recipient dedup. */
  lastSent: string | null;
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
    delivery: Delivery,
  ): string {
    const connectionId = randomUUID();
    this.connections.set(connectionId, {
      user,
      capabilities,
      delivery,
      cardKey: null,
      mode: 'viewing',
      sequence: -1,
      expiresAt: 0,
      retired: false,
      lastSent: null,
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
    if (!connection || connection.retired || connection.user.id !== userId) {
      return false;
    }
    // Monotonic per connection, so a delayed request cannot undo a newer one.
    if (sequence <= connection.sequence) return true;
    // Coerced rather than rejected: a fake editing warning deters others from editing.
    if (!connection.capabilities.canDeclareEditing) mode = 'viewing';
    if (connection.cardKey === cardKey && connection.mode === mode) {
      connection.sequence = sequence;
      connection.expiresAt = Date.now() + LEASE_MS;
      return true;
    }
    this.applyMove(connection, sequence, cardKey, mode, Date.now());
    return true;
  }

  private applyMove(
    connection: Connection,
    sequence: number,
    cardKey: string | null,
    mode: PresenceEntry['mode'],
    now: number,
  ): void {
    const previous = connection.cardKey;
    if (previous !== cardKey) connection.lastSent = null;
    Object.assign(connection, {
      sequence,
      cardKey,
      mode,
      expiresAt: now + LEASE_MS,
    });
    if (previous) this.presenceUpdated(previous);
    if (cardKey && cardKey !== previous) this.presenceUpdated(cardKey);
  }

  disconnect(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;
    this.connections.delete(connectionId);
    this.closeQuietly(connection);
    if (connection.cardKey) this.presenceUpdated(connection.cardKey);
  }

  // `users()` dedups by user id, so a retiring connection's entry can outlive
  // its socket without observers seeing a change.
  retire(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;
    connection.retired = true;
    // The entry only has to bridge the client's reconnect. Left on its full
    // lease it would go on reporting the card and mode held at retirement,
    // and `editing` wins in users(), so it would mask the live entry the
    // replacement declares.
    connection.expiresAt = Math.min(
      connection.expiresAt,
      Date.now() + RETIRED_LEASE_MS,
    );
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
    for (const connection of connections) {
      this.closeQuietly(connection);
    }
  }

  private users(cardKey: string): PresenceEntry[] {
    const users = new Map<string, PresenceEntry>();
    for (const { user, cardKey: key, mode } of this.connections.values()) {
      if (key !== cardKey) continue;
      if (!users.has(user.id) || mode === 'editing') {
        users.set(user.id, { userId: user.id, userName: user.name, mode });
      }
    }
    // Sorted so identical occupancy always serializes the same way, which
    // the per-recipient dedup in presenceUpdated() depends on.
    return [...users.values()].sort((a, b) => a.userId.localeCompare(b.userId));
  }

  private presenceUpdated(cardKey: string): void {
    const users = this.users(cardKey);
    const serialized = JSON.stringify(users);
    const message = this.encode('presence.updated', { cardKey, users });
    for (const [connectionId, connection] of this.onCard(cardKey)) {
      // Presence exists to keep editors from colliding, so a reader has no use
      // for it and is not told who else is here. Readers still declare their
      // own presence, which is why users() keeps them: editors see readers.
      if (!connection.capabilities.canSeePresence) continue;
      if (connection.lastSent === serialized) continue;
      this.deliver(connectionId, message);
      connection.lastSent = serialized;
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
    const connection = this.connections.get(connectionId);
    // onCard() still yields a retired connection: it keeps its cardKey so the
    // occupant list does not change while its replacement connects.
    if (!connection || connection.retired) return;
    try {
      connection.delivery.send(message);
    } catch {
      this.disconnect(connectionId);
    }
  }

  private expire(): void {
    for (const [connectionId, connection] of this.connections) {
      if (connection.expiresAt > Date.now()) continue;
      if (!connection.retired && !connection.cardKey) continue;
      const cardKey = connection.cardKey;
      if (connection.retired) this.connections.delete(connectionId);
      else connection.cardKey = null;
      if (cardKey) this.presenceUpdated(cardKey);
    }
  }

  private closeQuietly(connection: Connection): void {
    if (connection.retired) return;
    try {
      connection.delivery.close();
    } catch {
      /* already closed */
    }
  }
}
