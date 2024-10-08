/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/
import { Schema, Validator } from 'jsonschema';
import { DHValidationError, SchemaNotFound } from '../exceptions/index.js';
import { schemas } from './schemas.js';

/**
 * Validates a JSON object against a schema
 * @param object The object to validate
 * @param schemaId The id of the schema to validate against
 * @param validator An optional validator to use. If validator is not provided or does not contain any schemas, project schemas will be used
 * @returns The object casted to the type T if it is valid
 * @throws DHValidationError if the object is not valid
 * @throws SchemaNotFound if the schema with the given id is not found
 */
export function validateJson<T>(
  object: unknown,
  options: {
    schemaId?: string;
    schema?: Schema;
    validator?: Validator;
  },
): T {
  const { schemaId, schema } = options;
  let validator = options.validator;

  if (!schema && !schemaId) {
    throw new Error('Must either specify schema or schemaId');
  }

  if (!validator) {
    validator = new Validator();
    for (const schema of schemas) {
      validator.addSchema(schema, schema.$id);
    }
  }

  let jsonSchema: Schema | undefined;

  if (schema) {
    jsonSchema = schema;
  } else {
    jsonSchema = schemas.find((s) => s.$id === schemaId);
  }

  if (!jsonSchema) {
    throw new SchemaNotFound(`Schema with id ${schemaId} not found`);
  }
  const result = validator.validate(object, jsonSchema);
  if (!result.valid) {
    throw new DHValidationError('Validation failed', result.errors);
  }
  // we know that the object is valid, so we can safely cast it to T
  return object as T;
}
