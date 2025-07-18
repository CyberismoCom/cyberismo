/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2025
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/
import { RouterProvider } from 'react-router';
import { router } from './routes';
import { CssBaseline } from '@mui/joy';
import { SWRConfig } from 'swr';
import { getSwrConfig } from './lib/swr';
import theme from './theme';
import {
  createTheme,
  ThemeProvider,
  THEME_ID as MATERIAL_THEME_ID,
} from '@mui/material/styles';
import { CssVarsProvider as JoyCssVarsProvider } from '@mui/joy/styles';
import StoreProvider from './providers/StoreProvider';
import './lib/i18n';

const materialTheme = createTheme();

function App() {
  return (
    <ThemeProvider theme={{ [MATERIAL_THEME_ID]: materialTheme }}>
      <JoyCssVarsProvider theme={theme}>
        <CssBaseline />
        <StoreProvider>
          <SWRConfig value={getSwrConfig()}>
            <RouterProvider router={router} />
          </SWRConfig>
        </StoreProvider>
      </JoyCssVarsProvider>
    </ThemeProvider>
  );
}

export default App;
