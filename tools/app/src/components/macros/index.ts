// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { MacroName } from '@cyberismo/model';
import CreateCards from './CreateCards';
import Mermaid from './Mermaid';
import Field from './Field';
import ScoreCard from './ScoreCard';
import type { ReactElement } from 'react';
import Vega from './Vega';

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

export type UIMacroName = Exclude<
  MacroName,
  'report' | 'graph' | 'include' | 'xref' | 'percentage' | 'vegaLite' | 'image'
>;

// We simply trust that the macro has been
// validated and the backend will not return an invalid macro
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const macros: Record<UIMacroName, (props: any) => ReactElement | null> =
  {
    createCards: CreateCards,
    field: Field,
    mermaid: Mermaid,
    scoreCard: ScoreCard,
    vega: Vega,
  };
