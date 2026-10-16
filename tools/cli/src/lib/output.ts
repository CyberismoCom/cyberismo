// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { Workspace } from '@cyberismo/data-handler';

import { fail } from './errors.js';

// Notifies on stderr that a deprecated command spelling was used.
export function deprecationNote(oldName: string, newName: string) {
  console.error(
    `Warning: 'cyberismo ${oldName}' is deprecated. Use 'cyberismo ${newName}' instead.`,
  );
}

/** A command's outcome: status 200 succeeded, any other failed. */
export interface CommandResult {
  statusCode: number;
  message?: string;
  payload?: object;
  note?: string;
}

// Prints a command's outcome; a failure exits.
export function handleResponse(response: CommandResult) {
  if (response.statusCode === 200) {
    if (response.payload) {
      if (response.message) {
        console.log(response.message);
      }
      console.log(JSON.stringify(response.payload, null, 2));
    } else if (response.message) {
      console.log(response.message);
    } else {
      console.log('Done');
    }
    if (response.note) {
      console.log(`\n${response.note}`);
    }
  } else {
    fail(response.message);
  }
}

// Prints a command's message, or 'Done' when it has none.
export function printResult(message?: string) {
  console.log(message || 'Done');
}

// Prints a command's result as indented JSON.
export function printJson(result: unknown) {
  console.log(JSON.stringify(result, null, 2));
}

// Recommends 'clean' when the project holds dormant field values; never fails.
export async function cleanNote(
  ws: Workspace,
  cardType?: string,
): Promise<string | undefined> {
  const dormant = await ws.clean.dormantSummary(cardType);
  if (!dormant) {
    return undefined;
  }
  return (
    `This project has ${dormant.valueCount} dormant field value(s) on ${dormant.cardCount} card(s) — ` +
    `run 'cyberismo clean --dry-run' to list them, 'cyberismo clean' to remove them`
  );
}

// Prints a command's message, or 'Done', and the note below it.
export function printResultWithNote(note?: string) {
  printResult();
  if (note) {
    console.log(`\n${note}`);
  }
}
