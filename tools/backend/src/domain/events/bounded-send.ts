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

import type { SSEMessage } from 'hono/streaming';

const MAX_OUTSTANDING_WRITES = 20;

/**
 * Bounds outstanding SSE writes per connection, dropping messages matched by
 * `isDroppable` past the limit. Reports whether it actually queued the
 * write, so a dropped message never gets recorded as delivered.
 */
export function boundedSend(
  write: (message: SSEMessage) => Promise<void>,
  isDroppable: (message: SSEMessage) => boolean,
): (message: SSEMessage) => boolean {
  let outstanding = 0;
  return (message) => {
    if (isDroppable(message) && outstanding >= MAX_OUTSTANDING_WRITES) {
      return false;
    }
    outstanding++;
    void write(message).finally(() => {
      outstanding--;
    });
    return true;
  };
}
