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

import type { UserInfo } from '../../types.js';
import type { SSEMessage } from 'hono/streaming';

export interface PresenceEntry {
  userId: string;
  userName: string;
  mode: 'viewing' | 'editing';
}

interface Connection {
  user: UserInfo;
  mode: 'viewing' | 'editing';
  send: (message: SSEMessage) => void;
}

/**
 * In-memory presence tracker for card editing/viewing.
 * Tracks which users are currently looking at or editing each card,
 * and notifies all connected clients via SSE when presence changes.
 */
class PresenceStore {
  // cardKey -> connectionId -> Connection
  private connections = new Map<string, Map<string, Connection>>();
  private nextId = 0;

  /**
   * Add a user connection for a card. Returns a connection ID for later removal.
   */
  add(
    cardKey: string,
    user: UserInfo,
    mode: 'viewing' | 'editing',
    send: (message: SSEMessage) => void,
  ): string {
    const connId = String(this.nextId++);

    if (!this.connections.has(cardKey)) {
      this.connections.set(cardKey, new Map());
    }

    this.connections.get(cardKey)!.set(connId, { user, mode, send });
    this.broadcast(cardKey);

    return connId;
  }

  /**
   * Remove a connection and broadcast updated presence.
   */
  remove(cardKey: string, connId: string): void {
    const cardConns = this.connections.get(cardKey);
    if (!cardConns) return;

    cardConns.delete(connId);

    if (cardConns.size === 0) {
      this.connections.delete(cardKey);
    } else {
      this.broadcast(cardKey);
    }
  }

  /**
   * Get current presence list for a card.
   */
  getPresence(cardKey: string): PresenceEntry[] {
    const cardConns = this.connections.get(cardKey);
    if (!cardConns) return [];

    // Deduplicate by userId — if a user has multiple connections,
    // prefer the 'editing' mode
    const byUser = new Map<string, PresenceEntry>();
    for (const conn of cardConns.values()) {
      const existing = byUser.get(conn.user.id);
      if (!existing || conn.mode === 'editing') {
        byUser.set(conn.user.id, {
          userId: conn.user.id,
          userName: conn.user.name,
          mode: conn.mode,
        });
      }
    }

    return Array.from(byUser.values());
  }

  /**
   * Broadcast current presence to all connected clients for a card.
   */
  private broadcast(cardKey: string): void {
    const cardConns = this.connections.get(cardKey);
    if (!cardConns) return;

    const presence = this.getPresence(cardKey);
    const data = JSON.stringify({ editors: presence });
    const message: SSEMessage = { event: 'presence', data };

    for (const conn of cardConns.values()) {
      conn.send(message);
    }
  }

  /**
   * Remove all connections. Intended for test cleanup.
   */
  removeAll(): void {
    this.connections.clear();
  }
}

export const presenceStore = new PresenceStore();
