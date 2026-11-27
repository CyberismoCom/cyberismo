// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The door of this domain: api/ and the domains above it import it only
 * through here.
 */

export type { CheckedEffect, Trigger } from './effects/define.js';
export { setField } from './effects/setField.js';
export { transition } from './effects/transition.js';
export { runAction } from './execute.js';
export { quoted } from './facts.js';
export { effectRule, solveEffects } from './rows.js';
export { applyEffects, checkEffects, type ApplyOptions } from './run.js';
