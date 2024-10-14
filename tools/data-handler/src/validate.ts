/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

// node
import { Dirent, readdirSync } from 'node:fs';
import { dirname, extname, join, parse } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdir } from 'node:fs/promises';

// dependencies
import { Validator as JSONValidator, Schema } from 'jsonschema';
import { Validator as DirectoryValidator } from 'directory-schema-validator';

// data-handler
import { errorFunction } from './utils/log-utils.js';
import { readJsonFile, readJsonFileSync } from './utils/json.js';
import { pathExists } from './utils/file-utils.js';
import { resourceNameParts } from './utils/resource-utils.js';
import { Project } from './containers/project.js';
import {
  Card,
  FieldTypeDefinition,
  TemplateMetadata,
  CardType,
  CustomField,
  DotSchemaContent,
  LinkType,
  ProjectSettings,
  WorkflowMetadata,
  ReportMetadata,
} from './interfaces/project-interfaces.js';

import * as EmailValidator from 'email-validator';

const baseDir = dirname(fileURLToPath(import.meta.url));

export interface LengthProvider {
  length: number;
}

export class Validate {
  private static instance: Validate;

  validator: JSONValidator;
  directoryValidator: DirectoryValidator;

  private parentSchema: Schema;

  static baseFolder: string;
  static jsonFileExtension = '.json';
  static parentSchemaFile: string;
  static schemaConfigurationFile = '.schema';
  static projectConfigurationFile = 'cardsConfig.json';
  static templateMetadataFile = 'template.json';
  static cardMetadataFile = 'index.json';
  static dotSchemaSchemaId = 'dotSchema';
  static parameterSchemaFile = 'parameterSchema.json';
  static reportMetadataFile = 'report.json';

  constructor() {
    Validate.baseFolder = pathExists(
      join(process.cwd(), '../schema', 'cardTreeDirectorySchema.json'),
    )
      ? join(process.cwd(), '../schema')
      : join(baseDir, '../../schema');
    Validate.parentSchemaFile = join(
      Validate.baseFolder,
      'cardTreeDirectorySchema.json',
    );
    this.validator = new JSONValidator();
    this.directoryValidator = new DirectoryValidator();
    this.parentSchema = readJsonFileSync(Validate.parentSchemaFile) as Schema;
    this.addChildSchemas();
  }

  // Helper to get length from types when needed.
  private length<T extends LengthProvider>(item: T): number {
    return item.length;
  }

  // Loads child schemas to validator.
  private addChildSchemas() {
    readdirSync(Validate.baseFolder, { withFileTypes: true })
      .filter((dirent) => dirent.name !== Validate.parentSchemaFile)
      .forEach((file) => {
        const schema = readJsonFileSync(this.fullPath(file)) as Schema;
        this.validator.addSchema(schema, schema.$id);
      });
  }

  // Return full path and filename.
  private fullPath(file: Dirent): string {
    return join(file.parentPath, file.name);
  }

