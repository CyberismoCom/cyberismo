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

/** What one connection's client is sent through, and what was last sent to
 * it. Retiring turns send/close/terminate into no-ops together, so a stale
 * reference can never reach a socket the connection has given up. */
class Delivery {
  lastSent: string | null = null;
  private retiredFlag = false;

  constructor(
    private readonly sendFn: (message: SSEMessage) => void,
    private readonly closeFn: () => void,
    private readonly terminateFn: (message: SSEMessage) => void,
  ) {}

  get retired(): boolean {
    return this.retiredFlag;
  }

  send(message: SSEMessage): void {
    if (!this.retiredFlag) this.sendFn(message);
  }

  close(): void {
    if (!this.retiredFlag) this.closeFn();
  }

  terminate(message: SSEMessage): void {
    if (!this.retiredFlag) this.terminateFn(message);
  }

  retire(): void {
    this.retiredFlag = true;
  }
}

interface Connection {
  user: { id: string; name: string };
  capabilities: Capabilities;
  delivery: Delivery;
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
    send: (message: SSEMessage) => void,
    close: () => void,
    terminate: (message: SSEMessage) => void,
  ): string {
    const connectionId = randomUUID();
    this.connections.set(connectionId, {
      user,
      capabilities,
      delivery: new Delivery(send, close, terminate),
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
    if (
      !connection ||
      connection.delivery.retired ||
      connection.user.id !== userId
    ) {
      return false;
    }
    if (sequence <= connection.sequence) return true;
    // Coerced rather than rejected: a fake editing warning deters others from editing.
    if (!connection.capabilities.canDeclareEditing) mode = 'viewing';
    const previous = connection.cardKey;
    const moved = previous !== cardKey || connection.mode !== mode;
    if (previous !== cardKey) connection.delivery.lastSent = null;
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

  // `users()` dedups by user id, so a retiring connection's entry can outlive
  // its socket without observers seeing a change.
  retire(connectionId: string): void {
    this.connections.get(connectionId)?.delivery.retire();
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
    // Sorted so identical occupancy always serializes the same way, which
    // the per-recipient dedup in presenceUpdated() depends on.
    return [...users.values()].sort((a, b) => a.userId.localeCompare(b.userId));
  }

  private presenceUpdated(cardKey: string): void {
    const users = this.users(cardKey);
    const serialized = JSON.stringify(users);
    const message = this.encode('presence.updated', { cardKey, users });
    for (const [connectionId, connection] of this.onCard(cardKey)) {
      if (connection.delivery.lastSent === serialized) continue;
      connection.delivery.lastSent = serialized;
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
      this.connections.get(connectionId)?.delivery.send(message);
    } catch {
      this.disconnect(connectionId);
    }
  }

  private expire(): void {
    for (const [connectionId, connection] of this.connections) {
      if (connection.expiresAt > Date.now()) continue;
      if (!connection.delivery.retired && !connection.cardKey) continue;
      const cardKey = connection.cardKey;
      if (connection.delivery.retired) this.connections.delete(connectionId);
      else connection.cardKey = null;
      if (cardKey) this.presenceUpdated(cardKey);
    }
  }

  private closeQuietly(connection: Connection): void {
    try {
      connection.delivery.close();
    } catch {
      /* already closed */
    }
  }
}
