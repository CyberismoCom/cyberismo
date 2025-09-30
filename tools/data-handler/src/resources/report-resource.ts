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

import { readdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { extname, join } from 'node:path';

import { copyDir } from '../utils/file-utils.js';
import type {
  Card,
  Operation,
  Project,
  ResourceName,
} from './folder-resource.js';
import {
  DefaultContent,
  FolderResource,
  resourceNameToString,
  sortCards,
} from './folder-resource.js';
import type {
  Report,
  ReportMetadata,
  ReportUpdateKey,
} from '../interfaces/resource-interfaces.js';
import type { ReportContent } from '../interfaces/folder-content-interfaces.js';
import type { Schema } from 'jsonschema';
import { getStaticDirectoryPath } from '@cyberismo/assets';
import { Validate } from '../commands/validate.js';

const REPORT_SCHEMA_FILE = 'parameterSchema.json';
const PARAMETER_SCHEMA_ID = 'jsonSchema';

const staticDirectoryPath = await getStaticDirectoryPath();

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
    this.reportSchema = this.readSchemaFile(schemaPath);
  }

  // Path to content folder.
  // @todo: create the files' content dynamically.
  private defaultReportLocation: string = join(
    staticDirectoryPath,
    'defaultReport',
  );

  // Try to read schema file content
  private readSchemaFile(path: string) {
    try {
      const schema = readFileSync(path);
      return JSON.parse(schema.toString());
    } catch {
      return undefined;
    }
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
    ]);
    // Finally, write updated content.
    await this.write();
  }

  /**
   * Sets new metadata into the report object.
   * @param newContent metadata content for the report.
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
      .filter((dirent) => dirent.isFile() && extname(dirent.name) === '.hbs')
      .map((item) => join(item.parentPath, item.name));
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
   * Shows metadata of the resource.
   * @returns report metadata.
   */
  public async show(): Promise<Report> {
    const baseData = (await super.show()) as ReportMetadata;
    const fileContents = await super.contentData();
    const content: ReportContent = {
      contentTemplate: fileContents.contentTemplate as string,
      queryTemplate: fileContents.queryTemplate as string,
      schema: fileContents.schema ? (fileContents.schema as Schema) : undefined,
    };
    return {
      ...baseData,
      content: content,
    };
  }

  /**
   * Updates report resource.
   * @param key Key to modify
   * @param op Operation to perform on 'key'
   */
  public async update<Type>(key: ReportUpdateKey, op: Operation<Type>) {
    if (
      typeof key === 'object' &&
      key.key === 'content' &&
      key.subKey === 'schema'
    ) {
      const fileContent = JSON.stringify(super.handleScalar(op), null, 2);
      await this.updateFile('parameterSchema.json', fileContent);
      return;
    }

    if (key === 'category') {
      const content = structuredClone(this.content) as ReportMetadata;
      content.category = super.handleScalar(op) as string;

      await super.postUpdate(content, key, op);
      return;
    }

    await super.update(key, op);
  }

  /**
   * List where this resource is used.
   * Always returns card key references first, then calculation references.
   *
   * @param cards Optional. Check these cards for usage of this resource. If undefined, will check all cards.
   * @returns array of card keys and calculation filenames that refer this resource.
   */
  public async usage(cards?: Card[]): Promise<string[]> {
    const allCards = cards ?? (await super.cards());
    const [relevantCards, calculations] = await Promise.all([
      super.usage(allCards),
      super.calculations(),
    ]);
    return [...relevantCards.sort(sortCards), ...calculations];
  }

  /**
   * Validates report.
   * @throws when there are validation errors.
   * @param content Content to be validated.
   * @note If content is not provided, base class validation will use resource's current content.
   */
  public async validate(content?: object) {
    if (this.reportSchema) {
      const errors = Validate.getInstance().validateJson(
        this.reportSchema,
        PARAMETER_SCHEMA_ID,
      );
      if (errors.length > 0) {
        throw new Error(`Invalid parameter schema: ${errors}`);
      }
    }
    return super.validate(content);
  }
}
