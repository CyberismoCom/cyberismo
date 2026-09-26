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
import type { CardsChanged, CommandManager } from '@cyberismo/data-handler';
import type { UserInfo } from '../../types.js';

const LEASE_MS = 90_000;
const EXPIRY_INTERVAL_MS = 30_000;

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
  mode: PresenceEntry['mode'];
  sequence: number;
  expiresAt: number;
}

/** The open subscriptions of one project and the presence leases they hold. */
export class ProjectEvents {
  private connections = new Map<string, Connection>();
  private expiryTimer: ReturnType<typeof setInterval>;
  private unsubscribe: () => void;

  /**
   * @param project Project whose card writes are broadcast, whichever route
   *   (REST, MCP) made them.
   */
  constructor(project?: Pick<CommandManager['project'], 'onCardsChanged'>) {
    this.expiryTimer = setInterval(() => this.expire(), EXPIRY_INTERVAL_MS);
    this.expiryTimer.unref();
    this.unsubscribe =
      project?.onCardsChanged((change) => this.cardsChanged(change)) ??
      (() => {});
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
    mode: PresenceEntry['mode'],
  ): boolean {
    const connection = this.connections.get(connectionId);
    if (!connection || connection.user.id !== userId) return false;
    if (sequence <= connection.sequence) return true;
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

  cardsChanged({ updated, author, actor }: CardsChanged): void {
    for (const cardKey of new Set(updated)) {
      this.broadcast('card.updated', {
        cardKey,
        userId: author?.id ?? '',
        userName: author?.name ?? '',
        actor: actor?.kind,
      });
    }
  }

  /**
   * Tells everyone watching the project that one of its changeSets changed:
   * created, reviewed, reverted, updated, merged or discarded.
   */
  changeSetUpdated(id: string, action: string, user: UserInfo): void {
    this.broadcast('changeset.updated', {
      id,
      action,
      userId: user.id,
      userName: user.name,
    });
  }

  dispose(): void {
    this.unsubscribe();
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

  private snapshot(): Record<string, PresenceEntry[]> {
    const occupied = new Set(
      [...this.connections.values()].flatMap(({ cardKey }) =>
        cardKey ? [cardKey] : [],
      ),
    );
    return Object.fromEntries(
      [...occupied].map((cardKey) => [cardKey, this.users(cardKey)]),
    );
  }

  private presenceUpdated(cardKey: string): void {
    this.broadcast('presence.updated', { cardKey, users: this.users(cardKey) });
  }

  private broadcast(event: string, data: unknown): void {
    const message = { event, data: JSON.stringify(data) };
    for (const connectionId of [...this.connections.keys()]) {
      this.deliver(connectionId, message);
    }
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
