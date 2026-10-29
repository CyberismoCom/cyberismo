// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

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
