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
import type { Change, ChangeEvent } from '@cyberismo/model';
import { getChildLogger } from './log-utils.js';
import type { RWLock } from './rw-lock.js';
import type { TxRecord } from './tx-record.js';

/** Receives the change events of a checkout. */
export type ChangeListener = (event: ChangeEvent) => void;

/** Records a settings change into the write running on `lock`, if any. */
export function recordSettingsChange(lock: RWLock) {
  const tx = lock.currentTx();
  if (tx) {
    tx.touched.settings = true;
  }
}

/** Whether the write recorded any change. */
export function changedAnything(tx: TxRecord): boolean {
  return tx.cause === 'rename' || changesOf(tx).length > 0;
}

// What a write changed, from what it recorded.
function changesOf({ touched }: TxRecord): Change[] {
  return [
    ...[...touched.cards.updated].map((key): Change => ({
      kind: 'card.updated',
      key,
    })),
    ...[...touched.cards.removed].map((key): Change => ({
      kind: 'card.removed',
      key,
    })),
    ...[...touched.resources].map((name): Change => ({
      kind: 'resource.changed',
      name,
    })),
    ...[...touched.modules].map((name): Change => ({
      kind: 'module.changed',
      name,
    })),
    ...(touched.settings ? [{ kind: 'settings.changed' } as const] : []),
  ];
}

/**
 * The change events of one checkout. A write's event is sealed inside its
 * lock, which numbers it, and published after the lock is released.
 */
export class ChangeFeed {
  private readonly epoch = randomUUID();
  private revision = 0;
  private readonly listeners = new Set<ChangeListener>();
  private readonly logger = getChildLogger({ module: 'ChangeFeed' });

  /** Adds a listener; the returned function removes it. */
  public subscribe(listener: ChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Numbers the write's event, for the project of prefix `project`, and puts
   * it on the record. A write that changed nothing gets none; a rename or a
   * failed write gets a reload.
   */
  public seal(tx: TxRecord, project: string) {
    if (!changedAnything(tx)) {
      return;
    }
    const changes: Change[] =
      (tx.cause ?? 'direct') === 'direct'
        ? changesOf(tx)
        : [{ kind: 'project.reloaded' }];
    tx.event = {
      project,
      workspace: 'main',
      epoch: this.epoch,
      revision: ++this.revision,
      ...(tx.commit && { commit: tx.commit }),
      actor: tx.actor,
      cause: tx.cause ?? 'direct',
      at: new Date().toISOString(),
      changes,
    };
  }

  /**
   * Gives the record's event, if it has one, to every listener. A listener's
   * error is logged and swallowed.
   */
  public publish(tx: TxRecord) {
    if (!tx.event) {
      return;
    }
    for (const listener of this.listeners) {
      try {
        listener(tx.event);
      } catch (error) {
        this.logger.error({ error }, 'Change listener failed');
      }
    }
  }
}