    // Handles reading and validating 'contentSchema' in a directory.
    private async readAndValidateContentFiles(
      project: Project,
      path: string,
    ): Promise<string[]> {
      const message: string[] = [];
      try {
        const files = await readdir(path, {
          withFileTypes: true,
          recursive: true,
        });
  
        const schemaFiles = files.filter(
          (dirent) =>
            dirent.isFile() && dirent.name === Validate.schemaConfigurationFile,
        );
  
        message.push(...(await this.validateSchemaFiles(schemaFiles)));
  
        // no point in validating contents if .schema files are not valid
        if (message.length !== 0) {
          return message;
        }
  
        const schemaConfigs = (
          await Promise.all(
            schemaFiles.map(async (dirent) => ({
              dirent,
              content: await readJsonFile(this.fullPath(dirent)),
            })),
          )
        ).reduce<Record<string, DotSchemaContent>>((acc, { dirent, content }) => {
          acc[dirent.parentPath] = content;
          return acc;
        }, {});
  
        const prefixes = await project.projectPrefixes();
        // Go through every file
        for (const file of files.filter(
          (dirent) =>
            dirent.isFile() &&
            dirent.name !== Validate.schemaConfigurationFile &&
            extname(dirent.name) === Validate.jsonFileExtension,
        )) {
          const fullPath = this.fullPath(file);
          const content = await readJsonFile(fullPath);
          const nameErrors = this.validateResourceName(
            fullPath,
            file,
            content,
            prefixes,
          );
  
          if (nameErrors) {
            message.push(...nameErrors);
          }
          const schemas = schemaConfigs[file.parentPath];
          // if schema is not defined for the directory, skip it
          if (!schemas) {
            continue;
          }
          const fileSchema = schemas.find(
            (schema) =>
              schema.file === file.name || (schemas.length === 1 && !schema.file),
          );
  
          if (!fileSchema) {
            continue;
          }
  
          const schema = this.validator.schemas[fileSchema.id];
  
          if (!schema) {
            throw new Error(`Unknown schema name ${fileSchema.id}, aborting.`);
          }
  
          const result = this.validator.validate(content, schema);
          for (const error of result.errors) {
            const msg = `Validation error from '${fullPath}': ${error.message}.`;
            message.push(msg);
          }
        }
      } catch (error) {
        throw new Error(errorFunction(error));
      }
      return message;
    }

  // Handles validating .schema files
  private async validateSchemaFiles(files: Dirent[]) {
    const schema = this.validator.schemas[Validate.dotSchemaSchemaId];

    if (!schema) {
      throw new Error(`.schema schema not found`);
    }

    const message: string[] = [];

    for (const file of files) {
      const fullPath = this.fullPath(file);

      const result = this.validator.validate(
        await readJsonFile(fullPath),
        schema,
      );
      for (const error of result.errors) {
        const msg = `Validation error from '${fullPath}': ${error.message}.`;
        message.push(msg);
      }
    }
    return message;
  }

  private parseValidatorMessage(errorObject: object[]): string {
    let parsedErrorMessage = '';
    // todo: get schema name here?
    for (const error of errorObject) {
      let instancePath = '';
      let params = '';
      let message = '';
      let fileError = false;
      if (Object.prototype.hasOwnProperty.call(error, 'instancePath')) {
        const temp = Object(error)['instancePath'];
        if (temp.endsWith('files')) fileError = true;
        instancePath = temp;
        instancePath = instancePath.replace(/\/directories/g, '');
        instancePath = instancePath.replace(/\/files/g, '');
        if (instancePath === '') {
          instancePath = 'project root';
        }
        if (instancePath[0] === '/') {
          instancePath = instancePath.slice(1);
        }
      }
      if (Object.prototype.hasOwnProperty.call(error, 'params')) {
        params = Object(error)['params']['additionalProperty'];
      }
      if (Object.prototype.hasOwnProperty.call(error, 'message')) {
        message = Object(error)['message'];
        message = message.replace(
          'must have required property',
          fileError ? 'must have file' : 'must have subdirectory',
        );
        if (message === 'must NOT have additional properties') {
          message = message.replace(
            'must NOT have additional properties',
            'non-allowed additional property',
          );
          message = message + `: ${params}`;
        }
      }
      parsedErrorMessage += `\nAt '${instancePath}' ${message}`;
    }
    return parsedErrorMessage;
  }

  // Removes same items from an array.
  private removeDuplicateEntries(
    value: string,
    index: number,
    array: string[],
  ) {
    return array.indexOf(value) === index;
  }

  private async validateArrayOfFields(
    project: Project,
    cardType: CardType,
    fieldArray: string[],
    nameOfArray: string,
  ) {
    const errors: string[] = [];
    if (cardType && fieldArray) {
      for (const field of fieldArray) {
        const fieldType = await project.fieldType(field);
        if (!fieldType) {
          errors.push(
            `Card type '${cardType.name}' has invalid reference to unknown ${nameOfArray} '${field}'`,
          );
        }
      }
    }
    return errors;
  }

