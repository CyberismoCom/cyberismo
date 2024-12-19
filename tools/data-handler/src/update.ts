/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { Create } from './create.js';
import { Project } from './containers/project.js';
import { resourceName } from './utils/resource-utils.js';

/**
 * Class that handles 'update' commands.
 */
export class Update {
  constructor(private project: Project) {}

  /**
   * Updates single resource property.
   * @param name Name of the resource
   * @param key Property to change in resource JSON
   * @param value New value for 'key'
   */
  public async updateValue<Type>(name: string, key: string, value: Type) {
    const resource = Create.createResourceObject(
      this.project,
      resourceName(name),
    );
    await resource?.update(key, value);
    this.project.collectLocalResources();
  }
}
