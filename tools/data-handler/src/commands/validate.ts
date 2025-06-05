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
import { type Dirent } from 'node:fs';
import { basename, dirname, extname, join, parse, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdir } from 'node:fs/promises';

// dependencies
import { Validator as JSONValidator, type Schema } from 'jsonschema';
import { Validator as DirectoryValidator } from 'directory-schema-validator';
import { parentSchema, schemas } from '@cyberismo/assets';

// data-handler
import type {
  Card,
  DotSchemaContent,
  ProjectSettings,
  ResourceTypes,
} from '../interfaces/project-interfaces.js';
import type {
  CardType,
  CustomField,
  FieldType,
  ReportMetadata,
  ResourceContent,
  Workflow,
} from '../interfaces/resource-interfaces.js';
import { errorFunction } from '../utils/log-utils.js';
import { isTemplateCard } from '../utils/card-utils.js';
import { pathExists } from '../utils/file-utils.js';
import { Project } from '../containers/project.js';
import { readJsonFile } from '../utils/json.js';
import { resourceName } from '../utils/resource-utils.js';

const invalidNames = new RegExp(
  '[<>:"/\\|?*\x00-\x1F]|^(?:aux|con|clock$|nul|prn|com[1-9]|lpt[1-9])$', // eslint-disable-line no-control-regex
);

const SHORT_TEXT_MAX_LENGTH = 80;

import * as EmailValidator from 'email-validator';
import { evaluateMacros } from '../macros/index.js';
import { Calculate } from './calculate.js';
const baseDir = dirname(fileURLToPath(import.meta.url));
const subFoldersToValidate = ['.cards', 'cardRoot'];

export interface LengthProvider {
  length: number;
}

/**
 * Validates content.
 */
export class Validate {
  private static instance: Validate;

  validator: JSONValidator;
  directoryValidator: DirectoryValidator;

  private parentSchema: Schema;

  private validatedCardTypes: Map<string, CardType>;
  private validatedWorkflows: Map<string, Workflow>;
  private validatedFieldTypes: Map<string, FieldType>;

  static baseFolder: string;
  static jsonFileExtension = '.json';
  static parentSchemaFile: string;
  static schemaConfigurationFile = '.schema';
  static projectConfigurationFile = 'cardsConfig.json';
  static cardMetadataFile = 'index.json';
  static dotSchemaSchemaId = '/dotSchema';
  static parameterSchemaFile = 'parameterSchema.json';

  constructor() {
    Validate.baseFolder = pathExists(
      join(process.cwd(), '../../schema', 'cardTreeDirectorySchema.json'),
    )
      ? join(process.cwd(), '../../schema')
      : join(baseDir, '../../../schema');
    Validate.parentSchemaFile = join(
      Validate.baseFolder,
      'cardTreeDirectorySchema.json',
    );
    this.validator = new JSONValidator();
    this.directoryValidator = new DirectoryValidator();
    this.parentSchema = parentSchema;
    this.addChildSchemas();
    this.validatedFieldTypes = new Map();
    this.validatedWorkflows = new Map();
    this.validatedCardTypes = new Map();
  }

  // Helper to get length from types when needed.
  private length<T extends LengthProvider>(item: T): number {
    return item.length;
  }

  // Loads child schemas to validator.
  private addChildSchemas() {
    schemas.forEach((schema) => {
      this.validator.addSchema(schema as Schema, schema.$id);
    });
  }

