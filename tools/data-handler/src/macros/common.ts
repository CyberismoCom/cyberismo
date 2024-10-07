/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

// important that this file imports only the metadata
import createCards from './createCards/metadata.js';
import report from './report/metadata.js';

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
  /**
   * The function to handle the macro in static mode(when adoc is being generated)
   */
}

export const macroMetadata = {
  createCards,
  report,
};

export type MacroName = keyof typeof macroMetadata;
