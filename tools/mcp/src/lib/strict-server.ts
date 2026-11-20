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
    InputArgs extends undefined | ZodRawShapeCompat | AnySchema = undefined,
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
    const input = config.inputSchema;
    const strictInput =
      input === undefined
        ? undefined // No arguments; the SDK ignores any given.
        : input instanceof z.core.$ZodType
          ? strict(input)
          : // A raw shape. This package uses only zod 4; the cast is needed
            // because the SDK's signature, which an override cannot narrow,
            // also admits zod 3 shapes.
            z.strictObject(input as z.core.$ZodShape);
    return super.registerTool(
      name,
      // The strict copy parses to the same type, but TypeScript cannot tie
      // a new schema back to the type parameter.
      { ...config, inputSchema: strictInput as InputArgs },
      cb,
    );
  }
}

/**
 * An object becomes a strict object and a union gets strict options. Nested
 * objects are made strict where they are defined.
 */
function strict(schema: z.core.$ZodType): z.core.$ZodType {
  if (schema instanceof z.ZodObject) {
    return schema.strict();
  }
  if (schema instanceof z.ZodUnion) {
    return z.union(schema.options.map(strict));
  }
  return schema;
}
