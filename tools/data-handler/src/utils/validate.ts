/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/
import { Ajv, type SchemaObject, type ValidateFunction } from 'ajv';
import addFormatsModule from 'ajv-formats';
import { DHValidationError, SchemaNotFound } from '../exceptions/index.js';
import { schemas } from '@cyberismo/assets';

// ajv-formats is CommonJS: Node hands over the callable, NodeNext types the
// default import as the module namespace.
const addFormats =
  addFormatsModule as unknown as typeof addFormatsModule.default;

let validator: Ajv | null = null;

/**
 * The shared validator, with every asset schema registered under its own
 * `$id` so that cross-schema `$ref`s resolve.
 *
 * Non-strict: `parameterSchema.json` files and macro schemas are authored by
 * users, and unknown keywords there must be ignored rather than rejected.
 */
export function schemaValidator(): Ajv {
  if (!validator) {
    // The code optimizer doubles compile time on the large generated schemas
    // without making validation any faster.
    validator = new Ajv({
      allErrors: true,
      strict: false,
      code: { optimize: false },
    });
    addFormats(validator);
    // Not a standard format; declared so that it is not reported as unknown.
    validator.addFormat('color-hex', () => true);
    for (const schema of schemas) {
      validator.addSchema(schema as SchemaObject, schema.$id);
    }
  }
  return validator;
}

/** Schema ids are stored without the leading slash that callers may pass. */
export function normalizeSchemaId(schemaId: string): string {
  return schemaId.startsWith('/') ? schemaId.slice(1) : schemaId;
}

const compiledInline = new Map<string, ValidateFunction>();

/**
 * Compiles a resource's own parameter schema, which is local to that resource
 * and shares its `$id` with every other resource made from the same template.
 * Such a schema is therefore compiled anonymously and cached by content.
 */
function compileInline(schema: SchemaObject): ValidateFunction {
  const withoutId = { ...schema };
  delete withoutId.$id;
  const key = JSON.stringify(withoutId);
  let validate = compiledInline.get(key);
  if (!validate) {
    validate = schemaValidator().compile(withoutId);
    compiledInline.set(key, validate);
  }
  return validate;
}

/**
 * Validates a JSON object against a schema
 * @param object The object to validate
 * @param schemaId The id of the schema to validate against
 * @param schema The schema to validate against. If schema is not provided, the schema with the given id will be used
 * @returns The object casted to the type T if it is valid
 * @throws DHValidationError if the object is not valid
 * @throws SchemaNotFound if the schema with the given id is not found
 */
export function validateJson<T>(
  object: unknown,
  options: {
    schemaId?: string;
    schema?: SchemaObject;
  },
): T {
  const { schemaId, schema } = options;

  if (!schema && !schemaId) {
    throw new Error('Must either specify schema or schemaId');
  }

  const validate = schema
    ? compileInline(schema)
    : schemaValidator().getSchema(normalizeSchemaId(schemaId!));

  if (!validate) {
    throw new SchemaNotFound(`Schema with id ${schemaId} not found`);
  }
  if (!validate(object)) {
    throw new DHValidationError('Validation failed', validate.errors ?? []);
  }
  // we know that the object is valid, so we can safely cast it to T
  return object as T;
}
