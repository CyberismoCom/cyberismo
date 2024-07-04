import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { formatJson } from './json.js';
import { dirname } from 'path';

/**
 * The class checks if the preferences file exists when instantiated, and if not, creates it with a default JSON object.
 * The getPreferences() method simply reads and parses the file to return the preferences object.
 */
export class UserPreferences {
  // If preferences do not exist, they are initialised
  // with these defaults.
  static defaults: object = {
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

  public getPreferences() {
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
