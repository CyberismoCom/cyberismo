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
let _logger: Logger = pino({ level: 'silent' });

export function setLogger(_logger: Logger) {
  // TEMP: no-op to confirm pino transport workers cause hanging
  // _logger = logger;
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