  // Validates that 'name' in resources matches filename, location and project prefix.
  // @todo: Can be removed when INTDEV-463 is implemented.
  private validateResourceName(
    fullFileNameWithPath: string,
    file: Dirent,
    content:
      | TemplateMetadata
      | CardType
      | CustomField
      | DotSchemaContent
      | FieldTypeDefinition
      | LinkType
      | ProjectSettings
      | WorkflowMetadata
      | ReportMetadata,
    projectPrefixes: string[],
  ): string[] {
    const errors: string[] = [];
    // Exclude cardsConfig.json, .schemas and template.json.
    if (
      file.name !== Validate.projectConfigurationFile &&
      file.name !== Validate.templateMetadataFile &&
      file.name !== Validate.cardMetadataFile &&
      file.name !== Validate.dotSchemaSchemaId &&
      file.name !== Validate.parameterSchemaFile &&
      file.name !== Validate.reportMetadataFile
    ) {
      const namedContent = content as
        | CardType
        | CustomField
        | FieldTypeDefinition
        | LinkType
        | WorkflowMetadata;
      const { name, type, prefix } = resourceNameParts(namedContent.name);
      const filenameWithoutExtension = parse(file.name).name;

      if (!projectPrefixes.includes(prefix)) {
        errors.push(
          `Wrong prefix in resource '${namedContent.name}'. Project prefixes are '[${projectPrefixes.join(', ')}]'`,
        );
      }
      if (name !== filenameWithoutExtension) {
        errors.push(
          `Resource 'name' ${namedContent.name} mismatch with file path '${fullFileNameWithPath}'`,
        );
      }
      if (!fullFileNameWithPath.includes(type)) {
        errors.push(
          `Wrong type name in resource '${namedContent.name}'. Should match filename path: '${fullFileNameWithPath}'`,
        );
      }
    }
    return errors;
  }

  // Validates that card's dataType can be used with JS types.
  private validType<T>(value: T, fieldType: FieldTypeDefinition): boolean {
    const field = fieldType.dataType;
    const typeOfValue = typeof value;

    // Nulls are always accepted.
    if (typeOfValue === 'object' && value === null) {
      return true;
    }

    if (field === 'date' || field === 'dateTime') {
      return !isNaN(Date.parse(<string>value));
    }
    if (field === 'list') {
      return Array.isArray(value) && this.validateListValues(<string[]>value);
    }
    if (field === 'boolean' || field === 'number') {
      return typeOfValue === field;
    }
    if (field === 'shortText') {
      return typeOfValue === 'string' && this.length(<string>value) <= 80;
    }
    if (field === 'longText') {
      return typeOfValue === 'string';
    }
    if (field === 'integer') {
      return typeOfValue === 'number' && Number.isInteger(value);
    }
    if (field === 'person') {
      // Accept empty names
      return (
        value === undefined ||
        EmailValidator.validate(<string>value) ||
        this.length(<string>value) === 0
      );
    }
    if (field === 'enum') {
      const found = fieldType.enumValues?.find(
        (item) => item.enumValue === value,
      );
      return found ? true : false;
    }
    console.error(`Type ${field} is not supported`);
    return false;
  }

  // Validates that arrays have only string elements.
  private validateListValues(list: string[]): boolean {
    let valid = true;
    list.forEach((value) => {
      if (typeof value !== 'string') {
        valid = false;
      }
    });
    return valid;
  }

