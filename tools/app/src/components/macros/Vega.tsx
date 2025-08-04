/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2025

  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { Vega as VegaComponent } from 'react-vega';
import { MacroContext } from '.';
import * as vega from 'vega';

export interface VegaProps extends MacroContext {
  spec: vega.Spec;
}

function Vega({ spec }: VegaProps) {
  if (!spec) {
    return <div style={{ color: 'red' }}>No Vega spec provided.</div>;
  }
  return <VegaComponent spec={spec} actions={false} />;
}

export default Vega;
