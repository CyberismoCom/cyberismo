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
declare module 'string-pixel-width' {
  interface PixelWidthOptions {
    font?: string;
    size?: number;
    bold?: boolean;
    italic?: boolean;
  }
  function pixelWidth(text: string, options?: PixelWidthOptions): number;
  export default pixelWidth;
}