  /**
   * Validates that a given directory path (and its children) conform to a JSON schema.
   * @note Validates also content in the directory tree, if .schema file is found.
   * @param projectPath path to validate.
   * @returns string containing all validation errors
   */
  public async validate(projectPath: string): Promise<string> {
    let validationErrors = '';
    try {
      // First, validate that the directory content conforms to the schema.
      const valid = this.directoryValidator.validate(
        this.parentSchema,
        projectPath,
      );
      if (!valid && this.directoryValidator.errors) {
        const errorMsg = this.parseValidatorMessage(
          this.directoryValidator.errors,
        );
        if (errorMsg) {
          validationErrors = errorMsg;
        }
        return validationErrors;
      } else {
        const errorMsg: string[] = [];
        const project = new Project(projectPath);

        // Then, validate that each 'contentSchema' children as well.
        const result = await this.readAndValidateContentFiles(
          project,
          projectPath,
        );
        if (result.length > 0) {
          errorMsg.push(...result);
        }

        // Finally, validate that each card is correct
        const cards = await project.cards();
        cards.push(...(await project.templateCards()));

        for (const card of cards) {
          if (card.metadata) {
            // validate card's workflow
            if (!Project.isTemplateCard(card)) {
              const validWorkflow = await this.validateWorkflowState(
                project,
                card,
              );
              if (validWorkflow.length !== 0) {
                errorMsg.push(validWorkflow);
              }
            }
          }

          const validCustomFields = await this.validateCustomFields(
            project,
            card,
          );
          if (validCustomFields.length !== 0) {
            errorMsg.push(validCustomFields);
          }
        }
        if (errorMsg.length) {
          validationErrors += errorMsg
            .filter(this.removeDuplicateEntries)
            .join('\n');
        }
      }
    } catch (error) {
      validationErrors += errorFunction(error);
    }
    return validationErrors;
  }

  /**
   * Validates that 'object' conforms to JSON schema 'schemaId'.
   * @param content Object to validate.
   * @param schemaId Schema ID to identify a JSON schema.
   * @returns string containing all validation errors
   */
  public validateJson(content: object, schemaId: string): string {
    const validationErrors: string[] = [];
    if (this.validator.schemas[schemaId] === undefined) {
      validationErrors.push(`Unknown schema ${schemaId}`);
    } else {
      const result = this.validator.validate(
        content,
        this.validator.schemas[schemaId],
      );
      for (const error of result.errors) {
        const msg = `Schema '${schemaId}' validation Error: ${error.message}\n`;
        validationErrors.push(msg);
      }
    }
    return validationErrors.join('\n');
  }

  /**
   * Validates that 'prefix' is valid project prefix.
   * @param prefix project prefix
   * @returns true, if prefix can be used as project prefix, false otherwise.
   */
  public static validatePrefix(prefix: string): boolean {
    const validPrefix = new RegExp('^[a-z]+$');
    const contentValidated = validPrefix.test(prefix);
    const lengthValidated = prefix.length > 2 && prefix.length < 11;
    return contentValidated && lengthValidated;
  }

  /**
   * Validate schema that matches schemaId from path.
   * @param {string} projectPath path to schema
   * @param {string} schemaId schema's id
   * @returns string containing all validation errors
   */
  public async validateSchema(
    projectPath: string,
    schemaId: string,
  ): Promise<string> {
    const validationErrors: string[] = [];
    const activeJsonSchema = this.validator.schemas[schemaId];
    if (activeJsonSchema === undefined) {
      throw new Error(`Unknown schema '${schemaId}'`);
    } else {
      if (!pathExists(projectPath)) {
        throw new Error(`Path is not valid ${projectPath}`);
      } else {
        const result = this.validator.validate(
          await readJsonFile(projectPath),
          activeJsonSchema,
        );
        for (const error of result.errors) {
          const msg = `Schema '${schemaId}' validation Error: ${error.message}\n`;
          validationErrors.push(msg);
        }
      }
    }
    return validationErrors.join('\n');
  }

