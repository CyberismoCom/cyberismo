// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { TopLevelSpec } from 'vega-lite';

export interface VegaLiteMacroInput {
  /**
   * Defines spec for vega-lite
   */
  spec: TopLevelSpec;
}
