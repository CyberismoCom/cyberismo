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
const CONNECTION_CAP = 30;
const MIN_PRESENCE_INTERVAL_MS = 1_000;

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
    private readonly sendFn: (message: SSEMessage) => boolean,
    private readonly closeFn: () => void,
    private readonly terminateFn: (message: SSEMessage) => void,
  ) {}

  get retired(): boolean {
    return this.retiredFlag;
  }

  send(message: SSEMessage): boolean {
    return !this.retiredFlag && this.sendFn(message);
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

interface PendingMove {
  sequence: number;
  cardKey: string | null;
  mode: PresenceEntry['mode'];
}

/** Coalesces card/mode changes landing inside MIN_PRESENCE_INTERVAL_MS of the
 * last one applied, so the pending move and its flush timer can't drift
 * apart from each other. */
class Throttle {
  private lastMovedAt = -Infinity;
  private pending: PendingMove | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;

  get pendingMove(): PendingMove | null {
    return this.pending;
  }

  isDue(now: number): boolean {
    return now >= this.lastMovedAt + MIN_PRESENCE_INTERVAL_MS;
  }

  renewPending(sequence: number): void {
    this.pending!.sequence = sequence;
  }

  defer(move: PendingMove, now: number, flush: () => void): void {
    this.pending = move;
    this.timer ??= setTimeout(
      flush,
      this.lastMovedAt + MIN_PRESENCE_INTERVAL_MS - now,
    ).unref();
  }

  /** Clears any pending move and records `now` as the last one applied. */
  commit(now: number): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.pending = null;
    this.lastMovedAt = now;
  }

  /** Takes the pending move so its flush timer fires at most once. */
  takePending(): PendingMove | null {
    const move = this.pending;
    this.timer = undefined;
    return move;
  }

  clear(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.pending = null;
  }
}

interface Connection {
  user: { id: string; name: string };
  capabilities: Capabilities;
  delivery: Delivery;
  throttle: Throttle;
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
    send: (message: SSEMessage) => boolean,
    close: () => void,
    terminate: (message: SSEMessage) => void,
  ): string {
    this.enforceCap(user.id);
    const connectionId = randomUUID();
    this.connections.set(connectionId, {
      user,
      capabilities,
      delivery: new Delivery(send, close, terminate),
      throttle: new Throttle(),
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
    const { throttle } = connection;
    const knownSequence = throttle.pendingMove?.sequence ?? connection.sequence;
    if (sequence <= knownSequence) return true;
    // Coerced rather than rejected: a fake editing warning deters others from editing.
    if (!connection.capabilities.canDeclareEditing) mode = 'viewing';
    // What the connection is heading toward, resolving a still-pending move
    // first, so a call that lands on it is a renewal, not a new move.
    const target = throttle.pendingMove ?? connection;
    const moved = target.cardKey !== cardKey || target.mode !== mode;
    if (!moved) {
      if (throttle.pendingMove) throttle.renewPending(sequence);
      else {
        connection.sequence = sequence;
        connection.expiresAt = Date.now() + LEASE_MS;
      }
      return true;
    }
    const now = Date.now();
    if (throttle.isDue(now)) {
      this.applyMove(connection, sequence, cardKey, mode, now);
    } else {
      // Trailing edge: nothing is discarded, only delayed to when the
      // interval elapses, and a later call here just replaces the target.
      throttle.defer({ sequence, cardKey, mode }, now, () =>
        this.flushPendingMove(connectionId),
      );
    }
    return true;
  }

  private applyMove(
    connection: Connection,
    sequence: number,
    cardKey: string | null,
    mode: PresenceEntry['mode'],
    now: number,
  ): void {
    connection.throttle.commit(now);
    const previous = connection.cardKey;
    if (previous !== cardKey) connection.delivery.lastSent = null;
    Object.assign(connection, {
      sequence,
      cardKey,
      mode,
      expiresAt: now + LEASE_MS,
    });
    if (previous) this.presenceUpdated(previous);
    if (cardKey && cardKey !== previous) this.presenceUpdated(cardKey);
  }

  private flushPendingMove(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;
    const pending = connection.throttle.takePending();
    if (!pending) return;
    this.applyMove(
      connection,
      pending.sequence,
      pending.cardKey,
      pending.mode,
      Date.now(),
    );
  }

  disconnect(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;
    this.connections.delete(connectionId);
    connection.throttle.clear();
    this.closeQuietly(connection);
    if (connection.cardKey) this.presenceUpdated(connection.cardKey);
  }

  // `users()` dedups by user id, so a retiring connection's entry can outlive
  // its socket without observers seeing a change.
  retire(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;
    connection.delivery.retire();
    connection.throttle.clear();
  }

  private enforceCap(userId: string): void {
    let active = 0;
    // A retired connection is already leaving; counting it would let a
    // rotation at the ceiling evict a connection that is still live.
    for (const connection of this.connections.values()) {
      if (!connection.delivery.retired && connection.user.id === userId) {
        active++;
      }
    }
    if (active < CONNECTION_CAP) return;
    const victim = this.oldestForUser(userId);
    if (victim) this.evict(victim[0]);
  }

  private oldestForUser(userId: string): [string, Connection] | undefined {
    let fallback: [string, Connection] | undefined;
    for (const entry of this.connections) {
      const [, connection] = entry;
      if (connection.delivery.retired || connection.user.id !== userId) {
        continue;
      }
      fallback ??= entry;
      // Prefer a non-editing victim; fall back to editing only so the cap
      // still holds if every one of the user's tabs is mid-edit.
      if (connection.mode !== 'editing') return entry;
    }
    return fallback;
  }

  private evict(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;
    this.connections.delete(connectionId);
    connection.throttle.clear();
    connection.delivery.terminate({ event: 'capped', data: '' });
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
    for (const connection of connections) {
      connection.throttle.clear();
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
      if (connection.delivery.lastSent === serialized) continue;
      // Recorded as delivered only on an actual write, so a connection
      // dropped by boundedSend still gets the update once it catches up.
      if (this.deliver(connectionId, message)) {
        connection.delivery.lastSent = serialized;
      }
    }
  }

  // Subscription governs delivery.
  private onCard(cardKey: string): [string, Connection][] {
    return [...this.connections].filter(([, c]) => c.cardKey === cardKey);
  }

  private encode(event: string, data: unknown): SSEMessage {
    return { event, data: JSON.stringify(data) };
  }

  private deliver(connectionId: string, message: SSEMessage): boolean {
    try {
      return (
        this.connections.get(connectionId)?.delivery.send(message) ?? false
      );
    } catch {
      this.disconnect(connectionId);
      return false;
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
