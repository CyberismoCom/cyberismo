/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { registerEmptyMacros, validateMacroContent } from '../index.js';

import { MacroGenerationContext } from '../common.js';
import macroMetadata from './metadata.js';
import { Project } from '../../containers/project.js';
import { Calculate } from '../../calculate.js';
import Handlebars from 'handlebars';
import BaseMacro from '../BaseMacro.js';

export interface ReportOptions extends Record<string, string> {
  name: string;
}

class ReportMacro extends BaseMacro {
  constructor() {
    super(macroMetadata);
  }
  async handleStatic() {
    // Buttons aren't supported in static mode
    return '';
  }

  handleInject = async (context: MacroGenerationContext, data: string) => {
    if (!data || typeof data !== 'string') {
      throw new Error('report macro requires a JSON object as data');
    }
    const options = validateMacroContent<ReportOptions>(this.metadata, data);
    const project = new Project(context.projectPath);
    const report = await project.report(options.name);

    if (!report) throw new Error(`Report ${options} does not exist`);

    const handlebars = Handlebars.create();

    const template = handlebars.compile(report.queryTemplate, {
      strict: true,
    });

    const calc = new Calculate();

    const res = await calc.run(context.projectPath, {
      query: template({
        cardKey: context.cardKey,
        ...options,
      }),
    });
    registerEmptyMacros(handlebars);
    return handlebars.compile(report.contentTemplate)(res);
  };
}

export default ReportMacro;
