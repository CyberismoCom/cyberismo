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

// node
import { appendFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

// cyberismo
import { copyDir } from '../../src/utils/file-utils.js';
import { Cmd, Commands } from '../../src/command-handler.js';

/**
 * Copies the decision-records fixture into `<rootDir>/<name>`, appends the
 * given logic-program facts to its test calculation, and returns a fresh
 * Commands instance pointed at it. Per-scenario copies keep scenarios from
 * contaminating each other.
 *
 * Isolation depends on callers passing a unique `name` per scenario: each
 * copy gets its own directory and calculation file, but there is no
 * cross-instance file locking, only the in-memory write lock scoped to a
 * single project instance.
 */
export async function setupSideEffectProject(
  rootDir: string,
  name: string,
  facts: string,
) {
  const dir = join(rootDir, name);
  mkdirSync(dir, { recursive: true });
  await copyDir('test/test-data', dir);
  await appendFile(
    join(
      dir,
      'valid/decision-records/.cards/local/calculations/test/calculation.lp',
    ),
    `\n${facts}\n`,
  );
  return {
    commands: new Commands(),
    options: { projectPath: join(dir, 'valid/decision-records') },
  };
}

/** Returns a card's current workflow state via the show command. */
export async function cardState(
  commands: Commands,
  options: object,
  cardKey: string,
) {
  const result = await commands.command(Cmd.show, ['card', cardKey], options);
  const card = result.payload as { metadata?: { workflowState?: string } };
  return card.metadata?.workflowState;
}
