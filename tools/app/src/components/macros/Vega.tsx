// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { VegaEmbed } from 'react-vega';
import type { MacroContext } from '.';
import type * as vega from 'vega';

export interface VegaProps extends MacroContext {
  spec: vega.Spec;
}

function Vega({ spec }: VegaProps) {
  if (!spec) {
    return <div style={{ color: 'red' }}>No Vega spec provided.</div>;
  }
  // ast: interpret expressions instead of compiling them, so CSP needs no 'unsafe-eval'.
  return <VegaEmbed spec={spec} options={{ actions: false, ast: true }} />;
}

export default Vega;
