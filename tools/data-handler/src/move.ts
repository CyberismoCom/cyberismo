/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

// node
import { join, sep } from 'node:path';

// ismo
import { copyDir, deleteDir } from './utils/file-utils.js';
import { card } from './interfaces/project-interfaces.js';
import { Project } from './containers/project.js';

export class Move {
  static project: Project;

  constructor() {}

  /**
   * Moves card from 'destination' to 'source'.
   * @param path Project path
   * @param source source card to move
   * @param destination destination card where source card will be moved to; or 'root'
   */
  public async moveCard(path: string, source: string, destination: string) {
    Move.project = new Project(path);

    const promiseContainer = [];
    promiseContainer.push(Move.project.findSpecificCard(source));
    if (destination !== 'root') {
      promiseContainer.push(Move.project.findSpecificCard(destination));
    } else {
      const returnObject: card = {
        key: '',
        path: Move.project.cardrootFolder,
      };
      promiseContainer.push(Promise.resolve(returnObject));
    }
    const [sourceCard, destinationCard] = await Promise.all(promiseContainer);

    if (!sourceCard) {
      throw new Error(`Card ${source} not found from project`);
    }
    if (!destinationCard) {
      throw new Error(`Card ${destination} not found from project`);
    }

    // Imported templates cannot be modified.
    if (
      destinationCard.path.includes(`${sep}modules`) ||
      sourceCard.path.includes(`${sep}modules${sep}`)
    ) {
      throw new Error(`Cannot modify imported module templates`);
    }

    const bothTemplateCards =
      Project.isTemplateCard(sourceCard) &&
      Project.isTemplateCard(destinationCard);
    const bothProjectCards =
      Move.project.hasCard(sourceCard.key) &&
      Move.project.hasCard(destinationCard.key);
    if (!(bothTemplateCards || bothProjectCards)) {
      throw new Error(
        `Cards cannot be moved from project to template or vice versa`,
      );
    }

    const destinationPath =
      destination === 'root'
        ? join(Move.project.cardrootFolder, sourceCard.key)
        : join(destinationCard.path, 'c', sourceCard.key);

    await copyDir(sourceCard.path, destinationPath);
    await deleteDir(sourceCard.path);
  }
}
