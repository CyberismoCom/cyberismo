'use client'
import { TreeMenu } from '../components/TreeMenu'
import { usePathname } from 'next/navigation'
import AppToolbar from '../components/AppToolbar'
import { CssBaseline } from '@mui/material'

import {
  Stack,
  Box,
  CircularProgress,
  Typography,
  styled,
  Container,
} from '@mui/joy'
import { useProject } from '../lib/api'
import { SWRConfig } from 'swr'
import { getSwrConfig } from '../lib/swr'
import { ThemeProvider } from '@emotion/react'
import theme from '../theme'
import '../lib/i18n'
import {
  experimental_extendTheme as materialExtendTheme,
  Experimental_CssVarsProvider as MaterialCssVarsProvider,
  THEME_ID as MATERIAL_THEME_ID,
} from '@mui/material/styles'
import { CssVarsProvider as JoyCssVarsProvider } from '@mui/joy/styles'

function MainLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Last URL parameter after /cards base is the card key
  const urlParts = usePathname().slice(1).split('/')
  const urlCardKey = urlParts[0] == 'cards' ? urlParts[1] ?? null : null

  const { project, error, isLoading } = useProject()

  if (isLoading)
    return (
      <Box padding={2}>
        <CircularProgress size="md" color="primary" />
      </Box>
    )

  if (error || !project) {
    return (
      <Container>
        <Typography level="body-md" color="danger">
          Could not open project:
        </Typography>
        <Typography level="body-md" color="danger">
          {error.message}
        </Typography>
      </Container>
    )
  }
  return (
    <Stack direction="row" height="100%">
      <Box width="274px" flexShrink={0}>
        <TreeMenu project={project} selectedCardKey={urlCardKey} />
      </Box>
      <Box padding={2} flexGrow={1}>
        {children}
      </Box>
    </Stack>
  )
}

const Main = styled('main')(({ theme }) => ({
  height: 'calc(100vh - 44px)', // 44px is the height of the toolbar
  flexGrow: 1,
}))

const materialTheme = materialExtendTheme()

export default function CardsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <MaterialCssVarsProvider theme={{ [MATERIAL_THEME_ID]: materialTheme }}>
      <JoyCssVarsProvider>
        <CssBaseline enableColorScheme />
        <SWRConfig value={getSwrConfig()}>
          <ThemeProvider theme={theme}>
            <Stack>
              <AppToolbar />
              <Main>
                <MainLayout>{children}</MainLayout>
              </Main>
            </Stack>
          </ThemeProvider>
        </SWRConfig>
      </JoyCssVarsProvider>
    </MaterialCssVarsProvider>
  )
}
