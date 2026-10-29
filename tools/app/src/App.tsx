// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

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

const materialTheme = createTheme();

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
