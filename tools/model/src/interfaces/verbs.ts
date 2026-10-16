/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import type { Context } from './project-interfaces.js';

// Parameters of a report run; the card is the report's context.
export interface ReportParameters {
  cardKey: string;
  [key: string]: unknown;
}

// The version before and after a bump; no previous one on the first version.
export interface VersionBump {
  previousVersion: string | undefined;
  newVersion: string;
}

// A published (or, in a dry run, publishable) version.
export interface PublishResult {
  version: string;
  remote: string;
  dryRun: boolean;
}

// How and for which card content is rendered. A failing macro gives
// 'Macro error: <message>' followed by 'fallback' (the content by default).
export interface RenderOptions {
  cardKey: string;
  context: Context;
  mode: 'static' | 'inject' | 'staticSite';
  fallback?: string;
}

// Rendered content, and the macro failure it stands for, if any.
export interface RenderedContent {
  content: string;
  error?: string;
}

// A rendered PDF and the warnings asciidoctor-pdf reported while rendering.
export interface ExportedPdf {
  pdf: Uint8Array;
  warnings: string[];
}

// An AsciiDoc export: file contents by path relative to the export folder.
export type AdocFiles = { [path: string]: Uint8Array };
