/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2025

  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.

  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ChangeSetInfo } from '@cyberismo/data-handler';
import { z } from 'zod';
import { toolResult, toolError } from '../lib/mcp-helpers.js';
import type { ProjectProvider } from '../lib/resolve-project.js';

const projectPrefixParam = z
  .string()
  .describe('Project prefix. Call list_projects to see available projects.');

const summary = (info: ChangeSetInfo) => ({ id: info.id, title: info.title });

type ToolResult = {
  content: { type: string; text?: string }[];
  isError?: boolean;
};

// Adds fields to a tool result's JSON text.
function withFields(result: ToolResult, fields: Record<string, unknown>) {
  const [first, ...rest] = result.content;
  if (first?.type === 'text' && first.text) {
    try {
      const data = JSON.parse(first.text) as Record<string, unknown>;
      const text = JSON.stringify({ ...data, ...fields }, null, 2);
      return { ...result, content: [{ ...first, text }, ...rest] };
    } catch {
      // Not JSON: leave the text as it is and add the fields after it
    }
  }
  const text = JSON.stringify(fields, null, 2);
  return { ...result, content: [...result.content, { type: 'text', text }] };
}

/**
 * Wraps the server so that a tool result about a project in which the
 * caller has an active changeSet names that changeSet: the call was served
 * from it, and any change went into it.
 */
export function withChangeSetNotes(
  server: McpServer,
  provider: ProjectProvider,
): Pick<McpServer, 'registerTool'> {
  const changeSets = provider.changeSets;
  if (!changeSets) {
    return server;
  }
  type Callback = (...args: unknown[]) => Promise<ToolResult>;
  const registerTool = (name: string, config: object, callback: Callback) =>
    server.registerTool(
      name,
      config as never,
      (async (...args: unknown[]) => {
        const result = await callback(...args);
        // Tools with an input schema get their arguments first
        const input =
          args.length > 1 ? (args[0] as Record<string, unknown>) : {};
        const prefix = input.projectPrefix;
        if (typeof prefix !== 'string' || result.isError) {
          return result;
        }
        const active = await changeSets.active(prefix).catch(() => undefined);
        return active
          ? withFields(result, { changeSet: summary(active) })
          : result;
      }) as never,
    );
  return { registerTool: registerTool as unknown as McpServer['registerTool'] };
}

/**
 * Registers the tools for the caller's changeSets, when the provider knows
 * them. There is deliberately no tool to merge, discard or review: merging
 * is the user's checkpoint.
 */
export function registerChangeSetTools(
  server: McpServer,
  provider: ProjectProvider,
): void {
  const changeSets = provider.changeSets;
  if (!changeSets) {
    return;
  }

  server.registerTool(
    'start_changeset',
    {
      description:
        "Start a changeset in a project and make it the user's active one: from then on, the user's changes and yours to that project go into the changeset instead of the project, until the user merges or discards it. Only start one when the user asks for it.",
      inputSchema: {
        projectPrefix: projectPrefixParam,
        title: z.string().min(1).max(200).describe('What the changeset is for'),
      },
    },
    async ({ projectPrefix, title }) => {
      try {
        const info = await changeSets.start(projectPrefix, title);
        return toolResult({ changeSet: summary(info) });
      } catch (error) {
        return toolError('starting changeset', error);
      }
    },
  );

  server.registerTool(
    'get_changeset',
    {
      description:
        "Show the user's active changeset in a project and what it changes so far, card by card. Use it to report what you changed. Without an active changeset, changes go straight to the project.",
      inputSchema: { projectPrefix: projectPrefixParam },
    },
    async ({ projectPrefix }) => {
      try {
        const active = await changeSets.active(projectPrefix);
        const changes = active
          ? await changeSets.changes(projectPrefix)
          : undefined;
        if (!active || !changes) {
          return toolResult({ changeSet: null });
        }
        return toolResult({
          changeSet: summary(active),
          cards: changes.cards.map((card) => ({
            key: card.key,
            kind: card.kind,
            title: card.title,
            fields: card.fields.map((field) => field.field),
            contentChanged: card.contentChanged,
            reviewed: card.reviewed,
          })),
          resources: changes.resources.map((file) => file.path),
        });
      } catch (error) {
        return toolError('reading changeset', error);
      }
    },
  );
}
