import { Validator } from 'jsonschema';
import { DHValidationError, SchemaNotFound } from '../exceptions/index.js';
import { schemas } from './schemas.js';

/**
 * Validates a JSON object against a schema
 * @param object The object to validate
 * @param schemaId The id of the schema to validate against
 * @returns The object casted to the type T if it is valid
 * @throws DHValidationError if the object is not valid
 * @throws SchemaNotFound if the schema with the given id is not found
 */
export function validateJson<T>(object: unknown, schemaId: string): T {
  const validator = new Validator();

  const schema = schemas.find((s) => s.$id === schemaId);

  if (!schema) {
    throw new SchemaNotFound(`Schema with id ${schemaId} not found`);
  }
  const result = validator.validate(object, schema);
  if (!result.valid) {
    throw new DHValidationError('Validation failed', result.errors);
  }
  // we know that the object is valid, so we can safely cast it to T
  return object as T;
}
