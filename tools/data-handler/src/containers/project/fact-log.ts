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

/**
 * What the calculation engine has not yet pulled: the card facts to refresh,
 * and the card facts to drop.
 *
 * The log outlives the trees that write into it.
 */
export class FactLog {
  private changed = new Set<string>();
  private removed = new Set<string>();

  /** Records that a card's facts have to be built again. */
  public cardChanged(cardKey: string) {
    this.removed.delete(cardKey);
    this.changed.add(cardKey);
  }

  /** Records that a card's facts have to go. */
  public cardRemoved(cardKey: string) {
    this.changed.delete(cardKey);
    this.removed.add(cardKey);
  }

  /** Takes the pending card changes, leaving the log clean. */
  public drainCards(): { changed: string[]; removed: string[] } {
    const drained = {
      changed: [...this.changed],
      removed: [...this.removed],
    };
    this.changed.clear();
    this.removed.clear();
    return drained;
  }
}
