// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { type Command } from 'commander';
import type { CleanResult } from '@cyberismo/model';

import { CommandWithPath } from '../lib/args.js';
import { onProject } from '../lib/errors.js';
import { printResult } from '../lib/output.js';
import type { CleanCommandOptions } from '../options.js';

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
  cleanCmd.action(async (options: CleanCommandOptions) => {
    const dryRun = !!options.dryRun;
    const result = await onProject(
      Object.assign({}, options, program.opts()),
      (ws) => ws.clean.run(dryRun),
    );
    printResult(cleanSummary(result, dryRun));
  });
}
