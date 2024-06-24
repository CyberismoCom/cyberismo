'use client'
import { useState } from 'react'
import { TreeMenu } from '../components/TreeMenu'
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
import NewCardDialog from '../components/NewCardDialog'
import { useTemplates, useCard } from '../lib/api'
import ErrorBar from '../components/ErrorBar'
import { useCardKey, useError } from '../lib/utils'
import { useRouter } from 'next/navigation'
import { useTranslation } from 'react-i18next'

function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Last URL parameter after /cards base is the card key
  const urlCardKey = useCardKey()
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
      <Box padding={2} flexGrow={1} overflow="hidden">
        {children}
      </Box>
    </Stack>
  )
}

const Main = styled('main')(({ theme }) => ({
  height: 'calc(100vh - 44px)', // 44px is the height of the toolbar
  flexGrow: 1,
}))

function MainLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const { templates } = useTemplates()

  const urlCardKey = useCardKey()

  const { createCard, card } = useCard(urlCardKey)
  const { handleClose, reason, setError } = useError()
  const router = useRouter()
  const { t } = useTranslation()

  return (
    <Stack>
      <AppToolbar onNewCard={() => setIsCreateDialogOpen(true)} />
      <Main>
        <AppLayout>{children}</AppLayout>
      </Main>
      <NewCardDialog
        open={isCreateDialogOpen}
        onClose={() => setIsCreateDialogOpen(false)}
        templates={templates ?? []}
        onCreate={async (template) => {
          try {
            const cards = await createCard(template)
            if (cards && cards.length > 0) {
              router.push(`/cards/${cards[0]}`)
            }
          } catch (error) {
            if (error instanceof Error) setError(error.message)
          } finally {
            setIsCreateDialogOpen(false)
          }
        }}
        actionText={t('createUnder', { parent: card?.metadata?.summary })}
      />
      <ErrorBar error={reason} onClose={handleClose} />
    </Stack>
  )
}

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
            <MainLayout>{children}</MainLayout>
          </ThemeProvider>
        </SWRConfig>
      </JoyCssVarsProvider>
    </MaterialCssVarsProvider>
  )
}
