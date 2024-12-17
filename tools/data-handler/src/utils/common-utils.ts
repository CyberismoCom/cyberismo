/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

/**
 * Clones a given array and replaces 'oldValue' with 'newValue'
 * @param array Array to update.
 * @param oldValue old value to remove
 * @param newValue new value to add in the index of 'oldValue'
 * @returns cloned array with replaced value
 * @todo - this could be in some util class?
 */
export function updateArray<Type>(
  array: Array<Type>,
  oldValue: Type,
  newValue: Type,
): Type[] {
  const cloneArray = Object.assign([], array).map((item) => {
    if (item && item === oldValue) {
      return newValue;
    }
    return item;
  });
  return cloneArray;
}
