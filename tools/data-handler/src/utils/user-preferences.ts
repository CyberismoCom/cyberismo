/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/
import { dirname } from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import { hasCode } from './error-utils.js';
import { formatJson } from './json.js';
import { getChildLogger } from '../utils/log-utils.js';

export interface UserPreferencesObject {
  editCommand: {
    [platform: string]: {
      command: string;
      args: string[];
    };
  };
  attachmentEditors: {
    [platform: string]: {
      mimeType: string;
      command: string;
    }[];
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
    attachmentEditors: {
      darwin: [
        {
          mimeType: 'image/png',
          command: "open -a draw.io '{{attachmentPath}}'",
        },
        {
          mimeType: 'image/svg+xml',
          command: "open -a draw.io '{{attachmentPath}}'",
        },
        {
          mimeType: 'application/pdf',
          command: 'open -a Preview "{{attachmentPath}}"',
        },
      ],
      linux: [
        {
          mimeType: 'image/png',
          command: 'drawio {{attachmentPath}}',
        },
        {
          mimeType: 'image/svg+xml',
          command: 'drawio {{attachmentPath}}',
        },
      ],
      win32: [
        {
          mimeType: 'text/plain',
          command: 'notepad.exe {{attachmentPath}}',
        },
        {
          mimeType: 'image/png',
          command:
            '"C:\\Program Files\\draw.io\\draw.io.exe" "{{attachmentPath}}"',
        },
        {
          mimeType: 'image/svg+xml',
          command:
            '"C:\\Program Files\\draw.io\\draw.io.exe" "{{attachmentPath}}"',
        },
      ],
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
      if (hasCode(error)) {
        // If file already exists (EEXIST), that's fine - we'll use the existing file
        if (error.code !== 'EEXIST') {
          throw new Error(
            `Error creating preferences file '${this.prefsFilePath}': ${error}`,
          );
        } else {
          this.logger.warn('Preferences file already exists');
        }
      } else {
        throw new Error(
          `Error creating preferences file '${this.prefsFilePath}': ${error}`,
        );
      }
    }
  }

  private get logger() {
    return getChildLogger({
      module: 'userPreferences',
    });
  }

  public getPreferences(): UserPreferencesObject {
    // Read and parse the preferences file
    try {
      return JSON.parse(readFileSync(this.prefsFilePath, 'utf8'));
    } catch (error) {
      throw new Error(
        `Error reading preferences file '${this.prefsFilePath}': ${error}`,
      );
    }
  }
}
