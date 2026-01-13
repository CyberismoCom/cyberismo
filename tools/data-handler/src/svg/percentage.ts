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

interface PercentageOptions {
  title: string;
  value: number;
  legend: string;
  colour?: 'blue' | 'green' | 'yellow' | 'red' | 'orange' | 'purple';
}

const SIZE = 160;
const STROKE = 18;
const R = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * R;
const TITLE_HEIGHT = 70; // Space for the title above the donut
const EXTRA_WIDTH = 80; // Extra width for the title area
const SVG_WIDTH = SIZE + EXTRA_WIDTH;
// SVG_HEIGHT will be calculated dynamically below
const TITLE_FONT_SIZE = 22;
const VALUE_FONT_SIZE = 32;
const LEGEND_FONT_SIZE = 18;
const DONUT_COLOR_RED = '#b22217';
const TITLE_Y = 36;
const LINE_SPACING = 1.2;

/**
 * Splits a string into lines of up to maxLen characters, breaking at spaces.
 */
function wrapText(text: string, maxLen: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if ((current + (current ? ' ' : '') + word).length > maxLen) {
      if (current) lines.push(current);
      current = word;
    } else {
      current += (current ? ' ' : '') + word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Creates a percentage widget as an SVG
 * @param options - The options for the percentage
 * @returns The widget as an SVG
 */
export function percentage(options: PercentageOptions): string {
  const { title, value, legend, colour = 'blue' } = options;
  const offset = CIRC * (1 - value / 100);
  const DONUT_COLOR = colour === 'red' ? DONUT_COLOR_RED : colour;
  const titleLines = wrapText(title, 24);
  const donutYOffset =
    TITLE_Y +
    (titleLines.length - 1) * TITLE_FONT_SIZE * LINE_SPACING +
    TITLE_FONT_SIZE +
    24;
  const donutCenterY = donutYOffset + SIZE / 2 - TITLE_HEIGHT / 2;
  const dynamicSVGHeight = donutYOffset + SIZE / 2 + R + 20;
  return `
<svg width="${SVG_WIDTH}" height="${dynamicSVGHeight}" viewBox="0 0 ${SVG_WIDTH} ${dynamicSVGHeight}" xmlns="http://www.w3.org/2000/svg">
  <style>
    .percentage-text { fill: var(--joy-palette-text-primary, #333); }
    .percentage-legend { fill: var(--joy-palette-text-secondary, #666); }
  </style>
  <title>${title}</title>

  <!-- Visible Title (wrapped) -->
  <text class="percentage-text" x="${SVG_WIDTH / 2}" y="${TITLE_Y}" text-anchor="middle" font-size="${TITLE_FONT_SIZE}" font-weight="bold">
    ${titleLines.map((line, i) => `<tspan x='${SVG_WIDTH / 2}' dy='${i === 0 ? 0 : LINE_SPACING}em'>${line}</tspan>`).join('')}
  </text>

  <!-- Background track -->
  <circle cx="${SVG_WIDTH / 2}" cy="${donutCenterY}" r="${R}"
          fill="none" stroke="#eee" stroke-width="${STROKE}" />

  <!-- Progress arc -->
  <circle cx="${SVG_WIDTH / 2}" cy="${donutCenterY}" r="${R}"
          fill="none" stroke="${DONUT_COLOR}" stroke-width="${STROKE}"
          stroke-dasharray="${CIRC}" stroke-dashoffset="${offset}"
          stroke-linecap="butt"
          transform="rotate(-90 ${SVG_WIDTH / 2} ${donutCenterY})" />

  <!-- Numbers -->
  <text class="percentage-text" x="${SVG_WIDTH / 2}" y="${donutCenterY - 8}" text-anchor="middle" font-size="${VALUE_FONT_SIZE}" font-weight="bold">${value}%</text>
  <text class="percentage-legend" x="${SVG_WIDTH / 2}" y="${donutCenterY + 20}" text-anchor="middle" font-size="${LEGEND_FONT_SIZE}">${legend}</text>
</svg>
`;
}
