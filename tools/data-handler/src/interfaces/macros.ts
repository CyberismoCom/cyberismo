import { macroMetadata } from '../macros/common.js';

type Mode = 'static' | 'inject';

export interface MacroGenerationContext {
  projectPath: string;
  mode: Mode;
  cardKey: string;
}

export interface MacroMetadata {
  /**
   * The name of the macro. This is the name that will be used in the content
   */
  name: string;
  /**
   * The tag name of the macro. This is the name that will be used in the HTML. This is separated for clarity since tags cannot have uppercase letters
   */
  tagName: string;

  /**
   * The schema of the macro. This is used to validate the data passed to the macro
   */
  schema?: string;
}

export interface MacroTaskState {
  localId: number;
  promise: Promise<void>;
  placeholder: string;
  promiseResult: string | null;
}

export type MacroName = keyof typeof macroMetadata;
