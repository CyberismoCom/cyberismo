/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

/**
 * Sorts array of cards first using prefix and then using ID.
 * Prefixes are returned in alphabetical order, and then in numeric order within same prefix.
 * For example, test_za1, test_aa7 and demo_aaa are sorted to: demo_aaa, test_aa7, test_za1.
 * @param a First card to be sorted
 * @param b Second card to be sorted
 * @returns Cards ordered; first by prefixes, then by ID.
 */
export const sortCards = (a: string, b: string) => {
  const aParts = a.split('_');
  const bParts = b.split('_');
  if (aParts[0] !== bParts[0]) {
    if (aParts[0] > bParts[0]) return 1;
    if (aParts[0] < bParts[0]) return -1;
    return 0;
  }
  if (a.length > b.length) {
    return 1;
  }
  if (a.length < b.length) {
    return -1;
  }
  if (aParts[1] > bParts[1]) return 1;
  if (aParts[1] < bParts[1]) return -1;
  return 0;
};
