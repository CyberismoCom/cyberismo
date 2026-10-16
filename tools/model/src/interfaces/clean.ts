// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

export type CleanReason = 'null-value' | 'undeclared' | 'calculated-locked';

export interface CleanFinding {
  cardKey: string;
  field: string;
  reason: CleanReason;
}

export interface CleanResult {
  findings: CleanFinding[];
  cardCount: number;
  // Cards whose card type could not be resolved; they were not inspected.
  skippedCards: string[];
  // Cards that were reported in 'findings' but could not be written.
  failedCards: string[];
  dryRun: boolean;
}

// Dormant field values a project holds: how many, on how many cards.
export interface DormantSummary {
  valueCount: number;
  cardCount: number;
}
