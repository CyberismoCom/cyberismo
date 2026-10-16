// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { extendTheme } from '@mui/joy/styles';

const theme = extendTheme({
  colorSchemes: {
    dark: {
      palette: {
        background: {
          body: '#0d1117',
          surface: '#161b22',
          level1: '#1c2128',
          level2: '#22272e',
        },
        neutral: {
          softBg: '#22272e',
        },
        primary: {
          // Lighter blues for better contrast on dark backgrounds
          500: '#58a6ff',
          600: '#79c0ff',
          700: '#a5d6ff',
        },
      },
    },
  },
});

export default theme;
