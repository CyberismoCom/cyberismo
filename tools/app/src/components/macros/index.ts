/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { MacroName } from '@cyberismo/data-handler/interfaces/macros';
import CreateCards from './CreateCards';
import ScoreCard from './ScoreCard';
import { ReactElement } from 'react';

export interface MacroContext {
  /**
   * The key inside of which the macro is rendered
   */
  macroKey: string;
  /**
   * True if the macro is rendered in preview mode.
   */
  preview: boolean;
}

export type UIMacroName = Exclude<MacroName, 'report' | 'graph'>;

// We simply trust that the macro has been
// validated and the backend will not return an invalid macro
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const macros: Record<UIMacroName, (props: any) => ReactElement> = {
  createCards: CreateCards,
  scoreCard: ScoreCard,
};
