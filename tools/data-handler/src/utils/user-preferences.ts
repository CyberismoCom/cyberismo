/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { formatJson } from './json.js';
import { dirname } from 'path';

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
        command: 'vim',
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
          mimeType: 'text/plain',
          command: 'vim {{attachmentPath}}',
        },
        {
          mimeType: 'image/png',
          command: 'draw.io {{attachmentPath}}',
        },
        {
          mimeType: 'image/svg+xml',
          command: 'draw.io {{attachmentPath}}',
        },
      ],
      win32: [
        {
          mimeType: 'text/plain',
          command: 'notepad.exe {{attachmentPath}}',
        },
        {
          mimeType: 'image/png',
          command: 'C:Program Files...draw.io {{attachmentPath}}',
        },
        {
          mimeType: 'image/svg+xml',
          command: 'C:Program Files...draw.io {{attachmentPath}}',
        },
      ],
    },
  };

  constructor(private prefsFilePath: string) {
    if (!existsSync(this.prefsFilePath)) {
      // Create the preferences directory based on prefsFilePath dirname
      const prefsDir = dirname(this.prefsFilePath);

      try {
        if (!existsSync(prefsDir)) {
          mkdirSync(prefsDir, { recursive: true });
        }
        // File does not exist, create it with default content
        writeFileSync(this.prefsFilePath, formatJson(UserPreferences.defaults));
      } catch (error) {
        throw new Error(
          `Error creating preferences file '${this.prefsFilePath}': ${error}`,
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
      );
    }
  }
}
