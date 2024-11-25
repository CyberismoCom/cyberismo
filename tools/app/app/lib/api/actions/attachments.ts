/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/
'use server';

import { CommandManager } from '@cyberismocom/data-handler/command-manager';

export async function addAttachments(key: string, formData: FormData) {
  const projectPath = process.env.npm_config_project_path;
  if (!projectPath) {
    return new Error('project_path environment variable not set.');
  }

  const commands = await CommandManager.getInstance(projectPath);
  const createCommand = commands.createCmd;
  const removeCommand = commands.removeCmd;

  const files = await Promise.all(
    formData
      .getAll('file')
      .filter((file): file is File => file instanceof File)
      .reduce<File[]>((files, file) => {
        if (files.find((f) => f.name === file.name)) {
          return files;
        }
        files.push(file);
        return files;
      }, [])
      .map(async (file) => ({
        name: file.name,
        buffer: Buffer.from(await file.arrayBuffer()),
      })),
  );

  const succeeded = [];
  let error: Error | null = null;
  for (const file of files) {
    try {
      await createCommand.createAttachment(key, file.name, file.buffer);
      succeeded.push(file.name);
    } catch (err) {
      error =
        err instanceof Error ? err : new Error('Failed to upload attachment.');
      break;
    }
  }

  if (error) {
    for (const file of succeeded) {
      try {
        await removeCommand.remove('attachment', key, file);
      } catch (err) {
        console.error('Failed to remove attachment:', err);
      }
    }
    throw error;
  }
}

export async function removeAttachment(key: string, filename: string) {
  const projectPath = process.env.npm_config_project_path;
  if (!projectPath) {
    return new Error('project_path environment variable not set.');
  }
  const commands = await CommandManager.getInstance(projectPath);
  await commands.removeCmd.remove('attachment', key, filename);
}

/**
 * Opens an attachment using the operating system's default application.
 * @param key
 * @param filename
 * @returns
 */
export async function openAttachment(key: string, filename: string) {
  const projectPath = process.env.npm_config_project_path;
  if (!projectPath) {
    return new Error('project_path environment variable not set.');
  }
  const commands = await CommandManager.getInstance(projectPath);
  await commands.showCmd.openAttachment(key, filename);
}
