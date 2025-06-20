/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/
import pino, { type ChildLoggerOptions, type Logger } from 'pino';

// This could be also a more generic interface, but since we use pino and this is an internal package, let's keep it simple
// silent logger as default
let _logger: Logger = pino.default({ level: 'silent' });

export function setLogger(logger: Logger) {
  _logger = logger;
}
/**
 * Returns the logger instance.
 */
export function getLogger(): Logger {
  return _logger;
}
/**
 * Returns a child logger instance.
 * @param context Context to add to the logger.
 * @param options Options to pass to the logger.
 * @returns Child logger instance.
 */
export function getChildLogger(
  context: { module: string } & Record<string, unknown>,
  options?: ChildLoggerOptions,
): Logger {
  return _logger.child(context, options);
}
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