  // Validates that 'name' in resources matches filename, location and project prefix.
  private checkResourceName(
    file: Dirent,
    content:
      | ResourceContent
      | CustomField
      | DotSchemaContent
      | ProjectSettings
      | ReportMetadata,
    projectPrefixes: string[],
  ): string[] {
    const errors: string[] = [];
    const fullFileNameWithPath = this.fullPath(file);
    // Exclude cardsConfig.json, .schemas and resource specific JSON files.
    if (
      file.name !== Validate.projectConfigurationFile &&
      file.name !== Validate.cardMetadataFile &&
      file.name !== Validate.dotSchemaSchemaId &&
      file.name !== Validate.parameterSchemaFile
    ) {
      const namedContent = content as ResourceContent | ReportMetadata;
      if (!namedContent.name) {
        errors.push(
          `File '${file.name}' does not contain 'name' property. Cannot validate resource's 'name'.`,
        );
        return errors;
      }
      const { identifier, prefix, type } = resourceName(namedContent.name);
      const filenameWithoutExtension = parse(file.name).name;

      if (!projectPrefixes.includes(prefix)) {
        errors.push(
          `Wrong prefix in resource '${namedContent.name}'. Project prefixes are '[${projectPrefixes.join(', ')}]'`,
        );
      }
      if (identifier !== filenameWithoutExtension) {
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

  // Return full path and filename.
  private fullPath(file: Dirent): string {
    return join(file.parentPath, file.name);
  }

  // Puts resource to a local cache if found and returns the resource.
  // If value is already cached, returns from cache.
  private async getAndCacheResource<Type>(
    project: Project,
    cachedValues: Map<string, Type>,
    valueName: string,
  ): Promise<Type | undefined> {
    return (
      cachedValues.get(valueName) ||
      project.resource<Type>(valueName).then((resource) => {
        if (!resource) {
          return undefined;
        }
        cachedValues.set(valueName, resource);
        return resource;
      })
    );
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

  // Handles reading and validating 'contentSchema' in a directory.
  private async readAndValidateContentFiles(
    project: Project,
    path: string,
  ): Promise<string[]> {
    const message: string[] = [];
    try {
      const prefixes = await project.projectPrefixes();
      const files = await readdir(path, {
        withFileTypes: true,
      });

      const foldersToValidate = files.filter(
        (dirent) =>
          dirent.isDirectory() && subFoldersToValidate.includes(dirent.name),
      );

      // Validate subfolders parallel.
      const promises: Promise<string[]>[] = [];
      foldersToValidate.forEach((folder) => {
        promises.push(this.validateFolder(prefixes, folder));
      });
      const result = await Promise.all(promises);
      message.push(...result.flat(1));
    } catch (error) {
      throw new Error(errorFunction(error));
    }
    return message;
  }

  // Removes same items from an array.
  private removeDuplicateEntries(
    value: string,
    index: number,
    array: string[],
  ) {
    return array.indexOf(value) === index;
  }

  // Validate one subfolder.
  private async validateFolder(prefixes: string[], path: Dirent) {
    const messages: string[] = [];
    const files = await readdir(this.fullPath(path), {
      withFileTypes: true,
      recursive: true,
    });
    const schemaFiles = files.filter(
      (dirent) =>
        dirent.isFile() && dirent.name === Validate.schemaConfigurationFile,
    );

    messages.push(...(await this.validateSchemaFiles(schemaFiles)));

    // no point in validating contents if .schema files are not valid
    if (messages.length !== 0) {
      return messages;
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

    // Fetches nearest parent's .schema file.
    function schemaConfigFile(
      path: string,
      schemaConfigs: Record<string, DotSchemaContent>,
    ) {
      let schemas = schemaConfigs[path];
      let parentPath = path;
      while (!schemas) {
        parentPath = resolve(parentPath, '..');
        if (dirname(parentPath) === parentPath) {
          break;
        }
        schemas = schemaConfigs[parentPath];
      }
      return schemas;
    }

    // Go through every file
    for (const file of files.filter(
      (dirent) =>
        dirent.isFile() &&
        dirent.name !== Validate.schemaConfigurationFile &&
        extname(dirent.name) === Validate.jsonFileExtension,
    )) {
      const fullPath = this.fullPath(file);
      const content = await readJsonFile(fullPath);
      const nameErrors = this.checkResourceName(file, content, prefixes);

      if (nameErrors) {
        messages.push(...nameErrors);
      }
      const schemas = schemaConfigFile(file.parentPath, schemaConfigs);
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

      if (!fileSchema.id.startsWith('/')) {
        fileSchema.id = '/' + fileSchema.id;
      }

      const schema = this.validator.schemas[fileSchema.id];
      if (!schema) {
        throw new Error(`Unknown schema name '${fileSchema.id}', aborting.`);
      }
      const result = this.validator.validate(content, schema);
      for (const error of result.errors) {
        const msg = `Validation error from '${fullPath}': ${error.property} ${error.message}.`;
        messages.push(msg);
      }
    }
    return messages;
  }

  // Handles validating .schema files
  private async validateSchemaFiles(files: Dirent[]) {
    const schema = this.validator.schemas[Validate.dotSchemaSchemaId];

    if (!schema) {
      throw new Error(`'${Validate.dotSchemaSchemaId}' schema not found`);
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

  // Validate array of custom field names
  private async validateArrayOfFields(
    project: Project,
    cardType: CardType,
    fieldArray: string[],
    nameOfArray: string,
  ) {
    const errors: string[] = [];
    if (cardType && fieldArray) {
      const validationPromises = fieldArray.map(async (field) => {
        const fieldType = await this.getAndCacheResource(
          project,
          this.validatedFieldTypes,
          field,
        );
        if (!fieldType) {
          return `Card type '${cardType.name}' has invalid reference to unknown ${nameOfArray} '${field}'`;
        }
        return null;
      });

      const results = await Promise.all(validationPromises);
      errors.push(
        ...results.filter((result): result is string => result !== null),
      );
    }
    return errors;
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

  // Validates that card's dataType can be used with JS types.
  private validType<T>(value: T, fieldType: FieldType): boolean {
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
      return (
        typeOfValue === 'string' &&
        this.length(<string>value) <= SHORT_TEXT_MAX_LENGTH
      );
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

  /**
   * Validates that new identifier of a resource is according to naming convention.
   * @param identifier: resource identifier
   * returns true if identifier is valid, and false otherwise.
   */
  public static isValidIdentifierName(identifier: string): boolean {
    const validIdentifier = new RegExp('^[A-Za-z0-9 ._-]+$');
    const contentValidated = validIdentifier.test(identifier);
    const lengthValidated = identifier.length > 0 && identifier.length < 256;
    const notInvalidIdentifier = !invalidNames.test(identifier);
    return contentValidated && lengthValidated && notInvalidIdentifier;
  }

  /**
   * Validates that 'name' can be used as a project name.
   * @param name project name
   * @returns true if name is valid, and false otherwise.
   * @note that on Windows, if path + filename is longer than 256 characters, some file operations
   *       are not possible. Thus, setting the maximum length of project name to 64 characters.
   *       The 192 characters usually should be enough for the path.
   */
  public static isValidProjectName(name: string): boolean {
    const validName = new RegExp('^[A-Za-z ._-]+$');
    const contentValidated = validName.test(name);
    const lengthValidated = name.length > 0 && name.length < 64;
    const notInvalidName = !invalidNames.test(name);
    return contentValidated && lengthValidated && notInvalidName;
  }

  /**
   * Validates that 'name' can be used as label name.
   * Labels are less restricted than other names, as they are never file names.
   * @param name label name
   * @returns true if name is valid, and false otherwise.
   */
  public static isValidLabelName(name: string): boolean {
    const validName = new RegExp('^[-a-zA-Z0-9._-]+(?: [a-zA-Z0-9._-]+)*$');
    const contentValidated = validName.test(name);
    const lengthValidated = name.length > 0 && name.length < 256;
    return contentValidated && lengthValidated;
  }

  /**
   * Validates that a given directory path (and its children) conform to a JSON schema.
   * @note Validates also content in the directory tree, if .schema file is found.
   * @param projectPath path to validate.
   * @returns string containing all validation errors
   */
  public async validate(projectPath: string): Promise<string> {
    let validationErrors = '';
    this.validatedFieldTypes.clear();
    this.validatedWorkflows.clear();
    this.validatedCardTypes.clear();

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
        const calculate = new Calculate(project);

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
        cards.push(...(await project.allTemplateCards()));

        for (const card of cards) {
          if (card.metadata) {
            // validate card's workflow
            if (!isTemplateCard(card)) {
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

          const validLabels = await this.validateCardLabels(card);
          if (validLabels.length > 0) {
            errorMsg.push(validLabels);
          }

          // Validate macros in content
          if (card.content) {
            await evaluateMacros(
              card.content,
              {
                mode: 'validate',
                projectPath,
                cardKey: card.key,
              },
              calculate,
            );
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
   * Validates folder name.
   * @todo: This should check that the path is resolvable and can be used as a folder name in various operating systems.
   * @param path path to a folder
   * @returns true, if the path is valid and can be used; false otherwise.
   */
  public static validateFolder(path: string): boolean {
    if (path === '' || path === '.' || path === '..') {
      return false;
    }
    return !invalidNames.test(basename(path));
  }

  /**
   * Validates that 'object' conforms to JSON schema 'schemaId'.
   * @param content Object to validate.
   * @param schemaId Schema ID to identify a JSON schema.
   * @returns string containing all validation errors
   */
  public validateJson(content: object, schemaId: string): string {
    const validationErrors: string[] = [];
    if (!schemaId.startsWith('/')) {
      schemaId = '/' + schemaId;
    }
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
   * Validate that resource names and identifiers are valid.
   * @param resourceType Type of resource
   * @param name Name of resource
   * @param prefixes currently used project prefixes
   * @returns resource name as valid resource name; throws in error cases.
   */
  public async validResourceName(
    resourceType: ResourceTypes,
    name: string,
    prefixes: string[],
  ): Promise<string> {
    const resource = resourceName(name);
    resource.type = resource.type ? resource.type : resourceType;
    // a bit shaky way to ensure that prefix is set; first of the project prefixes should be the actual project prefix.
    if (resource.prefix === '') {
      resource.prefix = prefixes.length > 0 ? prefixes.at(0) || '' : '';
      if (resource.prefix === '') {
        throw new Error(`Project prefix cannot be empty string`);
      }
    }
    if (!prefixes.includes(resource.prefix)) {
      throw new Error(
        `Resource name can only refer to project that it is part of. Prefix '${resource.prefix}' is not included in '[${prefixes.join(',')}]'`,
      );
    }
    if (resourceType !== resource.type) {
      throw new Error(
        `Resource name must match the resource type. Type '${resource.type}' does not match '${resourceType}'`,
      );
    }
    if (!Validate.isValidIdentifierName(resource.identifier)) {
      throw new Error(
        `Resource identifier must follow naming rules. Identifier '${resource.identifier}' is invalid`,
      );
    }
    return `${resource.prefix}/${resourceType}/${resource.identifier}`;
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
   * @param projectPath path to schema
   * @param schemaId schema's id
   * @returns string containing all validation errors
   * @todo - unused; remove?
   */
  public async validateSchema(
    projectPath: string,
    schemaId: string,
  ): Promise<string> {
    const validationErrors: string[] = [];
    if (!schemaId.startsWith('/')) {
      schemaId = '/' + schemaId;
    }
    const activeJsonSchema = this.validator.schemas[schemaId];
    if (activeJsonSchema === undefined) {
      throw new Error(`Unknown schema '${schemaId}'`);
    } else {
      let contentFile = '';
      try {
        contentFile = await readJsonFile(projectPath);
      } catch {
        throw new Error(`Path is not valid ${projectPath}`);
      }

      const result = this.validator.validate(contentFile, activeJsonSchema);
      for (const error of result.errors) {
        const msg = `Schema '${schemaId}' validation Error: ${error.message}\n`;
        validationErrors.push(msg);
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

    const cardType = await this.getAndCacheResource(
      project,
      this.validatedCardTypes,
      card.metadata?.cardType,
    );

    if (!cardType) {
      validationErrors.push(
        `Card '${card.key}' has invalid card type '${card.metadata?.cardType}'`,
      );
      return validationErrors.join('\n');
    }

    // Check that arrays of field types refer to existing fields.
    let fieldErrors = await this.validateArrayOfFields(
      project,
      cardType,
      cardType.optionallyVisibleFields,
      'optionally visible fields',
    );
    validationErrors.push(...fieldErrors);
    fieldErrors = await this.validateArrayOfFields(
      project,
      cardType,
      cardType.alwaysVisibleFields,
      'always visible fields',
    );
    validationErrors.push(...fieldErrors);

    for (const field of cardType.customFields) {
      const found = await project.resourceExists('fieldTypes', field.name);
      if (!found) {
        validationErrors.push(
          `Custom field '${field.name}' from card type '${cardType.name}' not found from project`,
        );
      }
      if (field.isCalculated) {
        if (card.metadata[field.name] !== undefined) {
          validationErrors.push(
            `Card '${card.key}' not allowed to have a value in a calculated field '${field.name}'`,
          );
        }
        continue;
      } else {
        if (card.metadata[field.name] === undefined) {
          validationErrors.push(
            `Card '${card.key}' is missing custom field '${field.name}'`,
          );
          continue;
        }
      }

      const fieldType = await this.getAndCacheResource(
        project,
        this.validatedFieldTypes,
        field.name,
      );

      if (!fieldType) {
        validationErrors.push(
          `In card '${card.key}' field '${field.name}' is missing from project\n`,
        );
        continue;
      }

      if (!this.validType(card.metadata[field.name], fieldType)) {
        const typeOfValue = typeof card.metadata[field.name];
        let fieldValue = card.metadata[field.name];
        if (typeOfValue === 'string') {
          fieldValue = card.metadata[field.name]
            ? `"${card.metadata[field.name]}"`
            : '""';
        }
        if (fieldType.dataType === 'enum') {
          const listOfEnumValues = fieldType.enumValues?.map(
            (item) => item.enumValue,
          );
          validationErrors.push(
            `In card '${card.key}' field '${field.name}' is defined as '${fieldType.dataType}', possible enumerations are: ${listOfEnumValues?.join(', ')}\n`,
          );
          continue;
        }
        if (fieldType.dataType === 'person') {
          validationErrors.push(
            `In card '${card.key}' field '${field.name}' value '${card.metadata[field.name]}' cannot be used as '${fieldType.dataType}'. Not a valid email address.'`,
          );
          continue;
        }
        validationErrors.push(
          `In card '${card.key}' field '${field.name}' is defined as '${fieldType.dataType}', but it is '${typeOfValue}' with value of ${fieldValue}\n`,
        );
      }
    }

    return validationErrors.join('\n');
  }

  /**
   * Validates the labels of a card
   * @param card card to validate. Card must have metadata.
   */
  public async validateCardLabels(card: Card): Promise<string> {
    const validationErrors: string[] = [];
    if (!card.metadata) {
      validationErrors.push(
        `Card '${card.key}' has no metadata. Card object needs to be instantiated with '{metadata: true}'`,
      );
    }
    // labels are not mandatory
    if (card.metadata?.labels) {
      if (!Array.isArray(card.metadata?.labels)) {
        validationErrors.push(
          `In card '${card.key}' expected labels to be an array of strings, but instead got ${card.metadata.labels}`,
        );
      } else {
        for (const label of card.metadata.labels) {
          // labels follow same name guidance as resource names
          if (!Validate.isValidLabelName(label)) {
            validationErrors.push(
              `In card '${card.key}' label '${label}' does not follow naming rules`,
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
   * @param project Project object.
   * @param card Card object to validate
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

    // Use caches for cardTypes and workflows, to avoid re-reading the same JSON files multiple times.
    const cardType = await this.getAndCacheResource(
      project,
      this.validatedCardTypes,
      card.metadata?.cardType || '',
    );
    if (!cardType) {
      validationErrors.push(
        `Card '${card.key}' has invalid card type '${card.metadata?.cardType}'`,
      );
      return validationErrors.join('\n');
    }
    if (!cardType.workflow) {
      validationErrors.push(
        `Card type '${card.metadata?.cardType}' does not have 'workflow'`,
      );
      return validationErrors.join('\n');
    }

    const workflow = await this.getAndCacheResource(
      project,
      this.validatedWorkflows,
      cardType.workflow,
    );

    if (!workflow) {
      validationErrors.push(
        `Workflow of '${cardType.workflow}' card type '${card.metadata?.cardType}' does not exist in the project`,
      );
      return validationErrors.join('\n');
    }

    const cardState = card.metadata?.workflowState;
    if (!isTemplateCard(card)) {
      const found = workflow.states.find((item) => item.name === cardState);
      if (!found) {
        validationErrors.push(
          `Card '${card.key}' has invalid state '${cardState}'`,
        );
      }
    } else {
      if (cardState) {
        validationErrors.push(
          `Template card ${card.key} must have empty "workflowState"`,
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
