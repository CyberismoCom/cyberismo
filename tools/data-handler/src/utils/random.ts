/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

/**
 * Returns a random string in given base with given length (padded with 0's if necessary)
 * @param {number} base which base to be used, e.g. 36 for base-36, must be an integer
 * @param {number} length length of string, must be an integer
 * @returns a random string
 * @throws if parameters are not integer numbers
 */
export function generateRandomString(base: number, length: number): string {
  if (!Number.isInteger(base) || !Number.isInteger(length)) {
    throw new Error('parameters must be integers');
  }

  // Generate a random number between 0 and given base max number - 1
  const maxBaseNumber = Math.pow(base, length);
  const randomNum = Math.floor(Math.random() * maxBaseNumber);

  // Convert the number to a given base string and pad it with leading zeros if necessary
  return randomNum.toString(base).padStart(length, '0');
}
