// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import {
  copyFile,
  mkdir,
  open,
  readdir,
  rm,
  unlink,
  writeFile,
} from 'node:fs/promises';
import {
  type Dirent,
  closeSync,
  constants,
  existsSync,
  lstatSync,
  openSync,
  realpathSync,
  readdirSync,
  readFileSync,
} from 'node:fs';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';
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
    if (entry.isSymbolicLink()) {
      throw new Error(`Cannot copy symbolic link '${sourcePath}'`);
    }
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
 * Every entry under `root`, recursively, without following symlinks: a
 * symlink is returned as an entry but never descended into, on any Node
 * version (`readdir`'s own `recursive` option follows them on some).
 * @param root folder to walk
 * @param onSymlink called with the path of each symlink found
 */
export async function walkEntries(
  root: string,
  onSymlink?: (path: string) => void,
): Promise<Dirent[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(root, entry.name);
      if (entry.isSymbolicLink()) {
        onSymlink?.(path);
        return [entry];
      }
      return entry.isDirectory()
        ? [entry, ...(await walkEntries(path, onSymlink))]
        : [entry];
    }),
  );
  return nested.flat();
}

/**
 * The first path on the way from `base` down to `path` that must not be
 * read: a symlink, or `path` itself when it is not below `base`. `base`
 * itself may be reached through a symlink; only what is below it counts.
 * A `base` or `path` that is not on disk is clean.
 * @param base project folder
 * @param path folder or file below `base`
 */
export function symlinkBelow(base: string, path: string): string | undefined {
  let realBase: string;
  try {
    realBase = realpathSync(base);
  } catch {
    // Nothing exists below a base that does not.
    return undefined;
  }
  const target = resolve(path);
  // The path may be spelled through the base's own symlink or its real name.
  const below = [resolve(base), realBase]
    .map((root) => relative(root, target))
    .find(
      (rel) => rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel),
    );
  if (below === undefined) {
    return target;
  }
  let current = realBase;
  for (const part of below.split(sep).filter(Boolean)) {
    current = join(current, part);
    try {
      if (lstatSync(current).isSymbolicLink()) {
        return current;
      }
    } catch {
      return undefined;
    }
  }
  return undefined;
}

// Opening with O_NOFOLLOW makes the read fail on a symlink, closing the gap
// between the load-time check and the read.
const NO_FOLLOW = constants.O_RDONLY | constants.O_NOFOLLOW;

/**
 * Reads a file's bytes, refusing to follow a symlink at `path`.
 * @param path file to read
 */
export async function readFileNoFollow(path: string): Promise<Buffer> {
  const handle = await open(path, NO_FOLLOW);
  try {
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}

/**
 * Synchronous variant of {@link readFileNoFollow}.
 * @param path file to read
 */
export function readFileNoFollowSync(path: string): Buffer {
  const fd = openSync(path, NO_FOLLOW);
  try {
    return readFileSync(fd);
  } finally {
    closeSync(fd);
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
