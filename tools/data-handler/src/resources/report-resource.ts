/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2024

  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { extname, join } from 'node:path';
import { readdir } from 'node:fs/promises';

import { copyDir } from '../utils/file-utils.js';
import { DefaultContent } from './create-defaults.js';
import { FolderResource } from './folder-resource.js';
import { getStaticDirectoryPath } from '@cyberismo/assets';
import { resourceNameToString } from '../utils/resource-utils.js';
import { sortCards } from '../utils/card-utils.js';
import { Validate } from '../commands/validate.js';

import type { Card } from '../interfaces/project-interfaces.js';
import type { Project } from '../containers/project.js';
import type { ReportContent } from '../interfaces/folder-content-interfaces.js';
import type { ReportMetadata } from '../interfaces/resource-interfaces.js';
import type { ResourceName } from '../utils/resource-utils.js';

const PARAMETER_SCHEMA_ID = 'jsonSchema';

/**
 * Report resource class.
 */
export class ReportResource extends FolderResource<
  ReportMetadata,
  ReportContent
> {
  /**
   * Creates instance of ReportResource
   * @param project Project to use
   * @param name Resource name
   */
  constructor(project: Project, name: ResourceName) {
    super(project, name, 'reports');

    this.contentSchemaId = 'reportSchema';
    this.contentSchema = super.contentSchemaContent(this.contentSchemaId);
  }

  // Path to content folder.
  // @todo: create the files' content dynamically.
  private async getDefaultReportLocation(): Promise<string> {
    const staticDirectoryPath = await getStaticDirectoryPath();
    return join(staticDirectoryPath, 'defaultReport');
  }

  /**
   * Handle name changes for reports
   * @param existingName The previous name before the change
   */
  protected async onNameChange(existingName: string): Promise<void> {
    await Promise.all([
      super.updateHandleBars(
        existingName,
        this.content.name,
        await this.handleBarFiles(),
      ),
      super.updateCalculations(existingName, this.content.name),
      super.updateCardContentReferences(existingName, this.content.name),
    ]);
    // Finally, write updated content.
    await this.write();
  }

  /**
   * Sets new metadata into the report object.
   */
  public async createReport() {
    const defaultContent = DefaultContent.report(
      resourceNameToString(this.resourceName),
    );

    await super.create(defaultContent);

    // Copy report default structure to destination.
    const defaultReportLocation = await this.getDefaultReportLocation();
    await copyDir(defaultReportLocation, this.internalFolder);
    await this.loadContentFiles();
  }

  /**
   * Returns list of handlebar filenames that this report has.
   * @returns list of handlebar filenames that this report has.
   */
  public async handleBarFiles() {
    return (
      await readdir(this.internalFolder, {
        withFileTypes: true,
        recursive: true,
      })
    )
      .filter((dirent) => dirent.isFile() && extname(dirent.name) === '.hbs')
      .map((item) => join(item.parentPath, item.name));
  }

  /**
   * Apply transient changes for field type migrations.
   */
  public async migrate<Type, K extends string>(
    updateKey: UpdateKey<K>,
    op: Operation<Type>,
  ): Promise<void> {
    const { key } = updateKey;
    await super.migrate(updateKey, op);
    // TODO: move to base class
    if (key === 'name') {
      await this.onNameChange(this.content.name);
    }
    // TODO: Implement report-specific transient changes
  }

  /**
   * Renames the object and the file.
   * @param newName New name for the resource.
   */
  public async rename(newName: ResourceName) {
    const existingName = this.content.name;
    await super.rename(newName);
    return this.onNameChange(existingName);
  }

  /**
   * List where this resource is used.
   * Always returns card key references first, then calculation references.
   *
   * @param cards Optional. Check these cards for usage of this resource. If undefined, will check all cards.
   * @returns array of card keys and calculation filenames that refer this resource.
   */
  public async usage(cards?: Card[]): Promise<string[]> {
    const allCards = cards ?? super.cards();
    const [relevantCards, calculations] = await Promise.all([
      super.usage(allCards),
      super.calculations(),
    ]);
    return [...relevantCards.sort(sortCards), ...calculations];
  }

  /**
   * Validates report.
   * @param content Content to be validated.
   * @note If content is not provided, base class validation will use resource's current content.
   * @throws when there are validation errors.
   */
  public async validate(content?: object) {
    const resourceContent = this.contentData();
    if (resourceContent.schema) {
      const errors = Validate.getInstance().validateJson(
        resourceContent.schema,
        PARAMETER_SCHEMA_ID,
      );
      if (errors.length > 0) {
        throw new Error(`Invalid parameter schema: ${errors}`);
      }
    }
    return super.validate(content);
  }
}
