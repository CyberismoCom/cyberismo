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
import { createImage } from '../macros/index.js';
import { ScoreCardOptions } from '../macros/scoreCard/index.js';
import pixelWidth from 'string-pixel-width';

const PADDING = 24;


const FONT_FAMILY = 'Helvetica';
const TITLE_SIZE = 16;
const VALUE_SIZE = 48;
const UNIT_SIZE = 24;
const CAPTION_SIZE = 14;
const UNIT_OFFSET = 3;
const LINE_GAP_1 = 16;
const LINE_GAP_2 = 16;

function measureTextWidth(text: string, font: string, size: number, bold = false): number {
  return pixelWidth(text, { font, size, bold });
}

export function createScoreCardSvg(options: ScoreCardOptions): string {
  const {
    title = 'Scorecard',
    value,
    unit = '%',
    legend = 'complete',
  } = options;

  // Measure text widths
  const titleWidth = measureTextWidth(title, FONT_FAMILY, TITLE_SIZE, false);
  const valueWidth = measureTextWidth(String(value), FONT_FAMILY, VALUE_SIZE, true);
  const unitWidth = measureTextWidth(unit, FONT_FAMILY, UNIT_SIZE, false);
  const captionWidth = measureTextWidth(legend, FONT_FAMILY, CAPTION_SIZE, false);

  const valueLineWidth = valueWidth + unitWidth + UNIT_OFFSET;
  const maxTextWidth = Math.max(titleWidth, valueLineWidth, captionWidth);

  // SVG width/height
  const W = Math.ceil(maxTextWidth + PADDING * 2);

  // Total text block height
  const textBlockHeight = TITLE_SIZE + LINE_GAP_1 + VALUE_SIZE + LINE_GAP_2 + CAPTION_SIZE;
  
  const H = Math.ceil(textBlockHeight + PADDING * 2);

  const svgContent = `<svg class="card" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <rect rx="8" ry="8" fill="#fff" stroke="#dfe4ea" stroke-width="3" width="${W}" height="${H}"/>
  <g text-anchor="middle">
    <text class="title" x="${W/2}" y="${TITLE_SIZE/2 + PADDING}" font-family="${FONT_FAMILY}" font-size="${TITLE_SIZE}" font-weight="400" fill="#001829" dominant-baseline="middle">${title}</text>
    <text class="value" x="${W/2}" y="${TITLE_SIZE + VALUE_SIZE/2 + PADDING + LINE_GAP_1}" font-family="${FONT_FAMILY}" font-size="${VALUE_SIZE}" font-weight="700" fill="#333" dominant-baseline="middle">${value}<tspan class="unit" font-size="${UNIT_SIZE}" font-weight="400" dx="${UNIT_OFFSET}">${unit}</tspan></text>
    <text class="caption" x="${W/2}" y="${TITLE_SIZE + VALUE_SIZE + CAPTION_SIZE/2 + PADDING + LINE_GAP_2}" font-family="${FONT_FAMILY}" font-size="${CAPTION_SIZE}" font-weight="400" fill="#999" dominant-baseline="middle">${legend}</text>
  </g>
</svg>`;

  // Convert SVG to base64 data URL for direct use in AsciiDoc image macro
  return createImage(Buffer.from(svgContent).toString('base64'), false);
}
