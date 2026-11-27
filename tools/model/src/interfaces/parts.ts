// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { MacroName } from './macros.js';

/** The AsciiDoc macro, block and inline, that refers to a part by its id. */
export const PART_REFERENCE = 'cyberismo-part';
/** A part id: the full SHA-256 of the part, in lowercase hex. */
export const PART_ID_PATTERN = /^[0-9a-f]{64}$/;

/** An interactive macro the server evaluated and validated. */
export interface MacroPart {
  kind: 'macro';
  macro: MacroName;
  /** The validated options; the macro component's props. */
  options: Record<string, unknown>;
}

/** A piece of rendered content the server produced; one member per kind. */
export type RenderedPart = MacroPart;

/** The parts of one render, by id. */
export type RenderedParts = Record<string, RenderedPart>;
