/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2024
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { type Command } from 'commander';

import { type CommandOptions } from '@cyberismo/data-handler';
import type { CleanResult } from '@cyberismo/model';

import { CommandWithPath } from '../lib/args.js';
import { onProject } from '../lib/errors.js';
import { printResult } from '../lib/output.js';

// What 'clean' removed, or would remove in a dry run.
function cleanSummary(result: CleanResult, dryRun: boolean): string {
  const skipped = result.skippedCards.length
    ? `\nSkipped ${result.skippedCards.length} card(s) with unresolvable card types: ${result.skippedCards.join(', ')}`
    : '';
  if (result.findings.length === 0) {
    return `Nothing to clean${skipped}`;
  }

  const failed = result.failedCards.length
    ? `\nCould not update ${result.failedCards.length} card(s); their values were not removed: ${result.failedCards.join(', ')}`
    : '';
  const lines = result.findings.map(
    (finding) => `  ${finding.cardKey}: ${finding.field} (${finding.reason})`,
  );

  // The headline counts what actually changed, so a partial failure cannot
  // report a card as cleaned.
  const failedCards = new Set(result.failedCards);
  const removed = result.findings.filter(
    (finding) => !failedCards.has(finding.cardKey),
  );
  const removedCards = new Set(removed.map((finding) => finding.cardKey)).size;
  const verb = dryRun ? 'Would remove' : 'Removed';
  return `${lines.join('\n')}\n${verb} ${removed.length} field value(s) from ${removedCards} card(s)${skipped}${failed}`;
}

export function registerClean(program: Command) {
  // Clean command - removes dormant field values
  const cleanCmd = new CommandWithPath('clean')
    .description(
      'Remove dormant field values: values a card stores but that are not shown and not visible to logic programs (empty placeholders, fields the card type no longer declares, values on calculated fields)',
    )
    .option('--dry-run', 'Show what would be cleaned without cleaning');
  program.addCommand(cleanCmd);
  cleanCmd.action(async (options: CommandOptions<'clean'>) => {
    const dryRun = !!options.dryRun;
    const result = await onProject(
      Object.assign({}, options, program.opts()),
      (ws) => ws.clean.run(dryRun),
    );
    printResult(cleanSummary(result, dryRun));
  });
}
