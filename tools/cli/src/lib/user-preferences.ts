// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { dirname } from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import { formatJson } from '@cyberismo/data-handler/utils/json';

export interface UserPreferencesObject {
  editCommand: {
    [platform: string]: {
      command: string;
      args: string[];
    };
  };
}
/**
 * The class checks if the preferences file exists when instantiated, and if not, creates it with a default JSON object.
 * The getPreferences() method simply reads and parses the file to return the preferences object.
 */
export class UserPreferences {
  // If preferences do not exist, they are initialised
  // with these defaults.
  static defaults = {
    editCommand: {
      darwin: {
        command: 'code',
        args: ['{{cardContentPath}}', '{{cardJsonPath}}'],
      },
      linux: {
        command: 'vi',
        args: ['{{cardContentPath}}', '{{cardJsonPath}}'],
      },
      win32: {
        command: 'notepad.exe',
        args: ['{{cardContentPath}}', '{{cardJsonPath}}'],
      },
    },
  };

  constructor(private prefsFilePath: string) {
    // Create the preferences directory based on prefsFilePath dirname
    const prefsDir = dirname(this.prefsFilePath);

    try {
      // Ensure directory exists first
      if (!existsSync(prefsDir)) {
        mkdirSync(prefsDir, { recursive: true });
      }

      // Try to create file exclusively using 'wx' flag
      // This will fail atomically if file already exists
      writeFileSync(this.prefsFilePath, formatJson(UserPreferences.defaults), {
        flag: 'wx',
      });
    } catch (error) {
      // An existing file is kept.
      if (
        !(error instanceof Error && 'code' in error) ||
        error.code !== 'EEXIST'
      ) {
        throw new Error(
          `Error creating preferences file '${this.prefsFilePath}': ${error}`,
          { cause: error },
        );
      }
    }
  }

  public getPreferences(): UserPreferencesObject {
    // Read and parse the preferences file
    try {
      return JSON.parse(readFileSync(this.prefsFilePath, 'utf8'));
    } catch (error) {
      throw new Error(
        `Error reading preferences file '${this.prefsFilePath}': ${error}`,
        { cause: error },
      );
    }
  }
}
