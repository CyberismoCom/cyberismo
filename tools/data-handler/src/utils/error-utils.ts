/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2025
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
 * Returns error message string from an Error object.
 * @param error Error object
 * @returns Error message.
 */
export function errorFunction(error: unknown): string {
  if (error instanceof Error) {
    const err: Error = error;
    return errorMessage(`${err.message}`);
  } else if (typeof error === 'string') {
    return errorMessage(`${error}`);
  } else {
    return `errorFunction called without an error object. Actual object is ${JSON.stringify(error)}`;
  }
}

/**
 * Same as 'errorFunction' but can do automatic replacement of the error message string.
 * @param message Error message
 * @param toReplace replacement substring
 * @param replaceWith string that 'toReplace' is replaced with.
 * @returns Modified error message.
 */
export function errorMessage(
  message: string,
  toReplace?: string,
  replaceWith?: string,
): string {
  let errorMessage = message;
  if (toReplace && replaceWith) {
    errorMessage = message.replace(toReplace, replaceWith);
  }
  return `${errorMessage}`;
}

/**
 * Type guard to check if an error object has a code property.
 * @param error The error object to check
 * @returns true if the error has a code property
 */
export function hasCode(error: unknown): error is Error & { code: string } {
  return (
    error instanceof Error &&
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
  );
}
