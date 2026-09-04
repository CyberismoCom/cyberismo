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
import { useMemo } from 'react';
import { RouterProvider } from 'react-router';
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
import SessionExpiredBanner from './components/SessionExpiredBanner';
import { Notifications } from './components/Notifications';
import { CleanPrompt } from './components/CleanPrompt';
import './lib/i18n';
import { createAppRouter } from './routes';

// Material components (the icon set, mainly) resolve against the Material
// theme, not Joy's — a bare createTheme() ships MUI's default #1976d2 blue,
// which leaked into the UI as `color="primary"` icons. There is no blue in
// this design system, so the Material palette is pointed at the brand ink.
const materialTheme = createTheme({
  palette: {
    primary: {
      main: '#2A2A2A',
      light: '#3D4149',
      dark: '#17181A',
      contrastText: '#FBFAF8',
    },
  },
});

function App() {
  const router = useMemo(() => createAppRouter(), []);
  return (
    <ThemeProvider theme={{ [MATERIAL_THEME_ID]: materialTheme }}>
      <JoyCssVarsProvider
        theme={theme}
        defaultMode="system"
        modeStorageKey="cyberismo-color-scheme"
        disableNestedContext
      >
        <CssBaseline />
        <StoreProvider>
          <SessionExpiredBanner />
          <Notifications />
          <CleanPrompt />
          <SWRConfig value={getSwrConfig()}>
            <RouterProvider router={router} />
          </SWRConfig>
        </StoreProvider>
      </JoyCssVarsProvider>
    </ThemeProvider>
  );
}

export default App;
