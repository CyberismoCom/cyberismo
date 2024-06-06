// node
import { Dirent, readdirSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdir } from 'node:fs/promises';

// dependencies
import { Validator as JSONValidator, Schema } from 'jsonschema';
import { Validator as DirectoryValidator } from 'directory-schema-validator';

// data-handler
import { errorFunction } from './utils/log-utils.js';
import { readJsonFile, readJsonFileSync } from './utils/json.js';
import { requestStatus } from './interfaces/request-status-interfaces.js';
import { pathExists } from './utils/file-utils.js';
import { Project } from './containers/project.js';
import { card, fieldtype } from './interfaces/project-interfaces.js';

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

    constructor() {
        Validate.baseFolder = (pathExists(join(process.cwd(), '../schema', 'cardtree-directory-schema.json')))
            ? join(process.cwd(), '../schema')
            : join(baseDir, '../../schema');
        Validate.parentSchemaFile = join(Validate.baseFolder, 'cardtree-directory-schema.json');
        this.validator = new JSONValidator();
        this.directoryValidator = new DirectoryValidator();
        this.parentSchema = readJsonFileSync(Validate.parentSchemaFile);
        this.addChildSchemas();
    }

    // Helper to get length from types when needed.
    private length<T extends LengthProvider>(item: T): number {
        return item.length;
    }

    // Loads child schemas to validator.
    private addChildSchemas() {
        readdirSync(Validate.baseFolder, { withFileTypes: true })
            .filter(dirent => dirent.name !== Validate.parentSchemaFile)
            .forEach(file => {
                const schema = readJsonFileSync(this.fullPath(file));
                this.validator.addSchema(schema, schema.$id);
            });
    }

    // Return full path and filename.
    private fullPath(file: Dirent): string {
        return join(file.path, file.name);
    }

    // Handles reading and validating 'contentSchema' in a directory.
    private async readAndValidateContentFiles(path: string): Promise<requestStatus> {
        const response: requestStatus = { statusCode: 200 };
        try {
            const files = await readdir(path, { withFileTypes: true, recursive: true });
            // Filter out directories and non-JSON files. Include special '.schema' files.
            const fileNames = files
                .filter(dirent => dirent.isFile())
                .filter(dirent => dirent.name === Validate.schemaConfigurationFile ||
                    extname(dirent.name) === Validate.jsonFileExtension);

            let activeJsonSchema: Schema = {};
            for (const file of fileNames) {
                const fullFileNameWithPath = this.fullPath(file);
                if (file.name === Validate.schemaConfigurationFile) {
                    const jsonSchema = await readJsonFile(fullFileNameWithPath);
                    activeJsonSchema = this.validator.schemas[jsonSchema.id];
                    if (activeJsonSchema === undefined) {
                        throw new Error(`Unknown schema name ${jsonSchema.id}, aborting.`);
                    }
                } else {
                    // console.log(`FILE ${fullFileNameWithPath} ACTIVE SCHEMA : ${activeJsonSchema.$id}`);
                    const result = this.validator.validate(
                        await readJsonFile(fullFileNameWithPath), activeJsonSchema
                    );
                    for (const error of result.errors) {
                        const msg = `\nValidation error from '${fullFileNameWithPath}': '${error.path[0]}' ${error.message}.\n`;
                        if (response.message === undefined) {
                            response.message = msg;
                        } else {
                            response.message += msg;
                        }
                        response.statusCode = 400;
                    }
                }
            }
        } catch (error) {
            return { statusCode: 500, message: errorFunction(error) };
        }
        if (!response.message) {
            response.message = 'Project structure validated';
        }
        return response;
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
                instancePath = instancePath.replace(/\/directories/g, "");
                instancePath = instancePath.replace(/\/files/g, "");
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
                message = message.replace('must have required property', fileError ? 'must have file' : 'must have subdirectory');
                if (message === 'must NOT have additional properties') {
                    message = message.replace('must NOT have additional properties', 'non-allowed additional property');
                    message = message + `: ${params}`;
                }
            }
            parsedErrorMessage += `\nAt '${instancePath}' ${message}`;
        }
        return parsedErrorMessage;
    }

    // Validates that card's dataType can be used with JS types.
    private validType<T>(value: T, fieldType: fieldtype): boolean {
        const field = fieldType.dataType;
        const typeOfValue = typeof value;

        // Nulls are always accepted.
        if (typeOfValue === 'object' && value === null) {
            return true;
        }

        if (field === 'date' || field === 'datetime') {
            return !isNaN(Date.parse(<string>value));
        }
        if (field === 'list') {
            return Array.isArray(value) && this.validateListValues(<string[]>value);
        }
        if (field === 'boolean' || field === 'number') {
            return typeOfValue === field;
        }
        if (field === 'shorttext') {
            return typeOfValue === 'string' && this.length(<string>value) <= 80;
        }
        if (field === 'longtext') {
            return typeOfValue === 'string';
        }
        if (field === 'integer') {
            return (typeOfValue === 'number') && Number.isInteger(value);
        }
        if (field === 'person') {
            // Accept empty names
            return EmailValidator.validate(<string>value) || this.length(<string>value) === 0;
        }
        if (field === 'enum') {
            const found = fieldType.enumValues?.find(item => item.enumValue === value);
            return found ? true : false;
        }
        console.error(`Type ${field} is not supported`);
        return false;
    }

    // Validates that arrays have only string elements.
    private validateListValues(list: string[]): boolean {
        let valid = true;
        list.forEach(value => {
            if (typeof value !== 'string') {
                valid = false;
            }
        });
        return valid;
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
     * Validates that a given directory path (and its children) conform to a JSON schema.
     * @note Validates also content in the directory tree, if .schema file is found.
     * @param projectPath path to validate.
     * @returns request status
     *       statusCode 200 when JSON conforms to the schema
     *  <br> statusCode 400 when schema validation failed
     *  <br> statusCode 500 when an unknown error occurred
     */
    public async validate(projectPath: string): Promise<requestStatus> {
        let response: requestStatus = { statusCode: 200 };
        try {
            // First, validate that the directory content conforms to the schema.
            const valid = this.directoryValidator.validate(this.parentSchema, projectPath);
            if (!valid && this.directoryValidator.errors) {
                const errorMsg = this.parseValidatorMessage(this.directoryValidator.errors);
                if (errorMsg) {
                    response.message = errorMsg;
                }
                response.statusCode = 400;
                return response;
            } else {
                // Then, validate that each 'contentSchema' children as well.
                response = await this.readAndValidateContentFiles(projectPath);

                // Finally, validate that each card is correct
                const project = new Project(projectPath);
                const cards = await project.cards();
                const errorMsg: string[] = [];
                for (const card of cards) {
                    if (card.metadata) {
                        // validate card's workflow
                        const validWorkflow = await this.validateWorkflowState(project, card);
                        if (validWorkflow.statusCode != 200) {
                            errorMsg.push(validWorkflow.message || '');
                        }

                        // @todo: validate customfields

                        const validCustomFields = await this.validateCustomFields(project, card);
                        if (validCustomFields.statusCode != 200) {
                            errorMsg.push(validCustomFields.message || '');
                        }

                    }
                }
                if (errorMsg.length) {
                    return { statusCode: 400, message: errorMsg.join("\n") };
                }
            }
        } catch (error) {
            return { statusCode: 500, message: errorFunction(error) };
        }
        return response;
    }

    /**
     * Validates that 'object' conforms to JSON schema 'schemaId'.
     * @param content Object to validate.
     * @param schemaId Schema ID to identify a JSON schema.
     * @returns request status
     *       statusCode 200 when validation succeeded
     *  <br> statusCode 400 when schema validation failed
     */
    public async validateJson(content: object, schemaId: string): Promise<requestStatus> {
        const response: requestStatus = { statusCode: 200 };
        if (this.validator.schemas[schemaId] === undefined) {
            response.statusCode = 400;
            response.message += `Unknown schema ${schemaId}`;
        } else {
            const result = this.validator.validate(content, this.validator.schemas[schemaId]);
            for (const error of result.errors) {
                const msg = `Schema '${schemaId}' validation Error: ${error.message}\n`;
                response.statusCode = 400;
                if (response.message === undefined) {
                    response.message = msg;
                } else {
                    response.message += msg;
                }
            }
        }
        return response;
    }

    /**
     * Validate schema that matches schemaId from path.
     * @param {string} projectPath path to schema
     * @param {string} schemaId schema's id
     * @returns request status
     *       statusCode 200 when validation succeeded
     *  <br> statusCode 400 when schema validation failed, or schema is not known.
     *  <br> statusCode 500 when unknown error occurred.
     */
    public async validateSchema(projectPath: string, schemaId: string): Promise<requestStatus> {
        const response: requestStatus = { statusCode: 200 };
        const activeJsonSchema = this.validator.schemas[schemaId];
        if (activeJsonSchema === undefined) {
            response.statusCode = 400;
            response.message += `Unknown schema ${schemaId}`;
        } else {
            if (!pathExists(projectPath)) {
                response.statusCode = 400;
                response.message += `Path is not valid ${projectPath}`;
            } else {
                const result = this.validator.validate(await readJsonFile(projectPath), activeJsonSchema);
                for (const error of result.errors) {
                    const msg = `Schema '${schemaId}' validation Error: ${error.message}\n`;
                    response.statusCode = 400;
                    response.message += msg;
                }
            }
        }
        return response;
    }

    /**
     * Validates that card's custom fields are according to schema and have correct data in them.
     * @param project currently used Project
     * @param card specific card
     * @returns requestStatus 200 when validation succeeded
     *  <br> statusCode 400 when schema validation failed
     *  <br> statusCode 500 when schema has logical errors (e.g. missing cardtype)
     */
    public async validateCustomFields(project: Project, card: card): Promise<requestStatus> {
        let errorMsg = "";

        if (!card.metadata) {
            return {
                statusCode: 500,
                message: errorFunction(
                    `Card '${card.key}' has no metadata. Card object needs to be instantiated with '{metadata: true}'`)
            };
        }

        const cardType = await project.cardType(card.metadata?.cardtype);
        if (!cardType) {
            return {
                statusCode: 500,
                message: errorFunction(`Card '${card.key}' has invalid cardtype '${card.metadata?.cardtype}'`)
            };
        }

        if (cardType.customFields) {
            for (const field of cardType.customFields) {
                if (!card.metadata[field.name] === undefined) {
                    return {
                        statusCode: 400,
                        message: errorFunction(`Card '${card.key}' is missing custom field 'name' from ${field}`)};
                }
                const fieldType = await project.fieldType(field.name);
                if (fieldType && !this.validType(card.metadata[field.name], fieldType)) {
                    const typeOfValue = typeof card.metadata[field.name];
                    let fieldValue = card.metadata[field.name];
                    if (typeOfValue === 'string') {
                        fieldValue = card.metadata[field.name] ? `"${card.metadata[field.name]}"` : '""';
                    }
                    errorMsg += `In card ${card.key} field '${field.name}' is defined as '${fieldType.dataType}', but it is '${typeOfValue}' with value of ${fieldValue}\n`;
                    if (fieldType.dataType === 'enum') {
                        let listOfEnumValues = fieldType.enumValues?.map(item => item.enumValue);
                        errorMsg += `Possible enumerations are: ${listOfEnumValues?.join(', ')}\n`;
                    }
                }
            }
        }

        if (errorMsg.length > 0) {
            return { statusCode: 400, message: errorFunction(errorMsg) };
        }
        return { statusCode: 200 };
    }

    /**
     * Checks if card's current workflow state matches workflow that card's cardtype is using.
     * @param {Project} project Project object.
     * @param {card} card Card object to validate
     * @returns requestStatus 200 when validation succeeded
     *  <br> statusCode 400 when schema validation failed
     *  <br> statusCode 500 when schema has logical errors (e.g. missing cardtype)
     */
    public async validateWorkflowState(project: Project, card: card): Promise<requestStatus> {

        if (!card.metadata) {
            return {
                statusCode: 500,
                message: errorFunction(
                    `Card '${card.key}' has no metadata. Card object needs to be instantiated with '{metadata: true}'`)
            };
        }

        const cardType = await project.cardType(card.metadata?.cardtype);
        if (!cardType) {
            return {
                statusCode: 500,
                message: errorFunction(`Card '${card.key}' has invalid cardtype '${card.metadata?.cardtype}'`)
            };
        }

        if (!cardType.workflow) {
            return {
                statusCode: 500,
                message: errorFunction(`Cardtype '${cardType?.name}' does not have 'workflow'`)
            };
        }

        const workflow = await project.workflow(cardType?.workflow);
        if (workflow) {
            const states = workflow.states;
            const cardState = card.metadata?.workflowState;
            const found = states.find(item => item.name === cardState);
            if (!found) {
                return {
                    statusCode: 400,
                    message: errorFunction(`Card '${card.key}' has invalid state '${cardState}'`)
                };
            }
        } else {
            return {
                statusCode: 400,
                message: errorFunction(
                    `Workflow of '${cardType.workflow}' cardtype '${cardType?.name}' does not exist in the project`)
                };
        }
        return { statusCode: 200 };
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