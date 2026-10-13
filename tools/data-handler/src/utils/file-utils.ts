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

import {
  copyFile,
  mkdir,
  readdir,
  rm,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { basename, dirname, join, sep } from 'node:path';
import { homedir } from 'node:os';

/**
 * Copies directory content (subdirectories and files) to destination.
 * Note that it won't create 'source', but copies all that is inside of 'source'.
 * @param source path to start from
 * @param destination path where to copy to
 */
export async function copyDir(source: string, destination: string) {
  const entries = await readdir(source, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = join(source, entry.name);
    const destinationPath = join(destination, entry.name);
    if (entry.isDirectory()) {
      await mkdir(destinationPath, { recursive: true });
      await copyDir(sourcePath, destinationPath);
    } else {
      await mkdir(destination, { recursive: true });
      await copyFile(sourcePath, destinationPath);
    }
  }
}

/**
 * Delete directory.
 * @param path path to be deleted
 */
export async function deleteDir(path: string) {
  await rm(resolveTilde(path), { recursive: true, force: true });
}

/**
 * Delete file.
 * @param path path to file to be deleted
 * @returns true, if file was deleted; false otherwise.
 */
export async function deleteFile(path: string): Promise<boolean> {
  if (!path) {
    return false;
  }
  try {
    await unlink(path);
  } catch {
    console.error(`Cannot delete file '${path}'`);
    return false;
  }
  return true;
}

/**
 * Removes extension from filename.
 * @param filename Filename
 * @returns filename without extension. If there was no extension, returns the original filename.
 */
export function stripExtension(filename: string) {
  // First handle special cases. Just return the filename in all of these cases.
  // 1) If the filename ends to "."" or ".." (e.g. ".cards/local/..")
  const parts = filename.split(sep);
  if (
    parts.at(parts.length - 1) === '..' ||
    parts.at(parts.length - 1) === '.'
  ) {
    return filename;
  }
  const dotLocation = filename.lastIndexOf('.');
  const sepLocation = filename.lastIndexOf(sep);
  // 2) If there is a dot in the filename before sep (e.g. ".cards/local")
  if (dotLocation < sepLocation) {
    return filename;
  }
  // 3) If there is a dot in filename but it is not an actual extension (e.g. "test/.filename", or ".filename")
  if (dotLocation === 0 || filename.at(dotLocation - 1) === sep) {
    return filename;
  }

  const noExtension = filename.split('.').slice(0, -1).join('.');
  // if there was no extension at all, return the original file name.
  return noExtension ? noExtension : filename;
}

/**
 * Lists all files from a folder.
 * @param path path to folder
 * @param pathPrefix relative adjustment to 'path', if any; optional; by default empty.
 * @param files currently collected files; optional; by default empty.
 * @returns array of filenames that are in the folder or in one of its subfolders.
 * @note that 'pathPrefix' and 'files' are generally only used in internal recursion.
 *       When calling this from code, do not pass the parameters.
 */
export function getFilesSync(
  path: string,
  pathPrefix: string = '',
  files: string[] = [],
): string[] {
  try {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const relativePath = pathPrefix
        ? join(pathPrefix, entry.name)
        : entry.name;

      if (entry.isFile()) {
        files.push(relativePath);
      } else if (entry.isDirectory()) {
        getFilesSync(join(path, entry.name), relativePath, files);
      }
    }
  } catch {
    // do nothing, wrong path, or no permissions to read the files
  }
  return files;
}

/**
 * Checks if file or folder exists.
 * @param path file or folder path
 * @returns true if file exists, otherwise false
 */
export function pathExists(path: string): boolean {
  path = resolveTilde(path);
  return existsSync(path);
}

/**
 * Handles tilde from a path (ie. appends user home to its place).
 * @param filePath Path to handle tilde from.
 * @returns Path with tilde resolved.
 */
export function resolveTilde(filePath: string): string {
  if (!filePath || typeof filePath !== 'string') {
    return '';
  }
  // '~/folder/path' or '~' not '~alias/folder/path'
  if (filePath.startsWith('~/') || filePath === '~') {
    return filePath.replace('~', homedir());
  }
  return filePath;
}

/**
 * Path separator RE.
 */
export const sepRegex = /[/\\]/;

export const invalidNames = new RegExp(
  '[<>:"/\\|?*\x00-\x1F]|^(?:aux|con|clock$|nul|prn|com[1-9]|lpt[1-9])$', // eslint-disable-line no-control-regex
);

/**
 * Validates folder name.
 * @todo: This should check that the path is resolvable and can be used as a folder name in various operating systems.
 * @param path path to a folder
 * @returns true, if the path is valid and can be used; false otherwise.
 */
export function isValidFolderName(path: string): boolean {
  if (path === '' || path === '.' || path === '..') {
    return false;
  }
  return !invalidNames.test(basename(path));
}

/**
 * Works like the writeFile method, but ensures that the directory exists
 * There is only one difference: This method only supports a string as the filePath
 */
export async function writeFileSafe(
  filePath: string,
  data: Parameters<typeof writeFile>[1],
  options?: Parameters<typeof writeFile>[2],
) {
  const dir = dirname(filePath);
  await mkdir(dir, {
    recursive: true,
  });
  return writeFile(filePath, data, options);
}
