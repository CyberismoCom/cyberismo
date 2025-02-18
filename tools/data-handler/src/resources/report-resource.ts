/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { readdir, readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { copyDir, pathExists } from '../utils/file-utils.js';
import { DefaultContent } from './create-defaults.js';
import { FolderResource, Operation } from './folder-resource.js';
import { Project } from '../containers/project.js';
import { ResourceName, resourceNameToString } from '../utils/resource-utils.js';
import { Report, ReportMetadata } from '../interfaces/resource-interfaces.js';
import { Schema } from 'jsonschema';

const CARD_CONTENT_HANDLEBAR_FILE = 'index.adoc.hbs';
const QUERY_HANDLEBAR_FILE = 'query.lp.hbs';
const REPORT_SCHEMA_FILE = 'parameterSchema.json';

/**
 * Report resource class.
 */
export class ReportResource extends FolderResource {
  private reportSchema: Schema;
  constructor(project: Project, name: ResourceName) {
    super(project, name, 'reports');

    this.contentSchemaId = 'reportSchema';
    this.contentSchema = super.contentSchemaContent(this.contentSchemaId);

    this.initialize();

    const schemaPath = join(this.internalFolder, REPORT_SCHEMA_FILE);
    this.reportSchema = pathExists(schemaPath)
      ? JSON.parse(readFileSync(schemaPath).toString())
      : undefined;
  }

  // Path to content folder.
  // @todo: create the files' content dynamically.
  private defaultReportLocation: string = join(
    fileURLToPath(import.meta.url),
    '../../../../../content/defaultReport',
  );

  // When resource name changes.
  private async handleNameChange(existingName: string) {
    await Promise.all([
      super.updateHandleBars(
        existingName,
        this.content.name,
        await this.handleBarFiles(),
      ),
      super.updateCalculations(existingName, this.content.name),
    ]);
    // Finally, write updated content.
    await this.write();
  }

  /**
   * Sets new metadata into the report object.
   * @param newContent metadata content for the template.
   * @throws if 'newContent' is not valid.
   */
  public async createReport() {
    const defaultContent = DefaultContent.report(
      resourceNameToString(this.resourceName),
    );

    await super.create(defaultContent);

    // Copy report default structure to destination.
    await copyDir(this.defaultReportLocation, this.internalFolder);
  }

  /**
   * Returns resource content.
   */
  public get data(): ReportMetadata {
    return super.data as ReportMetadata;
  }

  /**
   * Deletes file and folder that this resource is based on.
   */
  public async delete() {
    return super.delete();
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
      .filter((dirent) => {
        return dirent.isFile() && extname(dirent.name) === '.hbs';
      })
      .map((item) => join(item.parentPath, item.name));
  }

  /**
   * Renames the object and the file.
   * @param newName New name for the resource.
   */
  public async rename(newName: ResourceName) {
    const existingName = this.content.name;
    await super.rename(newName);
    return this.handleNameChange(existingName);
  }

  /**
   * Shows metadata of the resource.
   * @returns template metadata.
   */
  public async show(): Promise<Report> {
    const reportMetadata = (await super.show()) as ReportMetadata;
    return {
      name: resourceNameToString(this.resourceName),
      metadata: reportMetadata,
      contentTemplate: (
        await readFile(join(this.internalFolder, CARD_CONTENT_HANDLEBAR_FILE))
      ).toString(),
      queryTemplate: (
        await readFile(join(this.internalFolder, QUERY_HANDLEBAR_FILE))
      ).toString(),
      schema: this.reportSchema,
    };
  }

  /**
   * Updates report resource.
   * @param key Key to modify
   * @param op Operation to perform on 'key'
   * @throws if key is unknown.
   */
  public async update<Type>(key: string, op: Operation<Type>) {
    const nameChange = key === 'name';
    const existingName = this.content.name;

    await super.update(key, op);

    const content = { ...(this.content as ReportMetadata) };

    if (key === 'name') {
      content.name = super.handleScalar(op) as string;
    } else if (key === 'displayName') {
      content.displayName = super.handleScalar(op) as string;
    } else if (key === 'description') {
      content.description = super.handleScalar(op) as string;
    } else if (key === 'category') {
      content.category = super.handleScalar(op) as string;
    }

    await super.postUpdate(content, key, op);

    // Renaming this template causes that references to its name must be updated.
    if (nameChange) {
      await this.handleNameChange(existingName);
    }
  }

  /**
   * Validates report.
   * @throws when there are validation errors.
   * @param content Content to be validated.
   * @note If content is not provided, base class validation will use resource's current content.
   */
  public async validate(content?: object) {
    return super.validate(content);
  }
}
