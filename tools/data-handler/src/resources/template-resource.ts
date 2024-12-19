/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { DefaultContent } from '../create-defaults.js';
import { FolderResource } from './folder-resource.js';
import { Project } from '../containers/project.js';
import {
  ResourceName,
  resourceName,
  resourceNameToString,
} from '../utils/resource-utils.js';
import { TemplateMetadata } from '../interfaces/resource-interfaces.js';
import { Validate } from '../validate.js';

/**
 * Represents a template resource.
 */
export class TemplateResource extends FolderResource {
  constructor(project: Project, name: ResourceName) {
    super(project, name);

    this.contentSchemaId = 'templateSchema';
    this.contentSchema = [
      {
        id: this.contentSchemaId,
        version: 1,
      },
    ] as unknown as JSON;
    this.type = 'templates';
    this.fileName = 'template.json';

    this.setResourceFolder();
  }

  /* eslint-disable @typescript-eslint/no-unused-vars */
  public async createTemplate(workflowName: string) {
    const validWorkflowName = await Validate.getInstance().validResourceName(
      'workflows',
      resourceNameToString(resourceName(workflowName)),
      await this.project.projectPrefixes(),
    );
    const content = DefaultContent.templateContent(
      resourceNameToString(this.resourceName),
    ) as unknown as JSON;
    const cardTypeContent = content as unknown as TemplateMetadata;
    cardTypeContent.name = cardTypeContent.name.endsWith('.json')
      ? cardTypeContent.name
      : cardTypeContent.name + '.json';

    await super.create(cardTypeContent);
  }

  public async delete() {
    await super.delete();
  }

  public async rename(newName: ResourceName) {
    return super.rename(newName);
  }

  public async show(): Promise<TemplateMetadata> {
    return super.show() as unknown as TemplateMetadata;
  }

  public async validate() {
    return super.validate();
  }

  public async update(key: string, value: unknown) {
    await super.update(key, value);
    const templateContent = this.content as unknown as TemplateMetadata;
    if (key === 'name') {
      templateContent.name = value as string;
    } else if (key === 'category') {
      templateContent.category = value as string;
    } else if (key === 'description') {
      templateContent.description = value as string;
    } else if (key === 'displayName') {
      templateContent.displayName = value as string;
    } else {
      throw new Error(`Unknown property '${key}' for CardType`);
    }
  }
}
