/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026

  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.

  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { z } from 'zod';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  type GetPromptResult,
  type ListPromptsResult,
} from '@modelcontextprotocol/sdk/types.js';

import type { ProjectProvider } from '../lib/resolve-project.js';

// Prompt arguments are untyped on the low-level handler; validate them.
const promptArguments = z.object({ cardKey: z.string().optional() });

// A minimal single-message prompt result (used for both rendered skills and the
// not-enabled / needs-card explanations — never an error, per the spec).
function textResult(text: string, description?: string): GetPromptResult {
  return {
    description,
    messages: [{ role: 'user', content: { type: 'text', text } }],
  };
}

/**
 * Exposes each currently-enabled skill as an MCP prompt. Uses the low-level
 * request handlers (not the static `registerPrompt`) so the prompt list is
 * recomputed from project state on every `prompts/list`, mirroring the tools.
 */
export function registerPrompts(
  server: McpServer,
  provider: ProjectProvider,
): void {
  server.server.registerCapabilities({ prompts: {} });

  server.server.setRequestHandler(
    ListPromptsRequestSchema,
    async (): Promise<ListPromptsResult> => {
      const perProject = await Promise.all(
        provider.list().map(({ prefix }) => {
          const commands = provider.get(prefix);
          return commands ? commands.showCmd.listSkills() : [];
        }),
      );
      const prompts: ListPromptsResult['prompts'] = perProject.flatMap(
        (skills) =>
          skills.map((skill) => ({
            name: skill.name,
            title: skill.displayName,
            description: skill.description,
            arguments:
              skill.scope === 'card'
                ? [
                    {
                      name: 'cardKey',
                      description: 'Card key to scope this skill to.',
                      required: false,
                    },
                  ]
                : undefined,
          })),
      );
      return { prompts };
    },
  );

  server.server.setRequestHandler(
    GetPromptRequestSchema,
    async (request): Promise<GetPromptResult> => {
      const { name } = request.params;
      const { cardKey } = promptArguments.parse(request.params.arguments ?? {});

      // A skill may be owned by any registered project (including one it was
      // imported into as a module, whose prefix differs from the project's), so
      // resolve by asking each project rather than parsing the name's prefix.
      let anyDisabled = false;
      for (const { prefix } of provider.list()) {
        const commands = provider.get(prefix);
        if (!commands) {
          continue;
        }
        const result = await commands.showCmd.getSkill(name, { cardKey });
        if (result.status === 'ok') {
          const { skill } = result;
          const relatedTools = skill.relatedTools.length
            ? skill.relatedTools.map((tool) => `\`${tool}\``).join(', ')
            : '—';
          const header = [
            `# ${skill.displayName}`,
            '',
            `- **name:** \`${skill.name}\``,
            `- **category:** ${skill.category ?? '—'}`,
            `- **relatedTools:** ${relatedTools}`,
            '',
          ].join('\n');
          return textResult(
            `${header}\n${skill.instructions}`,
            skill.description,
          );
        }
        if (result.status === 'needs-card') {
          return textResult(
            `Skill '${name}' is enabled for specific cards. Provide a 'cardKey' argument to render it.`,
          );
        }
        if (result.status === 'card-not-found') {
          return textResult(
            `Card '${cardKey}' does not exist in project '${prefix}'.`,
          );
        }
        if (result.status === 'not-enabled') {
          anyDisabled = true;
        }
        // 'not-found' — this project does not own the skill; keep looking.
      }

      return textResult(
        anyDisabled
          ? `Skill '${name}' is not currently enabled. Use prompts/list to see the enabled skills.`
          : `Skill '${name}' is not a known skill. Use prompts/list to see the available skills.`,
      );
    },
  );
}
