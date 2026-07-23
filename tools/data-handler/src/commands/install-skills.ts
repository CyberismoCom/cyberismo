/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026

  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { getStaticDirectoryPath } from '@cyberismo/assets';

import {
  copyDir,
  pathExists,
  resolveTilde,
  writeFileSafe,
} from '../utils/file-utils.js';
import { formatJson, readJsonFile } from '../utils/json.js';

import type { InstallSkillsCommandOptions } from '../interfaces/command-options.js';

const SUPPORTED_TARGETS = ['claude'] as const;
type InstallTarget = (typeof SUPPORTED_TARGETS)[number];

const DEFAULT_MCP_URL = 'http://localhost:3000/mcp';

// Markers delimiting the Cyberismo-managed block in CLAUDE.md, so the block can
// be replaced idempotently without touching the user's own content.
const CLAUDE_MD_BEGIN = '<!-- cyberismo:begin -->';
const CLAUDE_MD_END = '<!-- cyberismo:end -->';
const CLAUDE_MD_POINTER = [
  'This project uses Cyberismo dynamic skills. Before acting, call `list_skills`',
  'on the cyberismo MCP server and `get_skill` for any relevant skill it returns.',
  'See `.claude/skills/dynamic-skill-discovery`.',
].join('\n');

/**
 * Installs the static bootstrap skill and platform configuration that lets an AI
 * agent discover Cyberismo's dynamic skills via the MCP server. Writes into a
 * target directory (typically the repository root) — not a loaded project — and
 * is idempotent: safe to run repeatedly.
 */
export class InstallSkills {
  /**
   * @param targetPath Directory to install into.
   * @param options.target Target platform.
   * @param options.url MCP server URL to register (defaults to localhost:3000).
   * @returns paths (relative to targetPath) that were written.
   * @throws if the target platform is not supported.
   */
  public static async install(
    targetPath: string,
    options: InstallSkillsCommandOptions = {},
  ): Promise<string[]> {
    const target = (options.target ?? 'claude') as InstallTarget;
    if (!SUPPORTED_TARGETS.includes(target)) {
      throw new Error(
        `Unsupported target '${target}'. Supported targets: ${SUPPORTED_TARGETS.join(', ')}`,
      );
    }

    const root = resolveTilde(targetPath);
    await mkdir(root, { recursive: true });
    const url = options.url ?? DEFAULT_MCP_URL;
    const written: string[] = [];

    const skillSource = join(
      await getStaticDirectoryPath(),
      'agentSkills',
      'dynamic-skill-discovery',
    );
    const skillDest = join(
      root,
      '.claude',
      'skills',
      'dynamic-skill-discovery',
    );
    await copyDir(skillSource, skillDest);
    written.push('.claude/skills/dynamic-skill-discovery/SKILL.md');

    const mcpPath = join(root, '.mcp.json');
    const config = pathExists(mcpPath)
      ? ((await readJsonFile(mcpPath)) as McpConfig)
      : {};
    config.mcpServers = {
      ...config.mcpServers,
      cyberismo: { type: 'http', url },
    };
    await writeFileSafe(mcpPath, formatJson(config));
    written.push('.mcp.json');

    const claudeMdPath = join(root, 'CLAUDE.md');
    const existing = pathExists(claudeMdPath)
      ? await readFile(claudeMdPath, 'utf-8')
      : '';
    await writeFileSafe(claudeMdPath, upsertMarkerBlock(existing));
    written.push('CLAUDE.md');

    return written;
  }
}

interface McpConfig {
  mcpServers?: Record<string, unknown>;
  [key: string]: unknown;
}

// Inserts or replaces the Cyberismo-managed block in CLAUDE.md content.
function upsertMarkerBlock(existing: string): string {
  const block = `${CLAUDE_MD_BEGIN}\n${CLAUDE_MD_POINTER}\n${CLAUDE_MD_END}`;
  const begin = existing.indexOf(CLAUDE_MD_BEGIN);
  const end = existing.indexOf(CLAUDE_MD_END);
  if (begin !== -1 && end !== -1 && end > begin) {
    const before = existing.slice(0, begin);
    const after = existing.slice(end + CLAUDE_MD_END.length);
    return `${(before + block + after).trimEnd()}\n`;
  }
  if (existing.trim() === '') {
    return `${block}\n`;
  }
  return `${existing.trimEnd()}\n\n${block}\n`;
}
