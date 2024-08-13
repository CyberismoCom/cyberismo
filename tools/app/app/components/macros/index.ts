import { MacroName } from '@cyberismocom/data-handler/utils/macros';
import CreateCards from './CreateCards';
import { ReactNode } from 'react';

export interface MacroContext {
  key: string; // The key of the current card
}

export const macros: Record<MacroName, (props: any) => React.ReactElement> = {
  createCards: CreateCards,
};
