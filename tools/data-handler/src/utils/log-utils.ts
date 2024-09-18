/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
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
    return `${logError.name} called without an error object. Actual object is ${JSON.stringify(error)}`;
  }
}

/**
 * Same as 'errorFunction' but can do automatic replacement fof the error message string.
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
 * Logs error from Error object.
 * @param error potentially an Error object. When exceptions are raised, they are typically Error objects.
 */
export function logError(error: unknown) {
  if (error instanceof Error) {
    const err: Error = error;
    logErrorMessage(`${err.message}`);
  } else {
    console.error(
      `${logError.name} called without an error object. Actual object is ${JSON.stringify(error)}`,
    );
  }
}

/**
 * Log error message in RED. Certain parts of messages can be replaced.
 * This is useful, if including a message from external sources, and want to reduce the verbosity of the message.
 * @param message Error message to log.
 * @param toReplace String to look for.
 * @param replaceWith Replace 'toReplace' with this. Only replaces first instance of 'toReplace'.
 */
export function logErrorMessage(
  message: string,
  toReplace?: string,
  replaceWith?: string,
) {
  let errorMessage = message;
  if (toReplace && replaceWith) {
    errorMessage = message.replace(toReplace, replaceWith);
  }
  console.error(`${errorMessage}`);
}
