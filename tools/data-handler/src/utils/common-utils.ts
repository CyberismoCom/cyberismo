/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

/**
 * Makes deep comparison between two objects.
 * @param arg1 First object to compare.
 * @param arg2 Second object to compare.
 * @returns true, if objects are the same, false otherwise.
 */
export function deepCompare(arg1: object, arg2: object): boolean {
  if (
    Object.prototype.toString.call(arg1) ===
    Object.prototype.toString.call(arg2)
  ) {
    if (
      Object.prototype.toString.call(arg1) === '[object Object]' ||
      Object.prototype.toString.call(arg1) === '[object Array]'
    ) {
      if (Object.keys(arg1).length !== Object.keys(arg2).length) {
        return false;
      }
      return Object.keys(arg1).every(function (key) {
        return deepCompare(
          arg1[key as keyof typeof arg1],
          arg2[key as keyof typeof arg2],
        );
      });
    }
    return arg1 === arg2;
  }
  return false;
}

/**
 * Checks if string could be represented as BigInt.
 * @param value String value
 * @returns true, if 'value' can be represented as BigInt; false otherwise.
 */
export function isBigInt(value: string): boolean {
  try {
    return BigInt(parseInt(value, 10)) !== BigInt(value);
  } catch {
    return false;
  }
}

/**
 * Removes the first occurrence of a value from an array.
 * Modifies the array in place.
 * @param array The array to modify
 * @param value The value to remove
 * @returns The modified array (same reference as input)
 */
export function removeValue<T>(array: T[], value: T): T[] {
  const index = array.findIndex((element) => element === value);
  if (index !== -1) {
    array.splice(index, 1);
  }
  return array;
}

/**
 * Resolves after a delay.
 * @param ms Milliseconds to wait.
 * @param options Set `unref` when nothing should be kept waiting on the timer:
 *        an unref'd timer lets the process exit rather than holding it open,
 *        which is what a fire-and-forget retry backoff wants. It also means the
 *        promise never settles in that case, so leave it off whenever the
 *        caller has work to do after the wait.
 * @returns A promise that resolves once the delay has elapsed.
 */
export function sleep(
  ms: number,
  options?: { unref?: boolean },
): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    if (options?.unref) timer.unref?.();
  });
}
