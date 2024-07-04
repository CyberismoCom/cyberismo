import { copyFile, mkdir, readdir, rm, unlink } from 'node:fs/promises';
import { existsSync, lstatSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
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
      if (!pathExists(destinationPath)) {
        await mkdir(destinationPath, { recursive: true });
      }
      await copyDir(sourcePath, destinationPath);
    } else {
      if (!pathExists(destination)) {
        await mkdir(destination, { recursive: true });
      }
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
  } catch (error) {
    console.error(`Cannot delete file '${path}'`);
    return false;
  }
  return true;
}

/**
 * Lists all files from a folder.
 * @param path path to folder
 * @returns array of filenames that are in the folder or in one of its subfolders.
 */
export function getFilesSync(path: string): string[] {
  const files = [];
  for (const file of readdirSync(path)) {
    const fullPath = join(path, file);
    if (lstatSync(fullPath).isDirectory()) {
      getFilesSync(fullPath).forEach((fileName) =>
        files.push(join(file, fileName)),
      );
    } else {
      files.push(file);
    }
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
