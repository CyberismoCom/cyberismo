'use client'
import { TreeMenu } from '../components/TreeMenu'
import { usePathname } from 'next/navigation'
import AppToolbar from '../components/AppToolbar'
import {
  Box,
  CircularProgress,
  Container,
  CssBaseline,
  Stack,
  Typography,
  styled,
} from '@mui/material'
import { useProject } from '../lib/api'
import { SWRConfig } from 'swr'
import { getSwrConfig } from '../lib/swr'
import { ThemeProvider } from '@emotion/react'
import theme from '../theme'
import '../lib/i18n'

function MainLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Last URL parameter after /cards base is the card key
  const urlParts = usePathname().slice(1).split('/')
  const urlCardKey = urlParts[0] == 'cards' ? urlParts[1] ?? null : null

  const { project, error, isLoading } = useProject()

  if (isLoading)
    return (
      <Box padding={2}>
        <CircularProgress size={60} color="primary" />
      </Box>
    )

  if (error || !project) {
    return (
      <Container>
        <Typography variant="h6" color="error">
          Could not open project:
        </Typography>
        <Typography variant="body1" color="error">
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
  height: 'calc(100vh - 64px)', // 64px is the height of the toolbar
  flexGrow: 1,
}))

export default function CardsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <SWRConfig value={getSwrConfig()}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Stack>
          <AppToolbar />
          <Main>
            <MainLayout>{children}</MainLayout>
          </Main>
        </Stack>
      </ThemeProvider>
    </SWRConfig>
  )
}
