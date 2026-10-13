/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2026

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

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
