// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import {
  McpServer,
  type RegisteredTool,
  type ToolCallback,
} from '@modelcontextprotocol/sdk/server/mcp.js';
import type {
  AnySchema,
  ZodRawShapeCompat,
} from '@modelcontextprotocol/sdk/server/zod-compat.js';
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

type InputSchema = undefined | ZodRawShapeCompat | AnySchema;

/**
 * An MCP server whose tools reject arguments they do not declare.
 *
 * The SDK turns a tool's input shape into a plain zod object, which drops
 * unknown keys: a misnamed optional argument (`parentCardKey` for
 * `parentKey`) would be ignored and the tool would do something else than
 * asked. Here every tool's input schema is made strict instead, so the call
 * fails with the unknown key named, and the listed JSON schema gets
 * `additionalProperties: false`.
 */
export class StrictMcpServer extends McpServer {
  override registerTool<
    OutputArgs extends ZodRawShapeCompat | AnySchema,
    InputArgs extends InputSchema = undefined,
  >(
    name: string,
    config: {
      title?: string;
      description?: string;
      inputSchema?: InputArgs;
      outputSchema?: OutputArgs;
      annotations?: ToolAnnotations;
      _meta?: Record<string, unknown>;
    },
    cb: ToolCallback<InputArgs>,
  ): RegisteredTool {
    return super.registerTool(
      name,
      {
        ...config,
        // Same arguments and parsed types; only unknown keys are refused.
        inputSchema: rejectUnknownKeys(config.inputSchema) as InputArgs,
      },
      cb,
    );
  }
}

/**
 * Makes the top level of a tool input schema strict. A raw shape or an
 * object becomes a strict object, a union gets strict options. Nested
 * objects are made strict where they are defined.
 */
function rejectUnknownKeys(schema: InputSchema): InputSchema {
  if (schema === undefined) {
    // No schema: the tool takes no arguments and the SDK ignores any given.
    return undefined;
  }
  if (schema instanceof z.ZodObject) {
    return schema.strict();
  }
  if (schema instanceof z.ZodUnion) {
    return z.union(
      schema.options.map((option) =>
        rejectUnknownKeys(option as AnySchema),
      ) as [z.ZodType, ...z.ZodType[]],
    );
  }
  if (!('_zod' in schema) && !('_def' in schema)) {
    return z.strictObject(schema as z.ZodRawShape);
  }
  return schema;
}
