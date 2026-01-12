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
import { measureTextWidth } from './lib.js';

// Padding on y-axis
const PADDING = 24;
// font used to estimate text width
const FONT_FAMILY = 'Helvetica';
const TITLE_SIZE = 16;
const VALUE_SIZE = 48;
const UNIT_SIZE = 24;
const CAPTION_SIZE = 14;
const UNIT_OFFSET = 3;
const LINE_GAP_TITLE = 16;
const LINE_GAP_CAPTION = 16;

/**
 * Options for the score card
 * @param title - The title of the score card
 * @param value - The value of the score card
 * @param unit - The unit of the score card
 * @param legend - The legend of the score card
 */
export interface ScoreCardOptions {
  value: number;
  title?: string;
  legend?: string;
  unit?: string;
}

/**
 * Creates an SVG score card
 * @param options - The options for the score card
 * @returns The SVG score card
 */
export function scoreCard(options: ScoreCardOptions): string {
  const { title = '', value, unit = '', legend = '' } = options;

  const titleWidth = measureTextWidth(title, FONT_FAMILY, TITLE_SIZE, false);
  const valueWidth = measureTextWidth(
    String(value),
    FONT_FAMILY,
    VALUE_SIZE,
    true,
  );
  const unitWidth = measureTextWidth(unit, FONT_FAMILY, UNIT_SIZE, false);
  const captionWidth = measureTextWidth(
    legend,
    FONT_FAMILY,
    CAPTION_SIZE,
    false,
  );

  const valueLineWidth = valueWidth + unitWidth + UNIT_OFFSET;
  const maxTextWidth = Math.max(titleWidth, valueLineWidth, captionWidth);

  const width = Math.ceil(maxTextWidth + PADDING * 2);

  const titleHeight = title.length > 0 ? TITLE_SIZE + LINE_GAP_TITLE : 0;
  const valueHeight = VALUE_SIZE;
  const captionHeight = legend.length > 0 ? CAPTION_SIZE + LINE_GAP_CAPTION : 0;

  const textBlockHeight = titleHeight + valueHeight + captionHeight;

  const height = Math.ceil(textBlockHeight + PADDING * 2);

  const svgContent = `<svg class="card" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <style>
      .scorecard-bg { fill: var(--joy-palette-background-surface, #fff); stroke: var(--joy-palette-divider, #dfe4ea); }
      .scorecard-title { fill: var(--joy-palette-text-primary, #001829); }
      .scorecard-value { fill: var(--joy-palette-text-primary, #333); }
      .scorecard-caption { fill: var(--joy-palette-text-tertiary, #999); }
    </style>
    <rect class="scorecard-bg" rx="8" ry="8" stroke-width="3" width="${width}" height="${height}"/>
    <g text-anchor="middle">
      <text class="scorecard-title" x="${width / 2}" y="${TITLE_SIZE / 2 + PADDING}" font-size="${TITLE_SIZE}" font-weight="400" dominant-baseline="middle">${title}</text>
      <text class="scorecard-value" x="${width / 2}" y="${titleHeight + VALUE_SIZE / 2 + PADDING}" font-size="${VALUE_SIZE}" font-weight="700" dominant-baseline="middle">${value}<tspan class="unit" font-size="${UNIT_SIZE}" font-weight="400" dx="${UNIT_OFFSET}">${unit}</tspan></text>
      <text class="scorecard-caption" x="${width / 2}" y="${titleHeight + valueHeight + LINE_GAP_CAPTION + CAPTION_SIZE / 2 + PADDING}" font-size="${CAPTION_SIZE}" font-weight="400" dominant-baseline="middle">${legend}</text>
    </g>
  </svg>`;

  return svgContent;
}
