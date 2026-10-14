/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026

  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { join, resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';

import { SCHEMA_VERSION } from '@cyberismo/migrations';
import type { CreateProjectParams, ProjectFile } from '@cyberismo/model';
import { Validate } from '../commands/validate.js';
import { Checkout } from '../containers/project.js';
import { isValidFolderName } from '../utils/file-utils.js';
import { writeJsonFile } from '../utils/json.js';

// todo: Is there a easy to way to make JSON schema into a TypeScript interface/type?
//       Check this out: https://www.npmjs.com/package/json-schema-to-ts

const JSONFileContent: ProjectFile[] = [
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

const gitIgnoreContent: string[] = [
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
 * Writes a new project's files at `projectPath`; makes no repository.
 * @throws if `params` or the path is invalid, or a project is there already.
 */
export async function createProject(
  projectPath: string,
  params: CreateProjectParams,
) {
  const {
    prefix: projectPrefix,
    name: projectName,
    category: projectCategory,
    description: projectDescription,
  } = params;
  // No lock required, since we are creating a new project
  projectPath = resolve(projectPath);

  if (!projectPath) {
    throw new Error('Cannot create project without a path');
  }

  const projectFolders: string[] = ['.cards/local', 'cardRoot'];

  if (!isValidFolderName(projectPath)) {
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
    structuredClone(JSONFileContent).map(async (entry: ProjectFile) => {
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
    }),
  );

  try {
    await writeFile(
      join(projectPath, '.gitignore'),
      gitIgnoreContent.join('\n') + '\n',
    );
  } catch {
    console.error('Failed to create project');
  }
}
