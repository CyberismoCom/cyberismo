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

import { ResourceMutations } from '../mutations/resource-mutations.js';
import { resourceName as parseResourceName } from '../utils/resource-utils.js';
import type { Fetch } from './fetch.js';
import type { Modules } from './modules.js';
import type { Checkout } from '../containers/project.js';
import type { RemovableResourceTypes } from '@cyberismo/model';
import { recordSettingsChange } from '../utils/change-feed.js';
import { write } from '../utils/rw-lock.js';

/**
 * Remove command.
 */
export class Remove {
  /**
   * Creates a new instance of Remove command.
   * @param project Project instance to use
   */
  private readonly mutations: ResourceMutations;

  constructor(
    private checkout: Checkout,
    private fetchCmd: Fetch,
    private modulesCmd: Modules,
  ) {
    this.mutations = new ResourceMutations(checkout);
  }

  // True, if resource is a project resource
  private projectResource(type: RemovableResourceTypes): boolean {
    return (
      type === 'calculation' ||
      type === 'cardType' ||
      type === 'fieldType' ||
      type === 'graphModel' ||
      type === 'graphView' ||
      type === 'linkType' ||
      type === 'report' ||
      type === 'skill' ||
      type === 'template' ||
      type === 'workflow'
    );
  }

  // Remove a hub from project.
  private async removeHubLocation(name: string) {
    await this.checkout.configuration.removeHub(name);
    recordSettingsChange(this.checkout.lock);
    // The cached module list still offers the removed hub's modules until it
    // is rewritten, and nothing else rewrites it without contacting a hub.
    await this.fetchCmd.pruneUnconfiguredHubs();
  }

  /**
   * Removes a hub, an imported module or a resource from project.
   * @param type Type of resource
   * @param targetName Resource name, or other identifying item
   * @throws when trying to remove unknown type
   */
  @write((type, targetName) => `Remove ${type} ${targetName}`)
  public async remove(type: RemovableResourceTypes, targetName: string) {
    // Ensure module list is up to date when removing modules
    if (type === 'module') {
      await this.fetchCmd.ensureModuleListUpToDate();
    }

    if (this.projectResource(type)) {
      // Callers may pass a bare identifier; fill in prefix and type.
      const parsed = parseResourceName(targetName);
      await this.mutations.apply({
        kind: 'delete',
        target: {
          prefix: parsed.prefix || this.checkout.projectPrefix,
          type:
            parsed.type ||
            this.checkout.resources.resourceTypeFromSingularType(type),
          identifier: parsed.identifier,
        },
      });
      return;
    } else {
      // Something else than resources...
      if (type === 'hub') return this.removeHubLocation(targetName);
      else if (type === 'module') return this.modulesCmd.remove(targetName);
    }
    throw new Error(`Unknown resource type '${type}'`);
  }
}
