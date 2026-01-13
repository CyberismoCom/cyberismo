/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

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
