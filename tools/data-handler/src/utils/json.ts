/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2024

  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { readFileSync } from 'node:fs';
import { type FileHandle, readFile, writeFile } from 'node:fs/promises';

/**
 * Handles reading of a JSON file.
 * @param file file name (and path) to read.
 * @returns Parsed JSON content.
 * @throws if file is not found, or file is not a JSON file.
 */
export function readJsonFileSync(file: string) {
  try {
    const raw = readFileSync(file, { flag: 'rs', encoding: 'utf-8' });
    const returnValue = JSON.parse(raw);
    return returnValue;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(
        `Error while handling JSON file '${file}' : ${error.message}`,
      );
    }
  }
}

/**
 * Handles reading of a JSON file.
 * @param file file name (and path) to read.
 * @returns Parsed JSON content.
 * @throws if file is not found, or file is not a JSON file.
 */
export async function readJsonFile(file: string) {
  try {
    const raw = await readFile(file, { encoding: 'utf-8' });
    return JSON.parse(raw);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(
        `Error while handling JSON file '${file}' : ${error.message}`,
      );
    }
  }
}

/**
 * Reads ADOC file.
 * @param file file name (and path) to read.
 * @returns ADOC file content.
 * @throws if file is not found.
 */
export function readADocFileSync(file: string) {
  try {
    const raw = readFileSync(file, { encoding: 'utf-8' });
    return raw;
  } catch {
    throw new Error(`Adoc file '${file}' not found`);
  }
}

/**
 * Removes leading or trailing whitespace
 * Can be passed to JSON.stringify method
 * @param _ First parameter is key of object, but it is not used
 * @param value Value of the json object
 * @returns JSON object with values trimmed for leading or trailing white space.
 */
export function trimReplacer(_: string, value: unknown) {
  if (typeof value === 'string') {
    return value.trim();
  }
  return value;
}

/**
 * Format an object with JSON.stringify
 *
 * The purpose of this function is to format the JSON output in a centralised function
 * so that the format can be controlled in a single location.
 *
 * @param json JSON object to format.
 * @returns Formatted JSON string
 */
export function formatJson(json: object) {
  return JSON.stringify(json, trimReplacer, 4);
}

/**
 * Writes and formats a JSON file.
 * @param filename file name (and path) to write.
 * @param json JSON object to format.
 * @param options Optional, write options
 * @return true if write succeeded, false otherwise.
 */
export async function writeJsonFile(
  filename: string | FileHandle,
  json: object,
  options?: object,
) {
  try {
    await writeFile(filename, formatJson(json), options);
    return true;
  } catch {
    // do nothing, file didn't exist, or no permissions to write
  }
  return false;
}