  /**
   * Validates that card's custom fields are according to schema and have correct data in them.
   * @param project currently used Project
   * @param card specific card
   * @returns string containing all validation errors
   */
  public async validateCustomFields(
    project: Project,
    card: Card,
  ): Promise<string> {
    const validationErrors: string[] = [];

    if (!card.metadata) {
      throw new Error(
        `Card '${card.key}' has no metadata. Card object needs to be instantiated with '{metadata: true}'`,
      );
    }

    const cardType = await project.cardType(card.metadata?.cardType);
    if (cardType) {
      // Check that arrays of field types refer to existing fields.
      let fieldErrors = await this.validateArrayOfFields(
        project,
        cardType,
        cardType.optionallyVisibleFields
          ? cardType.optionallyVisibleFields
          : [],
        'optionally visible fields',
      );
      validationErrors.push(...fieldErrors);
      fieldErrors = await this.validateArrayOfFields(
        project,
        cardType,
        cardType.optionallyVisibleFields
          ? cardType.optionallyVisibleFields
          : [],
        'always visible fields',
      );
      validationErrors.push(...fieldErrors);
    } else {
      validationErrors.push(
        `Card '${card.key}' has invalid card type '${card.metadata?.cardType}'`,
      );
    }

    if (cardType && cardType.customFields) {
      for (const field of cardType.customFields) {
        if (card.metadata[field.name] === undefined) {
          validationErrors.push(
            `Card '${card.key}' is missing custom field 'name' from '${field.name}'`,
          );
        }
        const fieldType = await project.fieldType(field.name);
        if (
          fieldType &&
          !this.validType(card.metadata[field.name], fieldType)
        ) {
          const typeOfValue = typeof card.metadata[field.name];
          let fieldValue = card.metadata[field.name];
          if (typeOfValue === 'string') {
            fieldValue = card.metadata[field.name]
              ? `"${card.metadata[field.name]}"`
              : '""';
          }
          validationErrors.push(
            `In card ${card.key} field '${field.name}' is defined as '${fieldType.dataType}', but it is '${typeOfValue}' with value of ${fieldValue}\n`,
          );
          if (fieldType.dataType === 'enum') {
            const listOfEnumValues = fieldType.enumValues?.map(
              (item) => item.enumValue,
            );
            validationErrors.push(
              `Possible enumerations are: ${listOfEnumValues?.join(', ')}\n`,
            );
          }
        }
      }
    }

    return validationErrors.join('\n');
  }

  /**
   * Checks if card's current workflow state matches workflow that card's card type is using.
   * Template cards are expected to have empty workflow state.
   * @param {Project} project Project object.
   * @param {card} card Card object to validate
   * @returns string containing all validation errors
   */
  public async validateWorkflowState(
    project: Project,
    card: Card,
  ): Promise<string> {
    const validationErrors: string[] = [];

    if (!card.metadata) {
      validationErrors.push(
        `Card '${card.key}' has no metadata. Card object needs to be instantiated with '{metadata: true}'`,
      );
    }

    const cardType = await project.cardType(card.metadata?.cardType);
    if (!cardType) {
      validationErrors.push(
        `Card '${card.key}' has invalid card type '${card.metadata?.cardType}'`,
      );
    }

    if (cardType) {
      if (!cardType.workflow) {
        validationErrors.push(
          `Card type '${card.metadata?.cardType}' does not have 'workflow'`,
        );
      }

      const workflow = await project.workflow(cardType?.workflow);
      if (workflow) {
        if (!Project.isTemplateCard(card)) {
          const states = workflow.states;
          const cardState = card.metadata?.workflowState;
          const found = states.find((item) => item.name === cardState);
          if (!found) {
            validationErrors.push(
              `Card '${card.key}' has invalid state '${cardState}'`,
            );
          }
        } else {
          const cardState = card.metadata?.workflowState;
          if (cardState) {
            validationErrors.push(
              `Template card ${card.key} must have empty "workflowState"`,
            );
          }
        }
      } else {
        validationErrors.push(
          `Workflow of '${cardType.workflow}' card type '${card.metadata?.cardType}' does not exist in the project`,
        );
      }
    }
    return validationErrors.join('\n');
  }

  /**
   * Possibly creates (if no instance exists) and returns an instance of Validate command.
   * @returns instance of Validate command.
   */
  public static getInstance(): Validate {
    if (!Validate.instance) {
      Validate.instance = new Validate();
    }
    return Validate.instance;
  }
}
