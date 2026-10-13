/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2024
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

// node
import { basename, join, resolve } from 'node:path';
import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';

import { SCHEMA_VERSION } from '@cyberismo/migrations';
import { scanForProjects } from '../project-scanner.js';
import { createGit, gitTimeout } from '../utils/git-config.js';
import { pathExists } from '../utils/file-utils.js';
import { Checkout } from '../containers/project.js';
import { Validate } from './validate.js';

import type { ProjectFile } from '@cyberismo/model';
import { recordSettingsChange } from '../utils/change-feed.js';
import { write } from '../utils/rw-lock.js';
import { writeJsonFile } from '../utils/json.js';
import { getChildLogger } from '../utils/log-utils.js';

const logger = getChildLogger({ module: 'create' });

// todo: Is there a easy to way to make JSON schema into a TypeScript interface/type?
//       Check this out: https://www.npmjs.com/package/json-schema-to-ts

/**
 * Handles all create commands.
 */
export class Create {
  constructor(private checkout: Checkout) {}

  static JSONFileContent: ProjectFile[] = [
    {
      path: '.cards/local',
      content: [{ id: 'cardsConfigSchema', version: 1 }],
      name: Checkout.schemaContentFile,
    },
    {
      path: '.cards/local',
      content: {
        schemaVersion: SCHEMA_VERSION,
        cardKeyPrefix: '$PROJECT-PREFIX',
        name: '$PROJECT-NAME',
        description: '',
        modules: [],
        hubs: [],
      },
      name: Checkout.projectConfigFileName,
    },
  ];

  static gitIgnoreContent: string[] = [
    '.calc',
    '.asciidoctor',
    '.vscode',
    '*.html',
    '*.pdf',
    '*.puml',
    '**/.DS_Store',
    '*-debug.log',
    '*-error.log',
    '.temp',
    '.logs',
    '.cache',
  ];

  /**
   * Adds a new hub location.
   * @param hubUrl URL of the hub
   */
  @write((hubUrl) => `Add hub ${hubUrl}`)
  public async addHubLocation(hubUrl: string) {
    await this.checkout.configuration.addHub(hubUrl);
    recordSettingsChange(this.checkout.lock);
  }

  /**
   * Creates a new project.
   * @param projectPath where to create the project.
   * @param projectPrefix prefix for the project.
   * @param projectName name for the project.
   * @param projectCategory category for the project (empty string if not provided).
   * @param projectDescription description for the project (empty string if not provided).
   */
  public static async createProject(
    projectPath: string,
    projectPrefix: string,
    projectName: string,
    projectCategory: string,
    projectDescription: string,
  ) {
    // No lock required, since we are creating a new project
    projectPath = resolve(projectPath);

    if (!projectPath) {
      throw new Error('Cannot create project without a path');
    }

    const projectFolders: string[] = ['.cards/local', 'cardRoot'];

    if (!Validate.validateFolder(projectPath)) {
      throw new Error(
        `Input validation error: folder name '${projectPath}' is invalid`,
      );
    }

    if (
      projectPrefix === undefined ||
      projectPrefix.length < 3 ||
      projectPrefix.length > 10
    ) {
      throw new Error(
        `Input validation error: prefix must be from 3 to 10 characters long. '${projectPrefix}' does not fulfill the condition.`,
      );
    }
    if (!Validate.isValidProjectName(projectName)) {
      throw new Error(
        `Input validation error: invalid project name '${projectName}'`,
      );
    }
    if (!Validate.validatePrefix(projectPrefix)) {
      throw new Error(
        `Input validation error: invalid prefix '${projectPrefix}'`,
      );
    }

    if (Checkout.isCreated(projectPath)) {
      throw new Error('Project already exists');
    }

    if (!Validate.isValidProjectName(projectName)) {
      throw new Error(
        `Input validation error: invalid project name '${projectName}'`,
      );
    }

    await mkdir(projectPath, { recursive: true }).then(async () => {
      return await Promise.all(
        projectFolders.map((folder) =>
          mkdir(`${projectPath}/${folder}`, { recursive: true }),
        ),
      );
    });

    await Promise.all(
      // Deep clone to avoid mutating the static template
      structuredClone(Create.JSONFileContent).map(
        async (entry: ProjectFile) => {
          if ('cardKeyPrefix' in entry.content) {
            if (entry.content.cardKeyPrefix.includes('$PROJECT-PREFIX')) {
              entry.content.cardKeyPrefix = projectPrefix.toLowerCase();
            }
            if (entry.content.name.includes('$PROJECT-NAME')) {
              entry.content.name = projectName;
            }
            if (projectCategory) {
              entry.content.category = projectCategory;
            }
            if (projectDescription) {
              entry.content.description = projectDescription;
            }
          }
          await writeJsonFile(
            join(projectPath, entry.path, entry.name),
            entry.content,
          );
        },
      ),
    );

    try {
      await writeFile(
        join(projectPath, '.gitignore'),
        this.gitIgnoreContent.join('\n') + '\n',
      );
    } catch {
      console.error('Failed to create project');
    }
  }

  /**
   * Clones a git repository into the given destination directory.
   * Clones to a temporary location first, validates that the repository
   * contains at least one Cyberismo project, then moves it to the final path.
   * @param url Git URL to clone (https:// or git@)
   * @param destPath Parent directory where the repo will be cloned into
   * @returns The path to the cloned repository
   */
  public static async cloneProject(
    url: string,
    destPath: string,
  ): Promise<string> {
    const repoName = basename(url, '.git').replace(/[^\w.-]/g, '_');
    const finalPath = join(destPath, repoName);

    if (pathExists(finalPath)) {
      throw new Error(`Destination '${repoName}' already exists`);
    }

    // Clone to a temp directory in destPath so rename works (same filesystem)
    await mkdir(destPath, { recursive: true });
    let tempDir: string | undefined;
    let tempClonePath!: string;

    try {
      tempDir = await mkdtemp(join(destPath, '.cyberismo-clone-'));
      tempClonePath = join(tempDir, repoName);
      const git = createGit({ timeout: gitTimeout() });
      await git.clone(url, tempClonePath);

      // Validate that the cloned repo contains Cyberismo projects
      const projects = await scanForProjects(tempClonePath);
      if (projects.length === 0) {
        throw new Error(
          'Cloned repository does not contain any Cyberismo projects',
        );
      }

      // Move to the final destination
      await rename(tempClonePath, finalPath);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(
          `Failed to clone repository '${url}': ${error.message}`,
          { cause: error },
        );
      }
      throw error;
    } finally {
      // Clean up on failure. On success rename() has already moved tempClonePath
      // so rm with force:true is a no-op. Both paths are handled uniformly here.
      const cleanupPath = tempDir ?? tempClonePath;
      if (cleanupPath) {
        await rm(cleanupPath, { recursive: true, force: true }).catch((err) => {
          logger.warn(
            err,
            `Failed to clean up temporary path '${cleanupPath}'`,
          );
        });
      }
    }

    return finalPath;
  }
}
